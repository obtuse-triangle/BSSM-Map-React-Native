import type { FloorKey } from './floorMap';

/**
 * Aruba BLE WCL access point in EPSG:5183 coordinates.
 *
 * This type models a single Aruba Beacon (or AP with BLE) that broadcasts
 * location-advertisement payloads.  Coordinates are in **EPSG:5183**
 * (Korean 2000 / Central Belt 2010 – TM) because the school site survey
 * was delivered in that CRS.  Consumers convert to WGS84 lat/lng for
 * on-device use.
 *
 * ── Blocker for Wave 1 ──────────────────────────────────────────────
 *  1. The HPE Aruba BLE payload identity field is **unknown** at this
 *     stage.  Real Aruba APs broadcast a Beacon/WCL telemetry frame
 *     (manufacturer ID 0x011B) but the exact field mapping (major/minor,
 *     eddystone-uid, or custom ADV data) must be confirmed via:
 *       - Aruba WCL API docs (HPE Aruba Wi-Fi Location Client)
 *       - Live packet capture with a BLE scanner
 *  2. EPSG:5183 coordinates must come from the school's site-survey /
 *     architectural drawings — NOT invented.
 *  3. `bleIdentifier` is a placeholder shape; the real identity schema
 *     (MAC-based? iBeacon UUID+major+minor?) depends on how the Aruba
 *     Beacons are provisioned.
 *
 * @see https://www.arubanetworks.com/techdocs/ArubaDocs/8.7/Content/Aruba%20Location%20Services/WCL_Concept.htm
 */
export interface BleAccessPoint5183 {
  /** Unique logical ID for this AP record (e.g. 'ble-ap-3-12') */
  id: string;

  /**
   * BLE identifier – for now a free-form string.
   * TODO(wave-2): Replace with a union of known identity schemas once
   * the Aruba payload field is confirmed:
   *   `{ type: 'mac'; mac: string } | { type: 'ibeacon'; uuid: string; major: number; minor: number }`
   */
  bleIdentifier: string;

  /** IEEE OUI / Bluetooth Company Identifier of the beacon manufacturer.
   *  HPE (Aruba) = 0x011B → decimal 283. */
  manufacturerId: number;

  /** Floor key the AP is installed on (matches bssmFloorMap floor keys).
   *  Example: '1', '2', '3', '4' */
  floorKey: FloorKey;

  /** EPSG:5183 X coordinate (Korean 2000 / Central Belt 2010 TM Easting). */
  x5183: number;

  /** EPSG:5183 Y coordinate (Korean 2000 / Central Belt 2010 TM Northing). */
  y5183: number;

  /** Human-readable label (e.g. '3-1 교실 북동쪽'). */
  label: string;

  /**
   * Optional raw hex dump of the Aruba BLE advertisement payload.
   * Used for debugging / reverse-engineering the identity field.
   *
   * TODO(wave-2): Remove once the payload schema is understood.
   */
  payloadHexExample?: string;
}

/** Alias for readability. */
export type BleAp5183 = BleAccessPoint5183;

/**
 * Filter function predicate type for querying BLE AP arrays.
 */
export type BleApPredicate = (ap: BleAccessPoint5183) => boolean;
