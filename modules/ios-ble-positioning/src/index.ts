import { NativeModule, requireNativeModule } from 'expo-modules-core';

interface BleMeasurement {
  identifier: string;
  rssi: number;
  distanceEstimate: number;
  timestamp: number;
}

interface LatLng {
  latitude: number;
  longitude: number;
}

declare class IosBlePositioningModule extends NativeModule {
  isBleAvailable(): Promise<boolean>;
  startBleScan(serviceUuids: string[] | null): Promise<BleMeasurement[]>;
  getCurrentLocation(): Promise<LatLng>;
}

const IosBlePositioning = requireNativeModule<IosBlePositioningModule>('IosBlePositioning');
export { IosBlePositioning, BleMeasurement, LatLng };
