/**
 * BLE WCL (Weighted Centroid Localisation) provider.
 *
 * Orchestrates the end-to-end pipeline:
 *   Native BLE scan → observation buffer → WCL centroid → coordinate validation → store update
 *
 * ── Design ────────────────────────────────────────────────────────────
 * 1. This provider runs **only on iOS** (the `IosBlePositioning` native
 *    module is iOS-only).  Non-iOS callers receive a `Platform.OS` error.
 *
 * 2. A single `BleObservationBuffer` instance is held for the lifetime of
 *    the app.  Observations accumulate across multiple scan calls and are
 *    pruned by age (120 s default) on each access.
 *
 * 3. **BLE_AP_FIXTURES** is used as the AP location catalogue until real
 *    EPSG:5183 survey data is received.  Replace `BLE_AP_FIXTURES` with
 *    real data once available (see `src/constants/bleAccessPoints.ts`).
 *
 * 4. Coordinate guardrails:
 *    - Reject NaN / Infinity / -Infinity
 *    - Reject coordinates outside `CAMPUS_BOUNDS`
 *
 * @see computeBleWeightedCentroid  – the pure WCL function this calls
 * @see BleObservationBuffer        – rolling observation store
 * @see BLE_AP_FIXTURES             – placeholder AP catalogue
 */

import { Platform } from 'react-native';
import type { ArubaBleObservation } from '../../../modules/ios-ble-positioning/src';
import { BleObservationBuffer } from './bleObservations';
import type { BleApObservation } from './bleObservations';
import { computeBleWeightedCentroid } from './bleWeightedCentroid';
import type { BleWeightedCentroidResult, BleObservation } from './bleWeightedCentroid';
import { BLE_AP_FIXTURES } from '../../constants/bleAccessPoints';
import { CAMPUS_BOUNDS } from '../../constants/campusBounds';
import { MAX_SAMPLE_AGE_MS } from '../../constants/bleConfig';
import type { FloorKey } from '../../types/floorMap';
import type { BleAccessPoint5183 } from '../../types/bleAccessPoint';
import type { BleApContribution } from './bleWeightedCentroid';

const DEBUG_WCL = __DEV__;

function wclLog(...args: unknown[]) {
  if (DEBUG_WCL) console.log('[BLE-WCL]', ...args);
}

export type { ArubaBleObservation } from '../../../modules/ios-ble-positioning/src';

// ────────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────────

/**
 * A successful BLE WCL position estimate.
 *
 * Used by `bleLocationStore` for its own state and, when `confidence > 0`,
 * forwarded to `mapStore.userCoordinates` as a GPS marker.
 */
export interface BleWclResult {
  /** Fixed source tag for downstream filtering. */
  source: 'BLE-WCL';

  /** WGS84 longitude (decimal degrees). */
  longitude: number;

  /** WGS84 latitude (decimal degrees). */
  latitude: number;

  /** Confidence in [0, 1]; 0 = unreliable. */
  confidence: number;

  /** Weighted standard deviation of AP distances from centroid (metres). */
  accuracyMeters: number;

  /** Number of AP/observation pairs that passed filtering. */
  usedApCount: number;

  apContributions?: BleApContribution[];

  /**
   * Total stale observations:
   *   buffer pre-prune stale count + WCL-internal stale sample count
   */
  staleSampleCount: number;

  /**
   * Age of the **freshest** (most recent) observation in the buffer
   * at the time the scan completed (ms).
   */
  latestSampleAgeMs: number;

  /** Epoch timestamp (ms) when the centroid was computed. */
  computedAt: number;

  /** Detected floor key inferred from the current BLE buffer, if any. */
  detectedFloorKey?: FloorKey | null;
}

/** Discriminated result of `performScan`. */
export type BleWclScanResult =
  | { status: 'success'; result: BleWclResult; rawObservations: ArubaBleObservation[] }
  | { status: 'error'; error: string; rawObservations?: ArubaBleObservation[] };

// ────────────────────────────────────────────────────────────────────────────
// Provider class
// ────────────────────────────────────────────────────────────────────────────

class BleWclProvider {
  /** Rolling observation buffer (maxAge 120 s, ~50 APs max). */
  private readonly buffer: BleObservationBuffer;

  constructor() {
    // Default maxAgeMs = MAX_SAMPLE_AGE_MS (120 s, same as WCL default maxAgeSeconds).
    this.buffer = new BleObservationBuffer(MAX_SAMPLE_AGE_MS);
  }

  // ── Public API ───────────────────────────────────────────────────────

  /**
   * Execute one BLE WCL scan cycle.
   *
   * 1. Guard: iOS only
   * 2. Native Aruba BLE scan for `durationMs`
   * 3. Feed raw observations into the rolling buffer
   * 4. Prune stale entries & convert to WCL input format
   * 5. Compute weighted centroid
   * 6. Validate output coordinates (finite + campus bounds)
   * 7. Return typed result
   */
  async performScan(floorKey: FloorKey, durationMs: number): Promise<BleWclScanResult> {
    // ── iOS guard ────────────────────────────────────────────────────
    if (Platform.OS !== 'ios') {
      return {
        status: 'error',
        error: `BLE WCL scanning requires iOS; current platform: ${Platform.OS}`,
      };
    }

    try {
      // ── Native method guard ──────────────────────────────────────────
      if (typeof (require('../../../modules/ios-ble-positioning/src') as any).IosBlePositioning?.startArubaBleScan !== 'function') {
        return {
          status: 'error',
          error: 'BLE WCL scan requires a native rebuild — startArubaBleScan is not available. Run `npx expo run:ios --device` to rebuild.',
        };
      }

      // ── 1. Native scan ──────────────────────────────────────────────
      const IosBlePositioning = (require('../../../modules/ios-ble-positioning/src') as any).IosBlePositioning;
      const rawObservations: ArubaBleObservation[] =
        await IosBlePositioning.startArubaBleScan(durationMs);

      wclLog(`Native scan complete: ${rawObservations.length} raw observations`);
      if (DEBUG_WCL && rawObservations.length > 0) {
        const ids = rawObservations.map((o) => o.bleIdentifier);
        wclLog('Raw bleIdentifiers:', [...new Set(ids)].join(', '));
      }

      if (rawObservations.length === 0) {
        return {
          status: 'error',
          error: 'No BLE observations received during scan window',
          rawObservations: [],
        };
      }

      // ── 2. Feed into buffer ─────────────────────────────────────────
      for (const obs of rawObservations) {
        this.buffer.addObservation(this.toBleApObservation(obs));
      }

      // ── 3. Snapshot metadata BEFORE pruning ─────────────────────────
      const prePruneMeta = this.buffer.getMetadata();
      wclLog(`Buffer: ${this.buffer.size} entries, pre-prune metadata:`, JSON.stringify(prePruneMeta));

      // ── 4. Get pruned observations & convert to WCL format ──────────
      const latestByAp = this.buffer.latestByAp();
      wclLog(`Latest by AP: ${latestByAp.size} unique beacons`);
      if (latestByAp.size === 0) {
        return {
          status: 'error',
          error: 'All BLE observations are stale after age-based pruning',
          rawObservations,
        };
      }

      const wclObservations: BleObservation[] = [];
      let minAgeMs = Number.POSITIVE_INFINITY;
      const now = Date.now();

      for (const [, obs] of latestByAp) {
        wclObservations.push({
          bleIdentifier: obs.bleIdentifier,
          rssi: obs.rssi,
          observedAt: obs.observedAt,
          floorKey,
        });

        // Compute latestSampleAgeMs inline (youngest observation age)
        const age = now - obs.observedAt;
        if (age < minAgeMs) {
          minAgeMs = age;
        }
      }

      // ── 5. Compute WCL centroid ─────────────────────────────────────
      wclLog(`Calling WCL with floorKey="${floorKey}", ${wclObservations.length} observations, ${BLE_AP_FIXTURES.length} fixtures`);
      const wclResult: BleWeightedCentroidResult = computeBleWeightedCentroid(
        BLE_AP_FIXTURES,
        wclObservations,
        { now },
      );

      if ('reason' in wclResult) {
        wclLog(`WCL returned INSUFFICIENT_APS`);
        return {
          status: 'error',
          error: `INSUFFICIENT_APS: Fewer than 3 valid AP/observation pairs after filtering`,
          rawObservations,
        };
      }

      // ── 6. Validate output coordinates ──────────────────────────────
      const validationError = this.validateCoordinates(
        wclResult.longitude,
        wclResult.latitude,
      );
      if (validationError !== null) {
        wclLog(`Coordinate validation failed: ${validationError}`);
        return { status: 'error', error: validationError, rawObservations };
      }

      // ── 7. Build & return success result ────────────────────────────
      const latestSampleAgeMs = Number.isFinite(minAgeMs) ? minAgeMs : 0;

      wclLog(`Scan success: usedApCount=${wclResult.usedApCount}, confidence=${wclResult.confidence.toFixed(3)}, accuracy=${wclResult.accuracyMeters.toFixed(1)}m`);
      if (wclResult.detectedFloorKey) {
        wclLog(`Detected floor key: ${wclResult.detectedFloorKey}`);
      }

      return {
        status: 'success',
        result: {
          source: 'BLE-WCL',
          longitude: wclResult.longitude,
          latitude: wclResult.latitude,
          confidence: wclResult.confidence,
          accuracyMeters: wclResult.accuracyMeters,
          usedApCount: wclResult.usedApCount,
          apContributions: wclResult.apContributions,
          staleSampleCount: prePruneMeta.staleCount + wclResult.staleSampleCount,
          latestSampleAgeMs,
          computedAt: wclResult.computedAt,
          detectedFloorKey: wclResult.detectedFloorKey ?? null,
        },
        rawObservations,
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unrecoverable BLE WCL scan error';
      return { status: 'error', error: message };
    }
  }

  /**
   * Reset the observation buffer (e.g. when changing floors).
   */
  clearBuffer(): void {
    this.buffer.clear();
  }

  /**
   * Current number of observations held in the buffer.
   */
  get bufferSize(): number {
    return this.buffer.size;
  }

  // ── Private helpers ─────────────────────────────────────────────────

  /**
   * Convert a native `ArubaBleObservation` into the buffer's
   * `BleApObservation` format.
   */
  private toBleApObservation(obs: ArubaBleObservation): BleApObservation {
    return {
      bleIdentifier: obs.bleIdentifier,
      manufacturerId: obs.manufacturerId,
      rssi: obs.rssi,
      payloadHex: obs.payloadHex,
      observedAt: obs.observedAt,
    };
  }

  /**
   * Validate a WGS84 coordinate pair.
   *
   * Returns a human-readable error message or `null` if the coordinates
   * are acceptable.
   */
  private validateCoordinates(longitude: number, latitude: number): string | null {
    // ── Finite check ────────────────────────────────────────────────
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      return `Invalid coordinates: longitude=${longitude}, latitude=${latitude}`;
    }

    // ── Campus bounds check ─────────────────────────────────────────
    const { minLongitude, maxLongitude, minLatitude, maxLatitude } = CAMPUS_BOUNDS;

    if (
      longitude < minLongitude ||
      longitude > maxLongitude ||
      latitude < minLatitude ||
      latitude > maxLatitude
    ) {
      return (
        `Coordinates [${longitude}, ${latitude}] are outside campus bounds ` +
        `[lon: ${minLongitude}..${maxLongitude}, lat: ${minLatitude}..${maxLatitude}]`
      );
    }

    return null;
  }
}

// ── Singleton export ─────────────────────────────────────────────────────

/**
 * Application-wide BLE WCL provider singleton.
 *
 * Import this in `bleLocationStore` to execute scans and obtain results.
 */
export const bleWclProvider = new BleWclProvider();

// ── Standalone buffer-based computation (no native scan) ──────────────────

/**
 * Compute WCL position from the given observation buffer without triggering
 * a native BLE scan.
 *
 * This is a synchronous pipeline intended for continuous real-time positioning:
 * it prunes stale observations, fetches the latest sample per AP, matches them
 * to AP fixture records by floor and identity, and runs the weighted-centroid
 * algorithm with time-decayed freshness weighting.
 *
 * @param floorKey   - Floor identifier (e.g. '1', '2', '3').
 * @param buffer     - `BleObservationBuffer` instance holding current observations.
 * @param apFixtures - AP fixture records for the building.
 * @returns A `BleWclResult` on success, or `null` if insufficient valid AP
 *          observations are available after filtering.
 */
export function computePositionFromBuffer(
  floorKey: FloorKey,
  buffer: BleObservationBuffer,
  apFixtures: readonly BleAccessPoint5183[],
): BleWclResult | null {
  wclLog(`computePositionFromBuffer: floor="${floorKey}", buffer=${buffer.size}, fixtures=${apFixtures.length}`);
  // ── 1. Prune stale observations ──────────────────────────────────────
  const bufferStaleCount = buffer.pruneStale();

  // ── 2. Get the latest observation per AP ─────────────────────────────
  const latestByAp = buffer.latestByAp();
  if (latestByAp.size === 0) {
    return null;
  }

  // ── 3. Convert to WCL observation format ─────────────────────────────
  const wclObservations: BleObservation[] = [];
  let minAgeMs = Number.POSITIVE_INFINITY;
  const now = Date.now();

  for (const [, obs] of latestByAp) {
    wclObservations.push({
      bleIdentifier: obs.bleIdentifier,
      rssi: obs.rssi,
      observedAt: obs.observedAt,
      floorKey,
    });

    const age = now - obs.observedAt;
    if (age < minAgeMs) {
      minAgeMs = age;
    }
  }

  // ── 4. Compute WCL centroid with freshness weighting ─────────────────
  const wclResult = computeBleWeightedCentroid(
    apFixtures,
    wclObservations,
    { enableFreshnessWeighting: true },
  );

  wclLog(
    `computePositionFromBuffer WCL result:`,
    'reason' in wclResult
      ? wclResult.reason
      : `usedApCount=${wclResult.usedApCount}, detectedFloorKey=${wclResult.detectedFloorKey ?? 'null'}`,
  );

  if ('reason' in wclResult) {
    return null;
  }

  // ── 5. Validate coordinates ─────────────────────────────────────────
  const { minLongitude, maxLongitude, minLatitude, maxLatitude } = CAMPUS_BOUNDS;
  if (
    !Number.isFinite(wclResult.longitude) ||
    !Number.isFinite(wclResult.latitude) ||
    wclResult.longitude < minLongitude ||
    wclResult.longitude > maxLongitude ||
    wclResult.latitude < minLatitude ||
    wclResult.latitude > maxLatitude
  ) {
    return null;
  }

  // ── 6. Build & return success result ─────────────────────────────────
  return {
    source: 'BLE-WCL',
    longitude: wclResult.longitude,
    latitude: wclResult.latitude,
    confidence: wclResult.confidence,
    accuracyMeters: wclResult.accuracyMeters,
    usedApCount: wclResult.usedApCount,
    apContributions: wclResult.apContributions,
    staleSampleCount: bufferStaleCount + wclResult.staleSampleCount,
    latestSampleAgeMs: Number.isFinite(minAgeMs) ? minAgeMs : 0,
    computedAt: wclResult.computedAt,
    detectedFloorKey: wclResult.detectedFloorKey ?? null,
  };
}
