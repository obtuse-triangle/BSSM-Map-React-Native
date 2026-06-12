/**
 * Zustand store for BLE WCL (Weighted Centroid Localisation) state.
 *
 * This store is **independent** of the legacy `positionStore` and its
 * `IndoorPosition` (map-percent) type.  BLE WCL produces WGS84 lat/lng
 * coordinates directly — no map-percent conversion needed.
 *
 * ── Data flow ─────────────────────────────────────────────────────────
 *   continuous BLE scan → buffer → WCL → validate
 *       │
 *       └── If confidence > 0:
 *             → store.result + mapStore.setUserCoordinates({ longitude, latitude })
 *
 * @see bleWclProvider – the provider that executes the scan pipeline
 * @see mapStore       – receives the GPS marker when confidence is usable
 */

import { create } from 'zustand';
import type { BleWclResult, ArubaBleObservation } from '../services/location/bleWclProvider';
import type { EventSubscription } from 'expo-modules-core';
import { Platform } from 'react-native';
import { useMapStore } from './mapStore';
import { DeadReckoningEngine } from '../services/location/deadReckoning';
import { BleObservationBuffer } from '../services/location/bleObservations';
import { computePositionFromBuffer } from '../services/location/bleWclProvider';
import { CONTINUOUS_RECOMPUTE_INTERVAL_MS } from '../constants/bleConfig';
import { BLE_AP_FIXTURES } from '../constants/bleAccessPoints';
import { ParticleFusionEngine } from '../services/location/particleFusionEngine';
import type { FusionState, FusionBleObservation, FusionMotionEvent } from '../types/fusion';
import { getBleScanner } from '../services/location/bleScannerAdapter';
import type { BleScannerAdapter } from '../services/location/bleScannerAdapter';

type MotionUpdate = import('../../modules/ios-ble-positioning/src').MotionUpdate;

const DEBUG_WCL = __DEV__;

function wclLog(...args: unknown[]) {
  if (DEBUG_WCL) console.log('[BLE-WCL]', ...args);
}

function getIosBlePositioning() {
  if (Platform.OS !== 'ios') return null;
  try {
    return require('../../modules/ios-ble-positioning/src').IosBlePositioning;
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Store types
// ────────────────────────────────────────────────────────────────────────────

/** BLE WCL scan status */
export type BleWclScanStatus = 'idle' | 'scanning' | 'success' | 'error';

/**
 * Per-beacon aggregated statistics computed from real-time BLE observations.
 */
export interface BeaconStats {
  /** Stable identity (peripheral UUID + manufacturer data prefix). */
  bleIdentifier: string;
  /** Manufacturer ID (0x011B = 283 for HPE/Aruba). */
  manufacturerId: number;
  /** Total number of observations received. */
  observations: number;
  /** Minimum RSSI observed (dBm). */
  rssiMin: number;
  /** Maximum RSSI observed (dBm). */
  rssiMax: number;
  /** Running average RSSI (dBm). */
  rssiAvg: number;
  /** Epoch timestamp (ms) of the first observation. */
  firstSeen: number;
  /** Epoch timestamp (ms) of the most recent observation. */
  lastSeen: number;
  /** Average interval (ms) between consecutive advertisements from this beacon. */
  avgIntervalMs: number;
  /** Most recent RSSI value (dBm). */
  lastRssi: number;
}

/** Full store state shape */
type BleLocationStoreState = {
  /** Current scan status. */
  status: BleWclScanStatus;

  /** Last successful WCL estimate (null if no success yet). */
  result: BleWclResult | null;

  /** Human-readable error message when status is 'error'. */
  error: string | null;

  /** Raw BLE observations from the most recent scan (for debug display). */
  debugObservations: ArubaBleObservation[];

  /**
   * Scan duration in milliseconds.
   * Configurable; clamps to max 30 s for scan operations.
   * @default 10000
   */
  scanDurationMs: number;

  // ── Continuous (realtime) scan state ──────────────────────────────────

  /** Per-beacon aggregated statistics, keyed by bleIdentifier. */
  beaconStats: Record<string, BeaconStats>;

  /** Whether the continuous BLE scan is currently active. */
  isContinuousScanning: boolean;

  // ── Dead Reckoning state ──────────────────────────────────────

  /** Current DR estimated position (null if motion tracking not active). */
  drPosition: { lat: number; lng: number; confidence: number } | null;

  /** Steps since last BLE anchor reset. */
  drStepsSinceLastBle: number;

  /** Whether CoreMotion tracking is currently active. */
  isMotionActive: boolean;

  /** Estimated accumulated DR error in meters. */
  drErrorMeters: number;

  /** Current heading in degrees (0° = North, 90° = East), from CoreMotion. */
  currentHeading: number | null;

  /** Current fusion state (null if fusion not active). */
  fusionState: FusionState | null;

  /** Reason fusion is unavailable (null when fusion is active). */
  fusionUnavailableReason: string | null;

  /**
   * Reset to idle state.
   * Clears result, error, and stops the continuous scan if needed.
   */
  clearResult: () => void;

  dismissCard: () => void;

  /**
   * Update the default scan duration.
   * Clamped to [1000, 30000] ms.
   */
  setScanDurationMs: (ms: number) => void;

  // ── Continuous scan methods ──────────────────────────────────────────

  /**
   * Start continuous real-time BLE scanning.
   *
   * Calls the native `startContinuousArubaBleScan()` and subscribes to
   * `onArubaBleObservation` events.  Each observation updates the
   * per-beacon aggregated stats in `beaconStats`.
   *
   * On non-iOS platforms this is a no-op.
   */
  startContinuousScan: () => void;

  /**
   * Stop the continuous BLE scan and clear beacon stats.
   */
  stopContinuousScan: () => void;

  /**
   * Reset (clear) all accumulated beacon stats without stopping the scan.
   */
  clearBeaconStats: () => void;

  // ── Motion / Dead Reckoning methods ──────────────────────────

  /**
   * Start CoreMotion tracking + Dead Reckoning engine.
   * Subscribes to `onMotionUpdate` events and feeds them to the DR engine.
   * On non-iOS this is a no-op.
   */
  startMotionTracking: () => void;

  /** Stop CoreMotion tracking and clear DR state. */
  stopMotionTracking: () => void;

  /**
   * Reset the DR engine to a BLE anchor position.
   * Called automatically on successful BLE WCL result, but can also be called manually.
   */
  resetDrToBleAnchor: (lat: number, lng: number) => void;
};

// ────────────────────────────────────────────────────────────────────────────
// Module-level event subscription handle
// ────────────────────────────────────────────────────────────────────────────

let continuousScanSubscription: EventSubscription | null = null;
let continuousWclInterval: ReturnType<typeof setInterval> | null = null;
let continuousScanner: BleScannerAdapter | null = null;
const continuousBuffer = new BleObservationBuffer();
let motionSubscription: EventSubscription | null = null;
let drEngine: DeadReckoningEngine | null = null;
let fusionEngine: ParticleFusionEngine | null = null;
let lastMotionCumulativeSteps = 0;

// ────────────────────────────────────────────────────────────────────────────
// Store implementation
// ────────────────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Update (or create) the per-beacon aggregated stats with a new observation.
 * Mutable update on the stats object for performance (called frequently).
 */
function updateBeaconStats(
  stats: Record<string, BeaconStats>,
  obs: ArubaBleObservation,
): void {
  const existing = stats[obs.bleIdentifier];
  if (!existing) {
    stats[obs.bleIdentifier] = {
      bleIdentifier: obs.bleIdentifier,
      manufacturerId: obs.manufacturerId,
      observations: 1,
      rssiMin: obs.rssi,
      rssiMax: obs.rssi,
      rssiAvg: obs.rssi,
      firstSeen: obs.observedAt,
      lastSeen: obs.observedAt,
      avgIntervalMs: 0,
      lastRssi: obs.rssi,
    };
    return;
  }

  const interval = obs.observedAt - existing.lastSeen;

  // Running average RSSI
  const newCount = existing.observations + 1;
  const newRssiAvg =
    existing.rssiAvg + (obs.rssi - existing.rssiAvg) / newCount;

  // Running average interval (only meaningful after 2nd observation)
  const newAvgIntervalMs =
    existing.observations >= 1
      ? existing.avgIntervalMs +
        (interval - existing.avgIntervalMs) / newCount
      : 0;

  existing.observations = newCount;
  existing.rssiMin = Math.min(existing.rssiMin, obs.rssi);
  existing.rssiMax = Math.max(existing.rssiMax, obs.rssi);
  existing.rssiAvg = newRssiAvg;
  existing.lastSeen = obs.observedAt;
  existing.lastRssi = obs.rssi;
  existing.avgIntervalMs = newAvgIntervalMs;
}

function syncDetectedFloorKey(detectedFloorKey: string | null | undefined): void {
  if (!detectedFloorKey) return;

  const mapStore = useMapStore.getState();
  if (mapStore.selectedFloorKey !== detectedFloorKey) {
    wclLog(`Syncing selected floor to detected floor: ${mapStore.selectedFloorKey ?? 'null'} -> ${detectedFloorKey}`);
    mapStore.setSelectedFloorKey(detectedFloorKey);
  }
}

function setFusionUnavailableReason(
  reason: string,
  fusionEngineInstance: ParticleFusionEngine | null,
  setState: (partial: Partial<BleLocationStoreState> | ((state: BleLocationStoreState) => Partial<BleLocationStoreState>)) => void,
): void {
  if (fusionEngineInstance) {
    fusionEngineInstance.setUnavailableReason(reason);
    const fusionUpdate = fusionEngineInstance.getState();
    setState({ fusionState: fusionUpdate, fusionUnavailableReason: fusionUpdate.unavailableReason });
    return;
  }

  setState((state) => ({
    fusionUnavailableReason: reason,
    fusionState: state.fusionState ? { ...state.fusionState, unavailableReason: reason } : state.fusionState,
  }));
}

// ────────────────────────────────────────────────────────────────────────────
// Store implementation
// ────────────────────────────────────────────────────────────────────────────

export const useBleLocationStore = create<BleLocationStoreState>()((set, get) => ({
  status: 'idle',
  result: null,
  error: null,
  debugObservations: [],
  scanDurationMs: 10_000,
  beaconStats: {},
  isContinuousScanning: false,

  // ── Dead Reckoning initial state ──────────────────────────────
  drPosition: null,
  drStepsSinceLastBle: 0,
  isMotionActive: false,
  drErrorMeters: 0,
  currentHeading: null,
  fusionState: null,
  fusionUnavailableReason: null,

  clearResult: () => {
    set({ status: 'idle', result: null, error: null, debugObservations: [], fusionState: null, fusionUnavailableReason: null });
    fusionEngine = null;
    lastMotionCumulativeSteps = 0;
  },

  dismissCard: () => {
    set({ status: 'idle' });
  },

  setScanDurationMs: (ms) => {
    const clamped = Math.min(Math.max(ms, 1_000), 30_000);
    set({ scanDurationMs: clamped });
  },

  // ── Continuous scan ──────────────────────────────────────────────────

  startContinuousScan: () => {
    const { isContinuousScanning } = get();
    if (isContinuousScanning) return;

    const scanner = getBleScanner();
    if (!scanner) return;

    continuousScanSubscription = scanner.addListener(
      'onArubaBleObservation',
      (observation: ArubaBleObservation) => {
        wclLog(`Continuous obs: id=${observation.bleIdentifier} rssi=${observation.rssi} manuf=${observation.manufacturerId}`);
        continuousBuffer.addObservation({
          bleIdentifier: observation.bleIdentifier,
          manufacturerId: observation.manufacturerId,
          rssi: observation.rssi,
          payloadHex: observation.payloadHex,
          observedAt: observation.observedAt,
        });
        set((state) => {
          const next = { ...state.beaconStats };
          updateBeaconStats(next, observation);
          return { beaconStats: next };
        });
      },
    );

    scanner.startContinuousArubaBleScan();

    continuousScanner = scanner;

    set({
      isContinuousScanning: true,
      beaconStats: {},
      status: 'idle',
      result: null,
      error: null,
    });

    // 1Hz WCL position recomputation from buffer
    continuousWclInterval = setInterval(() => {
      const floorKey = useMapStore.getState().selectedFloorKey;
      if (!floorKey) return;

      wclLog(`Continuous WCL: floor="${floorKey}", buffer=${continuousBuffer.size}, fixtures=${BLE_AP_FIXTURES.length}`);
      const floorFixtures = BLE_AP_FIXTURES.filter((ap) => ap.floorKey === floorKey);
      const wclResult = computePositionFromBuffer(floorKey, continuousBuffer, BLE_AP_FIXTURES);
      if (wclResult && wclResult.confidence > 0) {
        wclLog(
          `Continuous WCL success: usedApCount=${wclResult.usedApCount} conf=${wclResult.confidence.toFixed(3)} detectedFloor=${wclResult.detectedFloorKey ?? 'null'}`,
        );
        set({ result: wclResult });
        syncDetectedFloorKey(wclResult.detectedFloorKey);
        if (!fusionEngine) {
          fusionEngine = new ParticleFusionEngine({ rngSeed: 42 });
        }
        const fusionBleObs: FusionBleObservation = {
          lat: wclResult.latitude,
          lng: wclResult.longitude,
          confidence: wclResult.confidence,
          floorKey: wclResult.detectedFloorKey ?? floorKey,
          accuracyMeters: wclResult.accuracyMeters,
          timestamp: Date.now(),
          apCount: wclResult.usedApCount,
        };
        if (fusionEngine.getState().confidenceLevel === 'unknown' && fusionEngine.getState().particleCount === 0) {
          fusionEngine.resetFromBle(fusionBleObs);
        } else {
          fusionEngine.applyBleCorrection(fusionBleObs);
        }
        const fusionUpdate = fusionEngine.getState();
        set({ fusionState: fusionUpdate, fusionUnavailableReason: fusionUpdate.unavailableReason });

        if (fusionUpdate.confidenceLevel !== 'unknown' && useMapStore.getState().bleTrackingEnabled) {
          useMapStore.getState().setBleCoordinates({
            longitude: fusionUpdate.lng,
            latitude: fusionUpdate.lat,
          });
        }
        if (get().isMotionActive) {
          wclLog(`DR anchor reset to BLE position: (${wclResult.latitude.toFixed(6)}, ${wclResult.longitude.toFixed(6)})`);
          get().resetDrToBleAnchor(wclResult.latitude, wclResult.longitude);
        }
      } else {
        const unavailableReason = floorFixtures.length === 0
          ? 'no_ap_fixtures_for_floor'
          : 'insufficient_ble_evidence';
        wclLog(`Continuous WCL: no result (${unavailableReason})`);
        setFusionUnavailableReason(unavailableReason, fusionEngine, set);
      }
    }, CONTINUOUS_RECOMPUTE_INTERVAL_MS);
  },

  stopContinuousScan: () => {
    if (continuousScanSubscription) {
      continuousScanSubscription.remove();
      continuousScanSubscription = null;
    }

    if (continuousWclInterval) {
      clearInterval(continuousWclInterval);
      continuousWclInterval = null;
    }
    continuousBuffer.clear();

    if (continuousScanner) {
      try {
        continuousScanner.stopArubaBleScan();
      } catch {
        // Native method may not be available on all builds; ignore
      }
      continuousScanner = null;
    }

    set({ isContinuousScanning: false });
  },

  clearBeaconStats: () => {
    set({ beaconStats: {} });
  },

  // ── Motion / Dead Reckoning ──────────────────────────────────

  startMotionTracking: () => {
    const { isMotionActive } = get();
    if (isMotionActive) return;
    if (Platform.OS !== 'ios') return;

    const IosBlePositioning = getIosBlePositioning();
    if (!IosBlePositioning) return;

    drEngine = new DeadReckoningEngine();
    lastMotionCumulativeSteps = 0;

    motionSubscription = IosBlePositioning.addListener(
      'onMotionUpdate',
      (update: MotionUpdate) => {
        if (!drEngine) return;
        // Store heading from every motion update (0° = North, 90° = East)
        const pos = drEngine.getPosition();
        if (pos.stepsSinceLastBle === 0 && get().drPosition === null) {
          // No anchor set yet — skip step processing but still store heading
          set({ currentHeading: update.heading });
          return;
        }
        drEngine.updateStep(update.heading);
        const newPos = drEngine.getPosition();
        set({
          currentHeading: update.heading,
          drPosition: { lat: newPos.lat, lng: newPos.lng, confidence: newPos.confidence },
          drStepsSinceLastBle: newPos.stepsSinceLastBle,
          drErrorMeters: drEngine.cumulativeErrorMeters,
        });

        if (fusionEngine) {
          if (lastMotionCumulativeSteps === 0) {
            lastMotionCumulativeSteps = update.steps;
            return;
          }
          const currentSteps = update.steps;
          const stepDelta = currentSteps - lastMotionCumulativeSteps;
          if (stepDelta > 0) {
            const fusionMotion: FusionMotionEvent = {
              steps: stepDelta,
              heading: update.heading,
              userAccelerationMagnitude: update.userAccelerationMagnitude,
              timestamp: update.timestamp,
            };
            fusionEngine.applyMotion(fusionMotion);
            const fusionUpdate = fusionEngine.getState();
            set({ fusionState: fusionUpdate });
            if (fusionUpdate.confidenceLevel !== 'unknown' && useMapStore.getState().bleTrackingEnabled) {
              useMapStore.getState().setBleCoordinates({
                longitude: fusionUpdate.lng,
                latitude: fusionUpdate.lat,
              });
            }
          }
          lastMotionCumulativeSteps = currentSteps;
        }
      },
    );

    IosBlePositioning.startMotionUpdates();
    set({ isMotionActive: true });
  },

  stopMotionTracking: () => {
    if (motionSubscription) {
      motionSubscription.remove();
      motionSubscription = null;
    }
    if (Platform.OS === 'ios') {
      const IosBlePositioning = getIosBlePositioning();
      if (IosBlePositioning) {
        try {
          IosBlePositioning.stopMotionUpdates();
        } catch {
          // Native method may not be available
        }
      }
    }
    drEngine = null;
    fusionEngine = null;
    lastMotionCumulativeSteps = 0;
    set({ isMotionActive: false, drPosition: null, drStepsSinceLastBle: 0, drErrorMeters: 0, currentHeading: null });
  },

  resetDrToBleAnchor: (lat: number, lng: number) => {
    if (!drEngine) return;
    drEngine.reset(lat, lng);
    const pos = drEngine.getPosition();
    wclLog(`DR anchor reset to BLE position: (${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)})`);
    set({
      drPosition: { lat: pos.lat, lng: pos.lng, confidence: pos.confidence },
      drStepsSinceLastBle: 0,
      drErrorMeters: 0,
    });
  },
}));
