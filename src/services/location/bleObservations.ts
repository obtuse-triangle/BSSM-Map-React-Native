/**
 * BLE scan observation types and a rolling sample buffer for WCL estimation.
 *
 * ── Design Notes ──────────────────────────────────────────────────────
 *  1. `BleApObservation` represents a single BLE scan sighting of an
 *     access point.  It is the bridge between raw CoreBluetooth / native
 *     BLE scan callbacks and the WCL position estimator.
 *
 *  2. `BleObservationBuffer` keeps **only the latest observation per AP**
 *     (identified by `bleIdentifier`).  Full scan history is NOT retained
 *     because iOS CoreBluetooth delivery can stretch 5 s to >1 min,
 *     making a moving-window history misleading.
 *
 *  3. Observations older than `maxAgeMs` (default 120 s) are considered
 *     stale and are pruned on the next access or explicitly via
 *     `pruneStale()`.
 *
 *  4. `bleIdentifier` is deliberately abstract — the real identity schema
 *     (MAC-based, iBeacon UUID+major+minor, Eddystone-UID) will be
 *     confirmed once the Aruba BLE payload field is understood.
 *
 * @see BleAccessPoint5183  – the static AP catalogue this buffer feeds
 * @see iosBleProvider.ts   – the native bridge that produces these observations
 */

import { EMA_SMOOTHING_ALPHA, MAX_SAMPLE_AGE_MS } from '../../constants/bleConfig';

/**
 * A single BLE scan observation from one access point.
 *
 * This is the **output** of the BLE scanning layer and the **input** to the
 * WCL weighted-centroid estimator (Task 3).
 */
export interface BleApObservation {
  /**
   * Stable AP identity used for deduplication.
   *
   * For now a free-form string; will be replaced by a discriminated union
   * once the Aruba BLE payload field is reverse-engineered:
   *   `{ type: 'mac'; mac: string } | { type: 'ibeacon'; uuid: string; major: number; minor: number }`
   *
   * @see BleAccessPoint5183.bleIdentifier
   */
  bleIdentifier: string;

  /** IEEE OUI / Bluetooth Company Identifier (e.g. 0x011B = 283 for HPE/Aruba). */
  manufacturerId: number;

  /** Received Signal Strength Indicator in dBm (typically -100 … -20). */
  rssi: number;

  /**
   * Raw advertisement payload in hexadecimal string.
   *
   * Used for debugging and reverse-engineering the Aruba beacon identity
   * field.  MAY be empty (`''`) if the native bridge does not expose the
   * full manufacturer-specific data.
   */
  payloadHex: string;

  /**
   * Epoch timestamp (ms) when the observation was recorded by the native
   * BLE scanner.  This is the **device receipt** time, not the AP's
   * transmission time.
   */
  observedAt: number;
}

/**
 * Apply Exponential Moving Average (EMA) smoothing to an RSSI value.
 * Reduces noise from BLE signal fluctuations.
 *
 * smoothed = α × newRssi + (1 - α) × prevSmoothed
 *
 * @param newRssi       - Latest RSSI reading in dBm
 * @param prevSmoothed  - Previous smoothed RSSI value (null if first reading)
 * @param alpha         - Smoothing factor (0-1). Default: EMA_SMOOTHING_ALPHA from config
 * @returns Smoothed RSSI value
 */
function smoothRssi(
  newRssi: number,
  prevSmoothed: number | null,
  alpha: number = EMA_SMOOTHING_ALPHA,
): number {
  if (prevSmoothed === null) return newRssi;
  return alpha * newRssi + (1 - alpha) * prevSmoothed;
}

/**
 * Rolling sample buffer that keeps the freshest BLE observation per AP.
 *
 * The buffer is designed for **up to ~50 APs** and performs O(1) insert
 * and O(n) prune/metadata scans.  It is intentionally **not** a full
 * scan-history window — only the latest RSSI per AP is retained.
 *
 * @example
 * ```ts
 * const buffer = new BleObservationBuffer();
 * buffer.addObservation({ bleIdentifier: 'ap-1', rssi: -75, observedAt: Date.now(), … });
 * const latest = buffer.latestByAp();           // Map { 'ap-1' => … }
 * const meta   = buffer.getMetadata();          // { activeCount: 1, staleCount: 0, … }
 * buffer.clear();
 * ```
 */
export class BleObservationBuffer {
  private readonly _maxAgeMs: number;
  private readonly _observations: Map<string, BleApObservation> = new Map();

  /**
   * @param maxAgeMs  Maximum age of an observation before it is considered
   *                  stale (default: 120 000 ms = 120 s).
   */
  constructor(maxAgeMs: number = MAX_SAMPLE_AGE_MS) {
    if (maxAgeMs <= 0) {
      throw new Error(`BleObservationBuffer: maxAgeMs must be > 0, got ${maxAgeMs}`);
    }
    this._maxAgeMs = maxAgeMs;
  }

  /**
   * Insert (or replace) an observation for an AP.
   *
   * If an observation with the same `bleIdentifier` already exists, it is
   * **unconditionally replaced** by the newer one — the caller is responsible
   * for ensuring `observedAt` is monotonic if ordering matters.
   */
  addObservation(obs: BleApObservation): void {
    const existing = this._observations.get(obs.bleIdentifier);
    if (existing) {
      const smoothedRssi = smoothRssi(obs.rssi, existing.rssi);
      this._observations.set(obs.bleIdentifier, { ...obs, rssi: smoothedRssi });
    } else {
      this._observations.set(obs.bleIdentifier, obs);
    }
  }

  /**
   * Remove all observations older than `maxAgeMs`.
   *
   * @returns The number of observations pruned.
   */
  pruneStale(): number {
    const now = Date.now();
    const cutoff = now - this._maxAgeMs;
    let pruned = 0;

    for (const [key, obs] of this._observations) {
      if (obs.observedAt < cutoff) {
        this._observations.delete(key);
        pruned++;
      }
    }

    return pruned;
  }

  /**
   * Return a **snapshot** of the freshest observation per AP, after
   * pruning stale entries.
   *
   * The returned map is a copy — mutations do not affect the buffer.
   */
  latestByAp(): Map<string, BleApObservation> {
    this.pruneStale();
    return new Map(this._observations);
  }

  /**
   * Snapshot of buffer health metadata.
   *
   * - `activeCount`  – observations that have NOT yet exceeded `maxAgeMs`.
   * - `staleCount`   – observations that HAVE exceeded `maxAgeMs` but have
   *                    not been pruned yet (will be removed on next access).
   * - `oldestAgeMs`  – age of the *oldest* observation in the buffer (ms).
   *
   * This accessor does **not** trigger pruning — it reflects the current
   * in-memory state only.
   */
  getMetadata(): { activeCount: number; staleCount: number; oldestAgeMs: number } {
    const now = Date.now();
    let activeCount = 0;
    let staleCount = 0;
    let oldestAgeMs = 0;

    for (const obs of this._observations.values()) {
      const age = now - obs.observedAt;
      if (age > this._maxAgeMs) {
        staleCount++;
      } else {
        activeCount++;
      }
      if (age > oldestAgeMs) {
        oldestAgeMs = age;
      }
    }

    return { activeCount, staleCount, oldestAgeMs };
  }

  /**
   * Remove all observations from the buffer.
   */
  clear(): void {
    this._observations.clear();
  }

  /**
   * Number of observations currently held (including stale).
   */
  get size(): number {
    return this._observations.size;
  }
}
