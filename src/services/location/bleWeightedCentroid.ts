import type { BleAccessPoint5183 } from '../../types/bleAccessPoint';
import type { FloorKey } from '../../types/floorMap';
import { transformEpsg5183ToWgs84 } from '../../utils/coordinateTransform';
import {
  MANUFACTURER_ID_ARUBA,
  MIN_AP_COUNT,
  RSSI_THRESHOLD_DBM,
  MAX_SAMPLE_AGE_MS,
  DECAY_TAU_MS,
} from '../../constants/bleConfig';

// ────────────────────────────────────────────────────────────────────────────
// Input types
// ────────────────────────────────────────────────────────────────────────────

/**
 * A single BLE scan observation from the device.
 * Each observation represents one heard beacon advertisement.
 */
export interface BleObservation {
  /** BLE identifier to match against BleAccessPoint5183.bleIdentifier */
  bleIdentifier: string;

  /** RSSI in dBm (e.g. -65).  Higher (less-negative) values = stronger signal. */
  rssi: number;

  /** Observation timestamp – epoch milliseconds (e.g. Date.now()). */
  observedAt: number;

  /** Floor key the observation was collected on. */
  floorKey: FloorKey;
}

/**
 * Optional configuration for the weighted-centroid algorithm.
 * Every field has a sensible default so callers can pass `undefined`.
 */
export interface BleWeightedCentroidOptions {
  /**
   * Expected manufacturer (IEEE OUI) ID to filter APs.
   * HPE / Aruba = 0x011B (decimal 283).
   * @default 0x011B
   */
  expectedManufacturerId?: number;

  /**
   * RSSI threshold in dBm.  Observations with RSSI **strictly below**
   * this value are rejected before the minimum-count check.
   * @default -90
   */
  rssiThreshold?: number;

  /**
   * Maximum age of an observation **in seconds**.  Samples older than
   * this are counted in `staleSampleCount` and rejected.
   * @default 120
   */
  maxAgeSeconds?: number;

  /**
   * When `true`, multiply `baseWeight` by an exponential freshness factor
   * so that older samples carry less weight.
   *
   * `freshnessWeight = exp(-ageMs / DECAY_TAU_MS)`
   *
   * Multiplication is applied **after** the baseline RSSI weight.
   * @default true
   */
  enableFreshnessWeighting?: boolean;

  /**
   * Override "now" timestamp (epoch ms).  Pass this in tests for
   * deterministic results.  Falls back to `Date.now()`.
   */
  now?: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Result types (discriminated union)
// ────────────────────────────────────────────────────────────────────────────

export interface BleWeightedCentroidSuccess {
  /** WGS84 longitude (decimal degrees). */
  longitude: number;
  /** WGS84 latitude (decimal degrees). */
  latitude: number;

  /**
   * Confidence estimate in [0, 1].
   *   - 1.0 = very confident (many strong APs tightly clustered)
   *   - 0.0 = no confidence
   */
  confidence: number;

  /**
   * Estimated accuracy in metres – computed as the weighted standard
   * deviation of AP distances from the centroid (EPSG:5183 space).
   * Smaller values = tighter cluster = higher expected accuracy.
   */
  accuracyMeters: number;

  /** Number of AP/observation pairs that passed all filters. */
  usedApCount: number;

  /** Number of observations rejected because they exceeded `maxAgeSeconds`. */
  staleSampleCount: number;

  /** Timestamp (epoch ms) when the result was computed. */
  computedAt: number;
}

export interface BleWeightedCentroidFailure {
  /**
   * Machine-readable reason string.
   * - `'INSUFFICIENT_APS'`: fewer than `MIN_AP_COUNT` valid APs after filtering.
   */
  reason: 'INSUFFICIENT_APS';
}

export type BleWeightedCentroidResult =
  | BleWeightedCentroidSuccess
  | BleWeightedCentroidFailure;

// ────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Baseline RSSI weight formula — DO NOT MODIFY.
 *
 * Converts a signal-strength reading (dBm) into a linear weight used
 * for the weighted-centroid calculation.
 *
 * @param rssi - Received signal strength in dBm
 * @returns Linear weight (> 0 for any realistic rssi)
 */
function computeBaseWeight(rssi: number): number {
  return Math.pow(10, (rssi + 100) / 20);
}

/**
 * Compute an exponential freshness multiplier in (0, 1.0].
 * Fresher (younger) samples get a factor closer to 1.0.
 *
 * `freshnessWeight = exp(-ageMs / DECAY_TAU_MS)`
 *
 * At `ageMs === 0` the weight is 1.0 (full weight).
 * At `ageMs === DECAY_TAU_MS` (6 s) the weight is ~0.368 (one time-constant).
 */
function computeFreshnessWeight(ageMs: number): number {
  return Math.exp(-ageMs / DECAY_TAU_MS);
}

/**
 * Build a multi-map from bleIdentifier → list of APs for O(1) look-up.
 */
function indexApsByIdentifier(
  aps: readonly BleAccessPoint5183[],
): Map<string, BleAccessPoint5183[]> {
  const map = new Map<string, BleAccessPoint5183[]>();
  for (const ap of aps) {
    const list = map.get(ap.bleIdentifier);
    if (list) {
      list.push(ap);
    } else {
      map.set(ap.bleIdentifier, [ap]);
    }
  }
  return map;
}

// ────────────────────────────────────────────────────────────────────────────
// Internal data
// ────────────────────────────────────────────────────────────────────────────

/** A validated observation matched to its AP record, ready for weighting. */
interface ValidPair {
  ap: BleAccessPoint5183;
  rssi: number;
  ageMs: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

/**
 * Pure RSSI weighted-centroid localisation using BLE AP coordinates in
 * **EPSG:5183** (Korean 2000 / Central Belt 2010 TM).
 *
 * ### Algorithm
 *
 * 1. **Filter** observations by:
 *    - Floor key match (`obs.floorKey === ap.floorKey`)
 *    - Identity match (`obs.bleIdentifier === ap.bleIdentifier`)
 *    - Manufacturer match (`ap.manufacturerId === expectedManufacturerId`)
 *    - RSSI >= `rssiThreshold` (default: -90 dBm)
 *    - Sample age <= `maxAgeSeconds` (default: 120 s)
 *
 * 2. **Reject** if fewer than `MIN_AP_COUNT` valid pairs remain → `INSUFFICIENT_APS`.
 *
 * 3. **Weight** each valid pair:
 *    ```
 *    baseWeight      = 10 ^ ((rssi + 100) / 20)       // baseline (fixed)
 *    freshnessWeight = exp(-ageMs / DECAY_TAU_MS)     // only if enabled
 *    weight          = baseWeight × freshnessWeight    // combined
 *    ```
 *    **IMPORTANT**: Freshness weighting is always multiplied after the
 *    baseline weight, never before.
 *
 * 4. **Centroid** in EPSG:5183:
 *    ```
 *    cx = Σ(weightᵢ × xᵢ) / Σ(weightᵢ)
 *    cy = Σ(weightᵢ × yᵢ) / Σ(weightᵢ)
 *    ```
 *
 * 5. **Accuracy** — weighted standard deviation (metres):
 *    ```
 *    accuracyMeters = √( Σ(weightᵢ × dᵢ²) / Σ(weightᵢ) )
 *    ```
 *    where `dᵢ` = Euclidean distance from centroid to APᵢ (EPSG:5183).
 *
 * 6. **Convert** `(cx, cy)` to WGS84 `[lng, lat]` via
 *    `transformEpsg5183ToWgs84`.
 *
 * ### Pure function
 *
 * This function has **no side effects**.  It does not access native
 * modules, file I/O, or any platform API.  Every external dependency
 * is injected through imports of pure TypeScript modules.
 *
 * @param accessPoints - Known BLE AP coordinate records (EPSG:5183).
 * @param observations - Real-time BLE scan observations from the device.
 * @param options      - Optional tuning parameters.
 * @returns A success or failure discriminated union.
 */
export function computeBleWeightedCentroid(
  accessPoints: readonly BleAccessPoint5183[],
  observations: readonly BleObservation[],
  options?: BleWeightedCentroidOptions,
): BleWeightedCentroidResult {
  // ── Resolve options (with defaults) ──────────────────────────────────
  const now = options?.now ?? Date.now();
  const maxAgeMs = options?.maxAgeSeconds != null ? options.maxAgeSeconds * 1000 : MAX_SAMPLE_AGE_MS;
  const rssiThreshold = options?.rssiThreshold ?? RSSI_THRESHOLD_DBM;
  const expectedManufacturerId = options?.expectedManufacturerId ?? MANUFACTURER_ID_ARUBA;
  const enableFreshnessWeighting = options?.enableFreshnessWeighting ?? true;

  // ── Index APs for efficient look-up by bleIdentifier ─────────────────
  const apByIdentifier = indexApsByIdentifier(accessPoints);

  // ── Filter observations and match to AP records ──────────────────────
  const validPairs: ValidPair[] = [];
  let staleCount = 0;

  for (const obs of observations) {
    // 1. Age check
    const ageMs = now - obs.observedAt;
    if (ageMs > maxAgeMs) {
      staleCount++;
      continue;
    }

    // 2. RSSI threshold
    if (obs.rssi < rssiThreshold) {
      continue;
    }

    // 3. Find candidate APs by identity
    const candidates = apByIdentifier.get(obs.bleIdentifier);
    if (!candidates) continue;

    for (const ap of candidates) {
      // 4. Floor key and manufacturer match
      if (ap.floorKey === obs.floorKey && ap.manufacturerId === expectedManufacturerId) {
        validPairs.push({ ap, rssi: obs.rssi, ageMs });
      }
    }
  }

  // ── Minimum AP check ─────────────────────────────────────────────────
  if (validPairs.length < MIN_AP_COUNT) {
    return { reason: 'INSUFFICIENT_APS' };
  }

  // ── Compute weights and weighted centroid (EPSG:5183) ────────────────
  let sumWeight = 0;
  let sumX = 0;
  let sumY = 0;

  const weights: number[] = [];

  for (const pair of validPairs) {
    const baseWeight = computeBaseWeight(pair.rssi);
    const freshnessWeight = enableFreshnessWeighting
      ? computeFreshnessWeight(pair.ageMs)
      : 1.0;
    const weight = baseWeight * freshnessWeight;

    weights.push(weight);
    sumWeight += weight;
    sumX += pair.ap.x5183 * weight;
    sumY += pair.ap.y5183 * weight;
  }

  const centroidX = sumX / sumWeight;
  const centroidY = sumY / sumWeight;

  // ── Accuracy: weighted standard deviation (in EPSG:5183 metres) ──────
  let sumWeightedDistSq = 0;
  for (let i = 0; i < validPairs.length; i++) {
    const pair = validPairs[i];
    const dx = pair.ap.x5183 - centroidX;
    const dy = pair.ap.y5183 - centroidY;
    sumWeightedDistSq += weights[i] * (dx * dx + dy * dy);
  }
  const accuracyMeters = Math.sqrt(sumWeightedDistSq / sumWeight);

  // ── Confidence: 0–1 composite score ──────────────────────────────────
  //  Factor 1: AP count diversity (plateaus at 8 APs)
  const apCountQuality = Math.min(validPairs.length / 8, 1.0);
  //  Factor 2: Average signal strength relative to RSSI -30 (very strong)
  const avgWeight = sumWeight / validPairs.length;
  const maxRefWeight = computeBaseWeight(-30);
  const signalQuality = Math.min(avgWeight / maxRefWeight, 1.0);
  //  Composite (equal parts diversity + signal)
  const confidence = apCountQuality * 0.5 + signalQuality * 0.5;

  // ── Convert to WGS84 ─────────────────────────────────────────────────
  const [longitude, latitude] = transformEpsg5183ToWgs84(centroidX, centroidY);

  return {
    longitude,
    latitude,
    confidence,
    accuracyMeters,
    usedApCount: validPairs.length,
    staleSampleCount: staleCount,
    computedAt: now,
  };
}
