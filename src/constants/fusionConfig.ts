/**
 * Centralised BLE + motion fusion particle-filter configuration constants.
 *
 * All numeric values here are documented with units so the fusion engine
 * can be tuned without scattering magic numbers through the codebase.
 */

/** Number of particles in the fusion particle filter. Unit: particles. */
export const PARTICLE_COUNT = 300;

/** Initial particle spread radius. Unit: meters. */
export const PARTICLE_INIT_RADIUS_M = 12;

/** Per-step displacement noise. Unit: meters. */
export const PARTICLE_MOTION_NOISE_M = 0.45;

/** Per-step heading noise. Unit: degrees. */
export const PARTICLE_HEADING_NOISE_DEG = 18;

/** BLE observation Gaussian sigma. Unit: meters. */
export const BLE_OBSERVATION_SIGMA_M = 10;

/** Weight multiplier for particles outside the inferred zone. Unit: ratio (0-1). */
export const MAP_CONSTRAINT_PENALTY = 0.35;

/** Resample trigger threshold based on effective particle ratio. Unit: ratio (0-1). */
export const RESAMPLE_EFFECTIVE_RATIO = 0.5;

/** Confidence threshold for low fusion confidence. Unit: confidence ratio (0-1). */
export const FUSION_LOW_CONFIDENCE = 0.35;

/** Confidence threshold for high fusion confidence. Unit: confidence ratio (0-1). */
export const FUSION_HIGH_CONFIDENCE = 0.7;

/** Steps without BLE before declaring the fusion state unavailable. Unit: steps. */
export const FUSION_UNKNOWN_AFTER_STEPS = 45;

/** Minimum displayed accuracy. Unit: meters. */
export const FUSION_ACCURACY_MIN_M = 3;

/** Maximum displayed accuracy. Unit: meters. */
export const FUSION_ACCURACY_MAX_M = 45;
