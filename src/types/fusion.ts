import type { CampusFeatureCategory } from './geojson';

export type FusionSource = 'ble' | 'motion' | 'fused' | 'unavailable';

export type FusionConfidenceLevel = 'high' | 'medium' | 'low' | 'unknown';

export interface FusionParticle {
  lat: number;
  lng: number;
  weight: number;
  floorKey: string;
  headingDeg: number;
}

export interface FusionState {
  lat: number;
  lng: number;
  headingDeg: number | null;
  accuracyMeters: number;
  confidence: number;
  confidenceLevel: FusionConfidenceLevel;
  source: FusionSource;
  floorKey: string;
  inferredZone: ZoneInference | null;
  stepsSinceLastBle: number;
  particleCount: number;
  particleSpread: number;
  unavailableReason: string | null;
  lastUpdateTime: number;
}

export interface FusionMotionEvent {
  steps: number;
  heading: number;
  userAccelerationMagnitude: number;
  timestamp: number;
}

export interface FusionBleObservation {
  lat: number;
  lng: number;
  confidence: number;
  floorKey: string;
  accuracyMeters: number;
  timestamp: number;
  apCount: number;
}

export interface ZoneInference {
  zoneId: string | null;
  zoneName: string | null;
  zoneNameKo: string | null;
  category: CampusFeatureCategory;
  floorKey: string;
  isInsideKnownZone: boolean;
}
