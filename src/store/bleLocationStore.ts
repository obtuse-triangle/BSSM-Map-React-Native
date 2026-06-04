/**
 * Zustand store for BLE WCL (Weighted Centroid Localisation) state.
 *
 * This store is **independent** of the legacy `positionStore` and its
 * `IndoorPosition` (map-percent) type.  BLE WCL produces WGS84 lat/lng
 * coordinates directly — no map-percent conversion needed.
 *
 * ── Data flow ─────────────────────────────────────────────────────────
 *   `startBleWclScan(floorKey)`
 *       │
 *       ▼
 *   bleWclProvider.performScan(floorKey, durationMs)
 *       │  native scan → buffer → WCL → validate
 *       ▼
 *   Store state updated (status / result / error)
 *       │
 *       ├── If success & confidence > 0:
 *       │     → mapStore.setUserCoordinates({ longitude, latitude })
 *       │
 *       └── If error or low confidence:
 *             → mapStore.userCoordinates remains unchanged
 *
 * @see bleWclProvider – the provider that executes the scan pipeline
 * @see mapStore       – receives the GPS marker when confidence is usable
 */

import { create } from 'zustand';
import type { FloorKey } from '../types/floorMap';
import { bleWclProvider } from '../services/location/bleWclProvider';
import type { BleWclResult, BleWclScanResult, ArubaBleObservation } from '../services/location/bleWclProvider';
import type { EventSubscription } from 'expo-modules-core';
import { Platform } from 'react-native';
import { useMapStore } from './mapStore';
import { DeadReckoningEngine } from '../services/location/deadReckoning';
import { BleObservationBuffer } from '../services/location/bleObservations';
import { computePositionFromBuffer } from '../services/location/bleWclProvider';
import { CONTINUOUS_RECOMPUTE_INTERVAL_MS } from '../constants/bleConfig';
import { BLE_AP_FIXTURES } from '../constants/bleAccessPoints';

type MotionUpdate = import('../../modules/ios-ble-positioning/src').MotionUpdate;

function getIosBlePositioning() {
  if (Platform.OS !== 'ios') return null;
  try {
    return require('../../modules/ios-ble-positioning/src').IosBlePositioning as any;
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
   * Configurable; clamps to max 30 s inside `startBleWclScan`.
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

  /**
   * Initiate a BLE WCL scan on the given floor.
   *
   * Sets status → `'scanning'`, calls the provider, then updates state:
   *   - On success: `'success'` + result
   *   - On failure: `'error'` + error message
   *
   * When the result has `confidence > 0`, the GPS marker in `mapStore`
   * is also updated.
   *
   * @param floorKey   – The floor to scan on.
   * @param durationMs – Override scan duration (clamped to 30 s max).
   */
  startBleWclScan: (floorKey: FloorKey, durationMs?: number) => Promise<void>;

  /**
   * Reset to idle state.
   * Clears result, error, and sets status back to `'idle'`.
   * Does **not** clear the provider's observation buffer
   * (call `bleWclProvider.clearBuffer()` separately if needed).
   */
  clearResult: () => void;

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
const continuousBuffer = new BleObservationBuffer();
let motionSubscription: EventSubscription | null = null;
let drEngine: DeadReckoningEngine | null = null;

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

  startBleWclScan: async (floorKey, durationMs) => {
    // Clamp to [1 000, 30 000] ms
    const effectiveDuration = Math.min(
      Math.max(durationMs ?? get().scanDurationMs, 1_000),
      30_000,
    );

    // Mark as scanning before the async operation
    set({ status: 'scanning', error: null, result: null, debugObservations: [] });

    try {
      const scanResult: BleWclScanResult = await bleWclProvider.performScan(
        floorKey,
        effectiveDuration,
      );

      if (scanResult.status === 'success') {
        // Update BLE store state
        set({
          status: 'success',
          result: scanResult.result,
          error: null,
          debugObservations: scanResult.rawObservations,
        });

        // Forward to mapStore GPS marker ONLY when confidence is usable
        if (scanResult.result.confidence > 0) {
          useMapStore.getState().setUserCoordinates({
            longitude: scanResult.result.longitude,
            latitude: scanResult.result.latitude,
          });
          // Auto-reset Dead Reckoning to BLE position
          get().resetDrToBleAnchor(scanResult.result.latitude, scanResult.result.longitude);
        }
      } else {
        // Error: preserve mapStore coordinates (DO NOT overwrite)
        set({
          status: 'error',
          result: null,
          error: scanResult.error,
          debugObservations: scanResult.rawObservations ?? [],
        });
      }
    } catch (err) {
      // Unexpected exception during scan
      const message =
        err instanceof Error ? err.message : 'Unknown BLE WCL scan error';
      set({
        status: 'error',
        result: null,
        error: message,
      });
    }
  },

  clearResult: () => {
    get().stopContinuousScan();
    set({ status: 'idle', result: null, error: null, debugObservations: [] });
  },

  setScanDurationMs: (ms) => {
    const clamped = Math.min(Math.max(ms, 1_000), 30_000);
    set({ scanDurationMs: clamped });
  },

  // ── Continuous scan ──────────────────────────────────────────────────

  startContinuousScan: () => {
    const { isContinuousScanning } = get();
    if (isContinuousScanning) return;

    if (Platform.OS !== 'ios') return;

    const IosBlePositioning = getIosBlePositioning();
    if (!IosBlePositioning) return;

    continuousScanSubscription = IosBlePositioning.addListener(
      'onArubaBleObservation',
      (observation: ArubaBleObservation) => {
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

    // Start native continuous scan
    IosBlePositioning.startContinuousArubaBleScan();

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

      const wclResult = computePositionFromBuffer(floorKey, continuousBuffer, BLE_AP_FIXTURES);
      if (wclResult && wclResult.confidence > 0) {
        set({ result: wclResult });
        useMapStore.getState().setUserCoordinates({
          longitude: wclResult.longitude,
          latitude: wclResult.latitude,
        });
        if (get().isMotionActive) {
          get().resetDrToBleAnchor(wclResult.latitude, wclResult.longitude);
        }
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

    if (Platform.OS === 'ios') {
      const IosBlePositioning = getIosBlePositioning();
      if (IosBlePositioning) {
        try {
          IosBlePositioning.stopArubaBleScan();
        } catch {
          // Native method may not be available on all builds; ignore
        }
      }
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
    set({ isMotionActive: false, drPosition: null, drStepsSinceLastBle: 0, drErrorMeters: 0, currentHeading: null });
  },

  resetDrToBleAnchor: (lat: number, lng: number) => {
    if (!drEngine) return;
    drEngine.reset(lat, lng);
    const pos = drEngine.getPosition();
    set({
      drPosition: { lat: pos.lat, lng: pos.lng, confidence: pos.confidence },
      drStepsSinceLastBle: 0,
      drErrorMeters: 0,
    });
  },
}));
