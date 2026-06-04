/**
 * Centralised BLE WCL (Weighted Centroid Localisation) configuration constants.
 *
 * All magic numbers related to BLE scanning, sample filtering, and WCL
 * computation live here so they can be imported and reasoned about in one
 * place rather than scattered across files.
 *
 * ── Convention ─────────────────────────────────────────────────────────
 * - Time intervals are expressed in **milliseconds** (the unit used at
 *   the BLE native-observation layer).
 * - RSSI values are in **dBm** (negative, more-positive = stronger).
 * - Manufacturer IDs are IEEE-assigned 16-bit company identifiers.
 *
 * @see computeBleWeightedCentroid  – the pure WCL function consuming these
 * @see BleObservationBuffer        – rolling observation store
 * @see bleWclProvider               – orchestrator that ties it all together
 */

/** HPE / Aruba IEEE OUI manufacturer ID (little-endian in BLE advertisement). */
export const MANUFACTURER_ID_ARUBA = 0x011b;

/**
 * Time-decay constant (tau) for exponential freshness weighting in ms.
 *
 * `freshnessWeight = exp(-ageMs / DECAY_TAU_MS)`
 *
 * At `ageMs === DECAY_TAU_MS` the weight is ~0.368 (one time-constant).
 * At `ageMs === 0` the weight is 1.0 (full weight for a fresh observation).
 * @default 6_000
 */
export const DECAY_TAU_MS = 6_000;

/**
 * Minimum number of AP / observation pairs required for a WCL computation.
 * Fewer than this → `INSUFFICIENT_APS` failure.
 */
export const MIN_AP_COUNT = 3;

/**
 * RSSI quality threshold in dBm.
 * Observations with RSSI **strictly below** this value are rejected before
 * the minimum-count check.
 */
export const RSSI_THRESHOLD_DBM = -90;

/**
 * Stale threshold in ms.
 * Observations older than this get a freshness penalty when
 * `enableFreshnessWeighting` is turned on.
 */
export const STALE_THRESHOLD_MS = 60_000;

/**
 * Maximum sample age in ms.
 * Observations older than this are discarded entirely by the observation
 * buffer and the WCL filter.
 */
export const MAX_SAMPLE_AGE_MS = 120_000;

/**
 * Default BLE scan duration in ms.
 * Used when the caller does not specify an explicit scan window.
 */
export const DEFAULT_SCAN_DURATION_MS = 10_000;

/**
 * Maximum allowed BLE scan duration in ms.
 * Prevents unreasonably long scan windows that would drain the battery.
 */
export const MAX_SCAN_DURATION_MS = 30_000;

/**
 * Minimum allowed BLE scan duration in ms.
 * Scans shorter than this may not collect enough observations.
 */
export const MIN_SCAN_DURATION_MS = 1_000;

// ── Dead Reckoning (Pedestrian Dead Reckoning) ──────────────────────────

/** Fixed stride length in meters for step displacement. */
export const STRIDE_LENGTH_M = 0.65;

/**
 * Maximum number of DR steps without a BLE anchor before confidence drops to 0.
 * After this many steps without BLE correction, the DR position is considered unreliable.
 */
export const MAX_DR_STEPS_WITHOUT_BLE = 30;

/**
 * Per-step error accumulation rate as a fraction of stride length.
 * Used to estimate cumulative positional error for UI display.
 * 0.1 = 10% of stride per step (~6.5cm per step).
 */
export const DR_ERROR_RATE_PER_STEP = 0.1;

/**
 * Confidence decay rate.
 * confidence = max(0, 1 - stepsSinceLastBle / MAX_DR_STEPS_WITHOUT_BLE)
 * This is the denominator — the number of steps over which confidence decays from 1→0.
 */
export const DR_CONFIDENCE_DECAY_STEPS = MAX_DR_STEPS_WITHOUT_BLE;

// ── Time-Decay WCL (Exponential Decay) ─────────────────────────────────

/**
 * Interval in milliseconds for continuous WCL position recomputation.
 * The buffer is sampled and WCL recalculated at this rate during continuous scan mode.
 * 1000ms = 1 Hz recomputation rate.
 */
export const CONTINUOUS_RECOMPUTE_INTERVAL_MS = 1_000;

/**
 * Exponential Moving Average (EMA) smoothing factor α for RSSI values.
 * smoothed_rssi = α × new_rssi + (1 - α) × prev_smoothed_rssi
 * Higher α = more responsive to new readings, less smoothing.
 * 0.3 provides moderate smoothing while tracking real changes.
 */
export const EMA_SMOOTHING_ALPHA = 0.3;
