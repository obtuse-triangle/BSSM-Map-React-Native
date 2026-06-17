/**
 * effortModel.ts
 *
 * Effort model for indoor routing — converts connector (stair/elevator)
 * traversals into "equivalent flat walking metres" so that an "easiest"
 * routing profile can rank routes by ergonomic cost rather than just
 * distance or time.
 *
 * Coefficients are intentionally conservative indoor-campus defaults.
 * Exact physiological accuracy is less important than the monotonic
 * ordering they produce: stairs > flat walking > elevator (per floor).
 *
 *   - stairAscent:  18 metres/floor  (one floor up ≈ 18 m flat walk)
 *   - stairDescent:  8 metres/floor  (~45 % of ascent cost)
 *   - floorChange:   4 metres/transition (orientation/interruption)
 *   - elevatorRide:  2 metres/ride   (near-zero physical, mild friction)
 *
 * Derived from Oracle design (bg_a384eae9). Tunable for later calibration.
 */

export interface EffortCoefficients {
  /** Flat metres equivalent for one floor of stair ascent. */
  stairAscentPerFloor: number;
  /** Flat metres equivalent for one floor of stair descent. */
  stairDescentPerFloor: number;
  /** Flat metres equivalent added per floor-change transition (any type). */
  floorChangePerTransition: number;
  /** Flat metres equivalent added per elevator ride. */
  elevatorRidePerRide: number;
}

/** Conservative default coefficients (Oracle-recommended starting point). */
export const effortCoefficients: EffortCoefficients = {
  stairAscentPerFloor: 18,
  stairDescentPerFloor: 8,
  floorChangePerTransition: 4,
  elevatorRidePerRide: 2,
};

/**
 * Compute the "equivalent flat walking metres" cost of a single cross-floor
 * connector edge.
 *
 * For stairs the cost is dominated by ascent/descent. For elevators the cost
 * is near-zero physically, with only a small per-ride friction penalty plus
 * the per-transition orientation cost shared with stairs.
 *
 * @param connectorType 'stair' | 'elevator'
 * @param connectsLevels [fromLevel, toLevel] tuple
 * @param c              Effort coefficients to apply
 */
export function computeConnectorEffortMeters(
  connectorType: 'stair' | 'elevator',
  connectsLevels: [number, number],
  c: EffortCoefficients = effortCoefficients,
): number {
  const [fromLevel, toLevel] = connectsLevels;
  const floorDelta = Math.abs(toLevel - fromLevel);
  const ascentFloors = Math.max(0, toLevel - fromLevel);
  const descentFloors = Math.max(0, fromLevel - toLevel);

  if (connectorType === 'stair') {
    return (
      ascentFloors * c.stairAscentPerFloor +
      descentFloors * c.stairDescentPerFloor +
      floorDelta * c.floorChangePerTransition
    );
  }

  // elevator
  return (
    c.elevatorRidePerRide +
    floorDelta * c.floorChangePerTransition
  );
}
