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

  /**
   * Start a one-shot BLE scan for Aruba/HPE beacons.
   *
   * Scans for the given duration (clamped to [1000, 30000] ms, defaults
   * to 10000 ms) and returns all discovered Aruba observations. During
   * the scan window, `onArubaBleObservation` events are also emitted
   * for each discovered beacon.
   */
  startArubaBleScan(durationMs?: number): Promise<ArubaBleObservation[]>;

  /**
   * Start continuous BLE scanning for Aruba/HPE beacons.
   *
   * Emits `onArubaBleObservation` events in real-time until
   * `stopArubaBleScan()` is called or the module is destroyed.
   * Duplicate calls are no-ops.
   */
  startContinuousArubaBleScan(): void;

  /**
   * Stop any active continuous BLE scan.
   *
   * Stops the stored ScanCallback and clears scanning state.
   * Safe to call when no scan is active.
   */
  stopArubaBleScan(): void;
}

const AndroidBlePositioning = requireNativeModule<AndroidBlePositioningModule>('AndroidBlePositioning');
export { AndroidBlePositioning, ArubaBleObservation };
