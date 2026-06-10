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

/**
 * A single observation from an Aruba/HPE BLE beacon scan.
 *
 * Compatible with {@link BleApObservation} from `src/services/location/bleObservations.ts`.
 *
 * `bleIdentifier` is the real BLE MAC address extracted from Aruba
 * manufacturer-specific data bytes [3...8] in little-endian order,
 * formatted as lowercase colon-separated hex (e.g. "20:4c:03:e9:00:50").
 */
interface ArubaBleObservation {
  /** BLE MAC address extracted from Aruba manufacturer data (e.g. "20:4c:03:e9:00:50"). */
  bleIdentifier: string;
  /** Manufacturer ID (0x011B = 283 for HPE/Aruba). */
  manufacturerId: number;
  /** RSSI in dBm. */
  rssi: number;
  /** Full manufacturer-specific payload as hex string. */
  payloadHex: string;
  /** Epoch timestamp (ms) when the observation was recorded. */
  observedAt: number;
}

/** Motion sensor update from CoreMotion (pedometer + device motion heading). */
interface MotionUpdate {
  /** Cumulative step count from CMPedometer. */
  steps: number;
  /** Heading in degrees (0 = North, 90 = East, 0-360 range). */
  heading: number;
  /** Magnitude of user acceleration vector (sqrt of x²+y²+z²). */
  userAccelerationMagnitude: number;
  /** Epoch timestamp in milliseconds. */
  timestamp: number;
}

/** Events map for the native module. */
type IosBlePositioningEvents = {
  onArubaBleObservation: (event: ArubaBleObservation) => void;
  onMotionUpdate: (event: MotionUpdate) => void;
  [event: string]: (...args: any[]) => void;
};

declare class IosBlePositioningModule extends NativeModule<IosBlePositioningEvents> {
  isBleAvailable(): Promise<boolean>;
  startBleScan(serviceUuids: string[] | null): Promise<BleMeasurement[]>;
  startArubaBleScan(durationMs?: number): Promise<ArubaBleObservation[]>;
  getCurrentLocation(): Promise<LatLng>;
  requestPreciseLocationPermission(): Promise<boolean>;

  /** Start continuous scan — emits `onArubaBleObservation` events in real-time. */
  startContinuousArubaBleScan(): void;

  /** Stop the continuous scan. */
  stopArubaBleScan(): void;

  /** Start CoreMotion updates (pedometer + heading). Emits `onMotionUpdate` events. */
  startMotionUpdates(): void;

  /** Stop CoreMotion updates. */
  stopMotionUpdates(): void;

  /** Check if CoreMotion step counting and device motion are available. */
  isMotionAvailable(): Promise<boolean>;
}

const IosBlePositioning = requireNativeModule<IosBlePositioningModule>('IosBlePositioning');
export { IosBlePositioning, BleMeasurement, LatLng, ArubaBleObservation, MotionUpdate };
