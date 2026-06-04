import type { BleAccessPoint5183 } from '../types/bleAccessPoint';

/**
 * ═══════════════════════════════════════════════════════════════════
 *  BLE AP FIXTURE DATA — NOT FOR PRODUCTION USE
 * ═══════════════════════════════════════════════════════════════════
 *
 * !!! BLOCKER: REAL AP COORDINATES ARE UNKNOWN !!!
 *
 * This array contains **synthetic fixture data** only.
 * It serves two purposes:
 *   1. Enable type-checking and unit-test authoring during Wave 1.
 *   2. Provide a visual template for the real data that will replace it.
 *
 * ── Must resolve before production ─────────────────────────────────
 *  1. EPSG:5183 COORDINATES  – Obtain from school site-survey
 *     drawings or an on-site GPS+TM measurement.  Do NOT guess or
 *     approximate from map-percent coordinates.
 *  2. BLE IDENTITY SCHEMA    – The `bleIdentifier` field shape below
 *     is **placeholder text**.  Real Aruba Beacon identity comes from
 *     the WCL advertisement payload; the exact field (MAC, iBeacon
 *     UUID+major+minor, or Eddystone-UID) is not yet known.
 *  3. HPE MANUFACTURER ID    – `0x011B` is the Bluetooth SIG-assigned
 *     Company Identifier for Hewlett Packard Enterprise.  Verify that
 *     the deployed beacons actually use this ID in their BLE ADV_IND
 *     packets.
 *
 * @see src/types/bleAccessPoint.ts  — full type documentation
 * @see docs/ble-wcl-wave-1-plan.md  — overall integration plan
 */

// ── Fixture data ───────────────────────────────────────────────────
// These entries are **NOT real**.
// They are placeholders to validate the data pipeline.
// Replace all entries once real AP coordinates and identities exist.

export const BLE_AP_FIXTURES: BleAccessPoint5183[] = [
  // =================================================================
  //  BLOCKER: Floor 1 — No EPSG:5183 data available yet
  //  Real x5183/y5183 values must come from school site survey docs.
  // =================================================================
  {
    id: 'ble-fixture-f1-ap01',
    bleIdentifier: 'placeholder-ble-id-f1-ap01',
    manufacturerId: 0x011B, // HPE / Aruba
    floorKey: '1',
    x5183: 0, // BLOCKER: Replace with EPSG:5183 Easting from survey
    y5183: 0, // BLOCKER: Replace with EPSG:5183 Northing from survey
    label: 'FIXTURE — 1층 북동쪽 (DO NOT USE IN PRODUCTION)',
  },
  {
    id: 'ble-fixture-f1-ap02',
    bleIdentifier: 'placeholder-ble-id-f1-ap02',
    manufacturerId: 0x011B,
    floorKey: '1',
    x5183: 0, // BLOCKER: Replace with EPSG:5183 Easting from survey
    y5183: 0, // BLOCKER: Replace with EPSG:5183 Northing from survey
    label: 'FIXTURE — 1층 남서쪽 (DO NOT USE IN PRODUCTION)',
  },

  // =================================================================
  //  BLOCKER: Floor 2 — No EPSG:5183 data available yet
  // =================================================================
  {
    id: 'ble-fixture-f2-ap01',
    bleIdentifier: 'placeholder-ble-id-f2-ap01',
    manufacturerId: 0x011B,
    floorKey: '2',
    x5183: 0, // BLOCKER
    y5183: 0, // BLOCKER
    label: 'FIXTURE — 2층 (DO NOT USE IN PRODUCTION)',
  },

  // =================================================================
  //  BLOCKER: Floor 3 — No EPSG:5183 data available yet
  // =================================================================
  {
    id: 'ble-fixture-f3-ap01',
    bleIdentifier: 'placeholder-ble-id-f3-ap01',
    manufacturerId: 0x011B,
    floorKey: '3',
    x5183: 0, // BLOCKER
    y5183: 0, // BLOCKER
    label: 'FIXTURE — 3층 (DO NOT USE IN PRODUCTION)',
  },

  // =================================================================
  //  BLOCKER: Floor 4 — No EPSG:5183 data available yet
  // =================================================================
  {
    id: 'ble-fixture-f4-ap01',
    bleIdentifier: 'placeholder-ble-id-f4-ap01',
    manufacturerId: 0x011B,
    floorKey: '4',
    x5183: 0, // BLOCKER
    y5183: 0, // BLOCKER
    label: 'FIXTURE — 4층 (DO NOT USE IN PRODUCTION)',
  },
] as const;

/**
 * Resolved (production) BLE AP locations by floor.
 *
 * !!! BLOCKER: This will contain the real data once surveyed.
 * The `x5183` / `y5183` values **must** come from:
 *   - Architectural floor plans in EPSG:5183
 *   - Or on-site GPS + Korean TM reverse-projection (proj4 / proj4js)
 *
 *   Until then this array is empty and all consumers must fall back
 *   to WiFi RTT positioning.
 */
export const realBleAccessPointsByFloor: Record<string, BleAccessPoint5183[]> = {
  // BLOCKER: Populate after EPSG:5183 site survey is complete.
  // TODO(wave-2): import survey CSV → group by floorKey
  '1': [],
  '2': [],
  '3': [],
  '4': [],
};
