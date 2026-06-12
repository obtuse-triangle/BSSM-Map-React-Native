/**
 * Canonical BLE scanner types shared across iOS and Android scanner modules.
 *
 * Mirrors the `ArubaBleObservation` interface from
 * `modules/ios-ble-positioning/src/index.ts` so that pure TypeScript code
 * can reference the shape without depending on the native Expo module.
 */

/**
 * A single observation from an Aruba/HPE BLE beacon scan.
 *
 * `bleIdentifier` is the real BLE MAC address extracted from Aruba
 * manufacturer-specific data bytes [3…8] in little-endian order,
 * formatted as lowercase colon-separated hex (e.g. "20:4c:03:e9:00:50").
 */
export interface ArubaBleObservation {
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

/** Event names emitted by the BLE scanner native modules. */
export type BleScannerEventName = 'onArubaBleObservation';
