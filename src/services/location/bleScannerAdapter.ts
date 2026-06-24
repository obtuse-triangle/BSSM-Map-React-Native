/**
 * Platform-neutral BLE scanner adapter.
 *
 * Selects between iOS `IosBlePositioning` and Android `AndroidBlePositioning`
 * based on `Platform.OS`. Returns `null` when the platform has no scanner
 * or when the native module is unavailable (e.g. unbuilt, missing peer dep).
 *
 * Never imports native modules statically — uses dynamic `require()` inside
 * a try/catch to tolerate the module being absent.
 *
 * The resolved adapter is cached so subsequent calls avoid re-resolution.
 * `__resetBleScannerAdapterForTests()` is provided as a test-only escape
 * hatch so unit tests can swap `Platform.OS` between cases.
 */
import { Platform } from 'react-native';
import type { EventSubscription } from 'expo-modules-core';
import type { ArubaBleObservation } from './bleScannerTypes';

export type { ArubaBleObservation };

/**
 * Minimal, platform-neutral surface used by the WCL provider and the
 * continuous BLE scan store. Both iOS and Android native modules conform
 * to this shape (with `requestBlePermissions` being a no-op on iOS).
 */
export interface BleScannerAdapter {
  isBleAvailable(): Promise<boolean>;
  requestBlePermissions(): Promise<boolean>;
  startArubaBleScan(durationMs?: number): Promise<ArubaBleObservation[]>;
  startContinuousArubaBleScan(): void;
  stopArubaBleScan(): void;
  addListener(
    event: 'onArubaBleObservation',
    cb: (event: ArubaBleObservation) => void,
  ): EventSubscription;
}

let cached: BleScannerAdapter | null = null;
let cachedResolved = false;

/**
 * Resolve the platform-appropriate BLE scanner adapter, or `null` if the
 * current platform has no scanner or the native module is unavailable.
 *
 * Subsequent calls return the cached instance until
 * `__resetBleScannerAdapterForTests()` clears the cache.
 */
export function getBleScanner(): BleScannerAdapter | null {
  if (cachedResolved) return cached;
  cachedResolved = true;
  try {
    if (Platform.OS === 'ios') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ios = require('../../../modules/ios-ble-positioning/src').IosBlePositioning;
      if (ios && typeof ios.startArubaBleScan === 'function') {
        cached = {
          isBleAvailable: () => {
            try { return Promise.resolve(ios.isBleAvailable?.() ?? false); } catch { return Promise.resolve(false); }
          },
          // iOS: BLE permission is requested by the system when the first
          // scan starts; the JS layer treats this as a pass-through.
          requestBlePermissions: () => Promise.resolve(true),
          startArubaBleScan: async (durationMs?: number) => {
            const result = await ios.startArubaBleScan?.(durationMs);
            return result ?? [];
          },
          startContinuousArubaBleScan: () => {
            try { ios.startContinuousArubaBleScan?.(); } catch { /* empty */ }
          },
          stopArubaBleScan: () => {
            try { ios.stopArubaBleScan?.(); } catch { /* empty */ }
          },
          addListener: (event, cb) => {
            try { return ios.addListener(event, cb) as EventSubscription; } catch { return { remove() {} }; }
          },
        };
        return cached;
      }
    } else if (Platform.OS === 'android') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const android =
        require('../../../modules/android-ble-positioning/src').AndroidBlePositioning;
      if (android && typeof android.startArubaBleScan === 'function') {
        cached = {
          isBleAvailable: () => {
            try { return android.isBleAvailable?.() ?? Promise.resolve(false); } catch { return Promise.resolve(false); }
          },
          requestBlePermissions: () => {
            try { return android.requestBlePermissions?.() ?? Promise.resolve(false); } catch { return Promise.resolve(false); }
          },
          startArubaBleScan: async (durationMs?: number) => {
            try {
              const result = await android.startArubaBleScan?.(durationMs);
              return result ?? [];
            } catch { return []; }
          },
          startContinuousArubaBleScan: () => {
            try { android.startContinuousArubaBleScan?.(); } catch { /* empty */ }
          },
          stopArubaBleScan: () => {
            try { android.stopArubaBleScan?.(); } catch { /* empty */ }
          },
          addListener: (event, cb) => android.addListener(event, cb) as EventSubscription,
        };
        return cached;
      }
    }
  } catch {
    // Native module unavailable — fall through to return null below.
  }
  cached = null;
  return null;
}

/** Test-only: clear the cached adapter so `getBleScanner()` re-resolves. */
export function __resetBleScannerAdapterForTests(): void {
  cached = null;
  cachedResolved = false;
}