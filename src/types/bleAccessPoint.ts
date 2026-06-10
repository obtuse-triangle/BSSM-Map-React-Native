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
 * The Aruba BLE identity is confirmed as the real BLE MAC address exposed
 * in manufacturer data bytes 3-8 (little-endian, reversed into lowercase
 * colon-separated format). Manufacturer ID remains 0x011B.
 *
 * EPSG:5183 coordinates must come from the school's site-survey /
 * architectural drawings — NOT invented.
 *
 * @see https://www.arubanetworks.com/techdocs/ArubaDocs/8.7/Content/Aruba%20Location%20Services/WCL_Concept.htm
 */
export interface BleAccessPoint5183 {
  /** Unique logical ID for this AP record (e.g. 'ble-ap-3-12') */
  id: string;

  /**
   * BLE identifier – the real BLE MAC address extracted from Aruba
   * manufacturer data bytes 3-8 (little-endian, reversed into lowercase
   * colon-separated format).
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
   * Used for debugging / verifying the payload parsing.
   */
  payloadHexExample?: string;
}

/** Alias for readability. */
export type BleAp5183 = BleAccessPoint5183;

/**
 * Filter function predicate type for querying BLE AP arrays.
 */
export type BleApPredicate = (ap: BleAccessPoint5183) => boolean;
