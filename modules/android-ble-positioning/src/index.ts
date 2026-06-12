import { NativeModule, requireNativeModule } from 'expo-modules-core';

import type { ArubaBleObservation } from '../../../src/services/location/bleScannerTypes';

/** Events emitted by the Android BLE positioning native module. */
type AndroidBlePositioningEvents = {
  onArubaBleObservation: (event: ArubaBleObservation) => void;
  onArubaBleScanError: (event: { code: string; message: string }) => void;
  [event: string]: (...args: any[]) => void;
};

declare class AndroidBlePositioningModule extends NativeModule<AndroidBlePositioningEvents> {
  /** Returns true when the Bluetooth adapter is present and powered on. */
  isBleAvailable(): Promise<boolean>;

  /** Returns true when all required BLE runtime permissions are granted. */
  requestBlePermissions(): Promise<boolean>;

  // TODO(android-ble): implemented in Task 3
  startArubaBleScan(durationMs?: number): Promise<ArubaBleObservation[]>;

  // TODO(android-ble): implemented in Task 3
  startContinuousArubaBleScan(): void;

  // TODO(android-ble): implemented in Task 3
  stopArubaBleScan(): void;
}

const AndroidBlePositioning = requireNativeModule<AndroidBlePositioningModule>('AndroidBlePositioning');
export { AndroidBlePositioning, ArubaBleObservation };
