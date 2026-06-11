// ────────────────────────────────────────────────────────────────────────────
// Dead Reckoning Engine — Pure TypeScript pedestrian indoor positioning
// ────────────────────────────────────────────────────────────────────────────

import {
  STRIDE_LENGTH_M,
  MAX_DR_STEPS_WITHOUT_BLE,
  DR_ERROR_RATE_PER_STEP,
} from '../../constants/bleConfig';

export { STRIDE_LENGTH_M, MAX_DR_STEPS_WITHOUT_BLE };

/**
 * Mean Earth radius in metres (WGS‑84).
 */
const EARTH_RADIUS_M = 6_371_000;

/**
 * Convert a heading in **degrees** (0 = North, 90 = East) to radians.
 */
function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Pure TypeScript dead-reckoning engine for pedestrian indoor positioning.
 *
 * ### Usage
 *
 * ```ts
 * const dr = new DeadReckoningEngine();
 * dr.reset(anchorLat, anchorLng);
 *
 * // Each time a step is detected (via CoreMotion / step detector):
 * const pos = dr.updateStep(headingDeg);
 * console.log(pos.lat, pos.lng, dr.cumulativeErrorMeters);
 * ```
 *
 * ### Reset flow
 *
 * When a BLE weighted-centroid result arrives, call `reset(bleLat, bleLng)`
 * to anchor the DR position and reset the confidence / error accumulator.
 */
export class DeadReckoningEngine {
  /** Anchor (and current estimated) latitude in decimal degrees. */
  private _lat: number = 0;

  /** Anchor (and current estimated) longitude in decimal degrees. */
  private _lng: number = 0;

  /** Number of steps taken since the last `reset()`. */
  private _stepsSinceLastBle: number = 0;

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Reset the engine to an absolute position (e.g. from a BLE WCL result).
   * Also resets the step counter and restores confidence to 1.0.
   *
   * @param lat  Anchor latitude  (decimal degrees)
   * @param lng  Anchor longitude (decimal degrees)
   */
  reset(lat: number, lng: number): void {
    this._lat = lat;
    this._lng = lng;
    this._stepsSinceLastBle = 0;
  }

  /**
   * Advance the estimated position by one step in the given heading.
   *
   * Uses the Haversine‑inspired displacement formula:
   * ```
   * δlat = d × cos(θ) / R
   * δlng = d × sin(θ) / (R × cos(lat))
   * ```
   * where `d` = stride length (metres), `θ` = heading (radians),
   * `R` = Earth radius, and `lat` is the **current** latitude (radians).
   *
   * @param headingDeg    Heading in degrees (0 = North, 90 = East).
   * @param strideLengthM Override stride length.  Defaults to `STRIDE_LENGTH_M`.
   * @returns The new estimated position after the step.
   */
  updateStep(
    headingDeg: number,
    strideLengthM: number = STRIDE_LENGTH_M,
  ): { lat: number; lng: number } {
    const headingRad = toRadians(headingDeg);
    const latRad = toRadians(this._lat);

    const dLat = (strideLengthM * Math.cos(headingRad)) / EARTH_RADIUS_M;
    const dLng =
      (strideLengthM * Math.sin(headingRad)) /
      (EARTH_RADIUS_M * Math.cos(latRad));

    const DEG_PER_RAD = 180 / Math.PI;
    const newLat = this._lat + dLat * DEG_PER_RAD;
    const newLng = this._lng + dLng * DEG_PER_RAD;
    this._lat = Math.abs(newLat) < 1e-12 ? 0 : newLat;
    this._lng = Math.abs(newLng) < 1e-12 ? 0 : newLng;

    this._stepsSinceLastBle++;

    return { lat: this._lat, lng: this._lng };
  }

  /**
   * Returns the current estimated position and metadata without
   * advancing the engine.
   */
  getPosition(): {
    lat: number;
    lng: number;
    confidence: number;
    stepsSinceLastBle: number;
  } {
    return {
      lat: this._lat,
      lng: this._lng,
      confidence: this.confidence,
      stepsSinceLastBle: this._stepsSinceLastBle,
    };
  }

  /**
   * Estimated accumulated error in metres since the last BLE anchor.
   *
   * Formula: `stepsSinceLastBle × STRIDE_LENGTH_M × DR_ERROR_RATE_PER_STEP`
   */
  get cumulativeErrorMeters(): number {
    return (
      this._stepsSinceLastBle * STRIDE_LENGTH_M * DR_ERROR_RATE_PER_STEP
    );
  }

  /**
   * Confidence score in **[0, 1]** that decays linearly with every step
   * taken since the last BLE reset.
   *
   * Formula: `max(0, 1 - stepsSinceLastBle / MAX_DR_STEPS_WITHOUT_BLE)`
   */
  get confidence(): number {
    return Math.max(
      0,
      1 - this._stepsSinceLastBle / MAX_DR_STEPS_WITHOUT_BLE,
    );
  }
}
