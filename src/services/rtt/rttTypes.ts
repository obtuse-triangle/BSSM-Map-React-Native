import type { AccessPoint } from '../../types/accessPoint';
import type { FloorKey } from '../../types/floorMap';

export type RttMeasurementSource = 'mock-rtt' | 'android-wifi-rtt';

export interface RttMeasurement {
  accessPointId: string;
  floorKey: FloorKey;
  ssid: string;
  bssid: string;
  distanceMeters: number;
  rssiDbm: number;
  measuredAt: number;
  source: RttMeasurementSource;
  isValid: boolean;
}

export interface RttScanRequest {
  floorKey: FloorKey;
  accessPoints: readonly AccessPoint[];
  measuredAt?: number;
}

export interface RttScanResult {
  floorKey: FloorKey;
  accessPoints: readonly AccessPoint[];
  measurements: readonly RttMeasurement[];
  referencePosition: {
    x: number;
    y: number;
  };
  measuredAt: number;
  source: RttMeasurementSource;
}
