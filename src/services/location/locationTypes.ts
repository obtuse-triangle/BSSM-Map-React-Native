import type { AccessPoint } from '../../types/accessPoint';
import type { FloorKey } from '../../types/floorMap';
import type { IndoorPosition, IndoorPositionPrecision } from '../../types/position';
import type { RttMeasurement, RttScanResult } from '../rtt/rttTypes';

export type IndoorLocationProviderKind = 'mock-rtt' | 'android-wifi-rtt' | 'ios-core-location';

export interface IndoorLocationRequest {
  floorKey: FloorKey;
  accessPoints: readonly AccessPoint[];
  measuredAt?: number;
}

export interface IndoorLocationResult {
  providerKind: IndoorLocationProviderKind;
  measuredAt: number;
  floorKey: FloorKey;
  accessPoints: readonly AccessPoint[];
  measurements: readonly RttMeasurement[];
  referencePosition: {
    x: number;
    y: number;
  } | null;
  scanResult: RttScanResult | null;
  position: IndoorPosition;
  measurementCount: number;
  validMeasurementCount: number;
  precision: IndoorPositionPrecision;
  precisionNotes: readonly string[];
  floorGuaranteed: boolean;
  roomGuaranteed: boolean;
}

export interface IndoorLocationProvider {
  kind: IndoorLocationProviderKind;
  label: string;
  locate(request: IndoorLocationRequest): Promise<IndoorLocationResult>;
}

export interface IosCoreLocationReading {
  floorKey: FloorKey;
  latitude: number;
  longitude: number;
  horizontalAccuracyMeters?: number;
  measuredAt?: number;
}
