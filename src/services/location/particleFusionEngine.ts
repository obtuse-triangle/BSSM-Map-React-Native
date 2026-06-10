import type {
  FusionBleObservation,
  FusionConfidenceLevel,
  FusionMotionEvent,
  FusionParticle,
  FusionSource,
  FusionState,
} from '../../types/fusion';
import {
  BLE_OBSERVATION_SIGMA_M,
  FUSION_ACCURACY_MAX_M,
  FUSION_ACCURACY_MIN_M,
  FUSION_HIGH_CONFIDENCE,
  FUSION_LOW_CONFIDENCE,
  FUSION_UNKNOWN_AFTER_STEPS,
  MAP_CONSTRAINT_PENALTY,
  PARTICLE_COUNT,
  PARTICLE_HEADING_NOISE_DEG,
  PARTICLE_INIT_RADIUS_M,
  PARTICLE_MOTION_NOISE_M,
  RESAMPLE_EFFECTIVE_RATIO,
} from '../../constants/fusionConfig';
import { STRIDE_LENGTH_M } from '../../constants/bleConfig';
import { inferZone } from './zoneInference';

const EARTH_RADIUS_M = 6_371_000;

const TWO_PI = Math.PI * 2;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const toRadians = (deg: number): number => (deg * Math.PI) / 180;

const toDegrees = (rad: number): number => (rad * 180) / Math.PI;

const normalizeHeading = (headingDeg: number): number => {
  const normalized = headingDeg % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

const moveByMeters = (
  lat: number,
  lng: number,
  headingDeg: number,
  distanceM: number,
): { lat: number; lng: number } => {
  const headingRad = toRadians(headingDeg);
  const latRad = toRadians(lat);
  const dLat = (distanceM * Math.cos(headingRad)) / EARTH_RADIUS_M;
  const dLng = (distanceM * Math.sin(headingRad)) / (EARTH_RADIUS_M * Math.cos(latRad));

  return {
    lat: lat + dLat * (180 / Math.PI),
    lng: lng + dLng * (180 / Math.PI),
  };
};

const haversineDistanceMeters = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number => {
  const lat1Rad = toRadians(lat1);
  const lat2Rad = toRadians(lat2);
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLng = toRadians(lng2 - lng1);

  const sinHalfLat = Math.sin(deltaLat / 2);
  const sinHalfLng = Math.sin(deltaLng / 2);
  const a =
    sinHalfLat * sinHalfLat +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * sinHalfLng * sinHalfLng;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_M * c;
};

const circularMeanDeg = (particles: readonly FusionParticle[]): number | null => {
  if (particles.length === 0) {
    return null;
  }

  let sumSin = 0;
  let sumCos = 0;
  let totalWeight = 0;

  for (const particle of particles) {
    const weight = particle.weight;
    totalWeight += weight;
    const radians = toRadians(particle.headingDeg);
    sumSin += Math.sin(radians) * weight;
    sumCos += Math.cos(radians) * weight;
  }

  if (totalWeight <= 0 || (sumSin === 0 && sumCos === 0)) {
    return particles[0]?.headingDeg ?? null;
  }

  return normalizeHeading(toDegrees(Math.atan2(sumSin, sumCos)));
};

const weightedMean = (
  particles: readonly FusionParticle[],
): { lat: number; lng: number } | null => {
  if (particles.length === 0) {
    return null;
  }

  let lat = 0;
  let lng = 0;
  let totalWeight = 0;

  for (const particle of particles) {
    lat += particle.lat * particle.weight;
    lng += particle.lng * particle.weight;
    totalWeight += particle.weight;
  }

  if (totalWeight <= 0) {
    return {
      lat: particles[0].lat,
      lng: particles[0].lng,
    };
  }

  return {
    lat: lat / totalWeight,
    lng: lng / totalWeight,
  };
};

const boundedGaussian = (rng: () => number, maxAbs: number): number => {
  if (maxAbs <= 0) {
    return 0;
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const u1 = Math.max(Number.EPSILON, rng());
    const u2 = rng();
    const magnitude = Math.sqrt(-2 * Math.log(u1)) * Math.cos(TWO_PI * u2);
    const value = magnitude * (maxAbs / 3);

    if (Math.abs(value) <= maxAbs) {
      return value;
    }
  }

  return (rng() * 2 - 1) * maxAbs;
};

const cloneParticle = (particle: FusionParticle): FusionParticle => ({
  lat: particle.lat,
  lng: particle.lng,
  weight: particle.weight,
  floorKey: particle.floorKey,
  headingDeg: particle.headingDeg,
});

export class ParticleFusionEngine {
  private readonly rng: () => number;

  private readonly particleCount: number;

  private particles: FusionParticle[] = [];

  private hasBleAnchor = false;

  private lastBleConfidence = 0;

  private stepsSinceLastBle = 0;

  private lastMotionFiniteEstimate = false;

  private lastUpdateTime = 0;

  private floorKey = '';

  private unavailableReason: string | null = 'No BLE anchor';

  constructor(options?: { rngSeed?: number; particleCount?: number }) {
    const seed = options?.rngSeed ?? 1;
    this.rng = ParticleFusionEngine.createSeededRng(seed);

    const particleCount = options?.particleCount ?? PARTICLE_COUNT;
    if (particleCount <= 0 || !Number.isInteger(particleCount)) {
      throw new Error('particleCount must be a positive integer');
    }

    this.particleCount = particleCount;
  }

  resetFromBle(observation: FusionBleObservation): void {
    const particleWeight = 1 / this.particleCount;
    this.particles = Array.from({ length: this.particleCount }, () => {
      const radiusM = this.rng() * PARTICLE_INIT_RADIUS_M;
      const bearingDeg = this.rng() * 360;
      const position = moveByMeters(observation.lat, observation.lng, bearingDeg, radiusM);

      return {
        lat: position.lat,
        lng: position.lng,
        weight: particleWeight,
        floorKey: observation.floorKey,
        headingDeg: this.rng() * 360,
      } satisfies FusionParticle;
    });

    this.hasBleAnchor = true;
    this.lastBleConfidence = clamp01(observation.confidence);
    this.stepsSinceLastBle = 0;
    this.lastMotionFiniteEstimate = false;
    this.lastUpdateTime = observation.timestamp;
    this.floorKey = observation.floorKey;
    this.unavailableReason = null;
  }

  applyMotion(event: FusionMotionEvent): void {
    if (this.particles.length === 0) {
      return;
    }

    const steps = Math.max(0, Math.floor(event.steps));
    if (steps === 0) {
      this.lastUpdateTime = event.timestamp;
      return;
    }

    let allFinite = true;

    for (let stepIndex = 0; stepIndex < steps; stepIndex += 1) {
      for (const particle of this.particles) {
        const headingNoise = boundedGaussian(this.rng, PARTICLE_HEADING_NOISE_DEG);
        const motionHeading = normalizeHeading(event.heading + headingNoise);

        let position = moveByMeters(particle.lat, particle.lng, motionHeading, STRIDE_LENGTH_M);

        const noiseHeading = this.rng() * 360;
        const noiseDistance = this.rng() * PARTICLE_MOTION_NOISE_M;
        position = moveByMeters(position.lat, position.lng, noiseHeading, noiseDistance);

        if (!Number.isFinite(position.lat) || !Number.isFinite(position.lng)) {
          allFinite = false;
        }

        particle.lat = position.lat;
        particle.lng = position.lng;
        particle.headingDeg = motionHeading;
      }
    }

    this.stepsSinceLastBle += steps;
    this.lastMotionFiniteEstimate = allFinite;
    this.lastUpdateTime = event.timestamp;
    this.unavailableReason = null;
  }

  applyBleCorrection(observation: FusionBleObservation): void {
    if (this.particles.length === 0) {
      this.resetFromBle(observation);
      return;
    }

    const bleConfidence = clamp01(observation.confidence);
    const sigmaSquaredTimesTwo = 2 * BLE_OBSERVATION_SIGMA_M * BLE_OBSERVATION_SIGMA_M;

    for (const particle of this.particles) {
      const distanceMeters = haversineDistanceMeters(
        particle.lat,
        particle.lng,
        observation.lat,
        observation.lng,
      );
      const observationWeight = Math.exp(-(distanceMeters * distanceMeters) / sigmaSquaredTimesTwo);
      const zone = inferZone(particle.lat, particle.lng, observation.floorKey);
      const mapFactor = zone.isInsideKnownZone ? 1 : MAP_CONSTRAINT_PENALTY;

      particle.weight *= observationWeight * bleConfidence * mapFactor;
      particle.floorKey = observation.floorKey;
    }

    this.normalizeWeights();

    if (this.effectiveSampleSize() < this.particleCount * RESAMPLE_EFFECTIVE_RATIO) {
      this.resampleParticles();
    }

    this.hasBleAnchor = true;
    this.lastBleConfidence = bleConfidence;
    this.stepsSinceLastBle = 0;
    this.lastMotionFiniteEstimate = false;
    this.lastUpdateTime = observation.timestamp;
    this.floorKey = observation.floorKey;
    this.unavailableReason = null;
  }

  getState(): FusionState {
    if (this.particles.length === 0) {
      return {
        lat: 0,
        lng: 0,
        headingDeg: null,
        accuracyMeters: FUSION_ACCURACY_MAX_M,
        confidence: 0,
        confidenceLevel: 'unknown',
        source: 'unavailable',
        floorKey: this.floorKey,
        inferredZone: null,
        stepsSinceLastBle: this.stepsSinceLastBle,
        particleCount: 0,
        particleSpread: 0,
        unavailableReason: this.unavailableReason,
        lastUpdateTime: this.lastUpdateTime,
      };
    }

    this.normalizeWeights();

    const weightedCenter = weightedMean(this.particles);
    const centerLat = weightedCenter?.lat ?? this.particles[0].lat;
    const centerLng = weightedCenter?.lng ?? this.particles[0].lng;

    let squaredSpread = 0;
    for (const particle of this.particles) {
      const distanceMeters = haversineDistanceMeters(centerLat, centerLng, particle.lat, particle.lng);
      squaredSpread += particle.weight * distanceMeters * distanceMeters;
    }

    const particleSpread = Math.sqrt(Math.max(0, squaredSpread));
    const accuracyMeters = clamp(particleSpread, FUSION_ACCURACY_MIN_M, FUSION_ACCURACY_MAX_M);

    const particleConcentration = clamp01(
      1 - ((accuracyMeters - FUSION_ACCURACY_MIN_M) / (FUSION_ACCURACY_MAX_M - FUSION_ACCURACY_MIN_M)),
    );
    const bleRecencyScore = clamp01(1 - this.stepsSinceLastBle / FUSION_UNKNOWN_AFTER_STEPS) * this.lastBleConfidence;
    const motionContinuityScore = this.lastMotionFiniteEstimate ? 1 : 0;
    const confidence = clamp01(
      0.45 * particleConcentration + 0.35 * bleRecencyScore + 0.20 * motionContinuityScore,
    );

    let confidenceLevel: FusionConfidenceLevel;
    if (!this.hasBleAnchor || this.stepsSinceLastBle >= FUSION_UNKNOWN_AFTER_STEPS) {
      confidenceLevel = 'unknown';
    } else if (confidence >= FUSION_HIGH_CONFIDENCE) {
      confidenceLevel = 'high';
    } else if (confidence >= FUSION_LOW_CONFIDENCE) {
      confidenceLevel = 'medium';
    } else {
      confidenceLevel = 'low';
    }

    const headingDeg = circularMeanDeg(this.particles);
    const source: FusionSource = !this.hasBleAnchor
      ? 'unavailable'
      : this.stepsSinceLastBle === 0
        ? 'ble'
        : 'fused';

    return {
      lat: centerLat,
      lng: centerLng,
      headingDeg,
      accuracyMeters,
      confidence,
      confidenceLevel,
      source,
      floorKey: this.particles[0].floorKey ?? this.floorKey,
      inferredZone: inferZone(centerLat, centerLng, this.particles[0].floorKey ?? this.floorKey),
      stepsSinceLastBle: this.stepsSinceLastBle,
      particleCount: this.particles.length,
      particleSpread,
      unavailableReason: this.hasBleAnchor ? null : this.unavailableReason,
      lastUpdateTime: this.lastUpdateTime,
    };
  }

  resetUnavailable(reason: string): void {
    this.particles = [];
    this.hasBleAnchor = false;
    this.lastBleConfidence = 0;
    this.stepsSinceLastBle = 0;
    this.lastMotionFiniteEstimate = false;
    this.floorKey = '';
    this.unavailableReason = reason;
    this.lastUpdateTime = 0;
  }

  private normalizeWeights(): void {
    if (this.particles.length === 0) {
      return;
    }

    const totalWeight = this.particles.reduce((sum, particle) => sum + particle.weight, 0);
    if (totalWeight <= 0 || !Number.isFinite(totalWeight)) {
      const uniformWeight = 1 / this.particles.length;
      for (const particle of this.particles) {
        particle.weight = uniformWeight;
      }
      return;
    }

    for (const particle of this.particles) {
      particle.weight /= totalWeight;
    }
  }

  private effectiveSampleSize(): number {
    if (this.particles.length === 0) {
      return 0;
    }

    const sumSquares = this.particles.reduce((sum, particle) => sum + particle.weight * particle.weight, 0);
    return sumSquares > 0 ? 1 / sumSquares : 0;
  }

  private resampleParticles(): void {
    const particleCount = this.particles.length;
    if (particleCount === 0) {
      return;
    }

    const cumulativeWeights: number[] = [];
    let runningTotal = 0;
    for (const particle of this.particles) {
      runningTotal += particle.weight;
      cumulativeWeights.push(runningTotal);
    }

    const step = 1 / particleCount;
    let index = 0;
    let target = this.rng() * step;
    const nextParticles: FusionParticle[] = [];

    for (let count = 0; count < particleCount; count += 1) {
      while (index < particleCount - 1 && target > cumulativeWeights[index]) {
        index += 1;
      }

      nextParticles.push(cloneParticle(this.particles[index]));
      target += step;
    }

    const uniformWeight = 1 / particleCount;
    for (const particle of nextParticles) {
      particle.weight = uniformWeight;
    }

    this.particles = nextParticles;
  }

  private static createSeededRng(seed: number): () => number {
    let state = seed >>> 0;

    return (): number => {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }
}
