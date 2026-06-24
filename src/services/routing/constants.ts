// Indoor school corridors are slower than open outdoor walking due to crowds,
// bags, turns, and narrow hallways.
export const WALKING_SPEED_MPS = 1.2;

/**
 * Shared route option color palette — used for both swatch indicators on
 * route cards and map path overlay lines.
 */
export const ROUTE_SWATCH_COLORS = [
  '#2979FF',
  '#FF7043',
  '#66BB6A',
  '#AB47BC',
  '#FFCA28',
] as const;

/** Normalization divisor: effortScore = effortMeters / EFFORT_SCORE_DIVISOR. */
export const EFFORT_SCORE_DIVISOR = 100;
