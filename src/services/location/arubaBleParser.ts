/**
 * Pure TypeScript mirror of the iOS Aruba BLE manufacturer-data parser.
 *
 * Intended as the **spec** that the Android Kotlin implementation (Task 2)
 * must match.  Because this is a pure function with no native dependencies
 * it can be unit-tested in isolation and serve as the reference contract.
 *
 * @see modules/ios-ble-positioning/ios/ExpoBlePositioning/ExpoBlePositioningModule.swift:455
 */

import type { ArubaBleObservation } from './bleScannerTypes';

const ARUBA_MANUFACTURER_ID = 0x011B; // 283 decimal

/**
 * Parse an Aruba/HPE manufacturer-specific BLE advertisement.
 *
 * Semantics mirror the iOS `ArubaBleScanDelegate`:
 *  1. Reject advertisements whose `manufacturerId` !== 0x011B → return `null`.
 *  2. Build a lowercase contiguous hex string from the raw bytes.
 *  3. If bytes.length >= 9, extract bytes [3…8], reverse them, and format
 *     as colon-separated lowercase hex → this is the BLE MAC (`bleIdentifier`).
 *  4. Otherwise fall back to `"${deviceAddress}_${payloadHex.slice(0, 8)}"`.
 *
 * @param deviceAddress  – peripheral identifier (used only in short-payload fallback).
 * @param manufacturerId – company identifier from the BLE advertisement.
 * @param bytes          – raw manufacturer-specific data bytes.
 * @param observedAt     – epoch timestamp (ms) to pass through to the result.
 * @param rssi           – signal strength (dBm) to pass through to the result.
 * @returns A populated `ArubaBleObservation` or `null` when the manufacturer does not match.
 */
export function parseArubaManufacturerDataForTests(
  deviceAddress: string,
  manufacturerId: number,
  bytes: number[],
  observedAt: number,
  rssi: number,
): ArubaBleObservation | null {
  // Filter for HPE / Aruba (0x011B)
  if (manufacturerId !== ARUBA_MANUFACTURER_ID) {
    return null;
  }

  // Full manufacturer payload as a contiguous lowercase hex string
  const payloadHex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');

  // Extract BLE MAC from bytes [3…8] (little-endian, reversed)
  let bleIdentifier: string;
  if (bytes.length >= 9) {
    const macBytes = bytes.slice(3, 9).reverse();
    bleIdentifier = macBytes.map((b) => b.toString(16).padStart(2, '0')).join(':');
  } else {
    // Fallback for truncated payloads
    bleIdentifier = `${deviceAddress}_${payloadHex.slice(0, 8)}`;
  }

  return {
    bleIdentifier,
    manufacturerId,
    rssi,
    payloadHex,
    observedAt,
  };
}
