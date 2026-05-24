import type { FloorKey } from './floorMap';

export type IndoorCoordinateMode = 'map-percent';

export type IndoorPositionSource = 'mock-rtt' | 'android-wifi-rtt' | 'ios-core-location';

export type IndoorPositionPrecision = 'precise' | 'limited';

export type IndoorPositionStatus = 'idle' | 'loading' | 'success' | 'error';

export interface IndoorPosition {
  floorKey: FloorKey;
  x: number;
  y: number;
  accuracyMeters: number;
  source: IndoorPositionSource;
  precision: IndoorPositionPrecision;
  precisionNotes: readonly string[];
  isIndoorPrecise: boolean;
  isFloorGuaranteed: boolean;
  isRoomGuaranteed: boolean;
  coordinateMode: IndoorCoordinateMode;
  updatedAt: number;
}
