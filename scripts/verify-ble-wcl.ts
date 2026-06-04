/**
 * scripts/verify-ble-wcl.ts
 *
 * Deterministic verification for the BLE weighted-centroid algorithm.
 *
 * Run with:  npx tsx scripts/verify-ble-wcl.ts
 *
 * Each test case checks one aspect of the algorithm, logs a PASS/FAIL
 * line, and sets the exit code to 1 if any case fails.
 */

import type { BleAccessPoint5183 } from '../src/types/bleAccessPoint';
import {
  type BleObservation,
  type BleWeightedCentroidResult,
  computeBleWeightedCentroid,
} from '../src/services/location/bleWeightedCentroid';
import { transformEpsg5183ToWgs84 } from '../src/utils/coordinateTransform';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EPSILON = 1e-8;

let failures = 0;
let totalTests = 0;

function assert(
  condition: boolean,
  label: string,
): void {
  totalTests++;
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    console.log(`  ✗ ${label}`);
    failures++;
  }
}

function assertApproxEqual(
  actual: number,
  expected: number,
  eps: number,
  label: string,
): void {
  const diff = Math.abs(actual - expected);
  assert(diff <= eps, `${label}  (expected ${expected}, got ${actual}, diff ${diff})`);
}

function assertSuccess(
  result: BleWeightedCentroidResult,
  label: string,
): asserts result is Extract<BleWeightedCentroidResult, { longitude: number }> {
  assert('reason' in result === false, `${label} — expected success, got failure: ${(result as any).reason}`);
}

function assertFailure(
  result: BleWeightedCentroidResult,
  label: string,
): asserts result is Extract<BleWeightedCentroidResult, { reason: string }> {
  assert('reason' in result, `${label} — expected failure, got success`);
  assert((result as any).reason === 'INSUFFICIENT_APS', `${label} — expected reason INSUFFICIENT_APS, got ${(result as any).reason}`);
}

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const MANUFACTURER_ARUBA = 0x011b;

/**
 * Three APs arranged in a triangle in EPSG:5183 space.
 * Realistic Korean TM coordinates (school in central Korea).
 */
const apA: BleAccessPoint5183 = {
  id: 'ap-a',
  bleIdentifier: 'beacon-alpha',
  manufacturerId: MANUFACTURER_ARUBA,
  floorKey: '3',
  x5183: 350_000,
  y5183: 550_000,
  label: '테스트 AP-A',
};

const apB: BleAccessPoint5183 = {
  id: 'ap-b',
  bleIdentifier: 'beacon-beta',
  manufacturerId: MANUFACTURER_ARUBA,
  floorKey: '3',
  x5183: 350_100,
  y5183: 550_000,
  label: '테스트 AP-B',
};

const apC: BleAccessPoint5183 = {
  id: 'ap-c',
  bleIdentifier: 'beacon-gamma',
  manufacturerId: MANUFACTURER_ARUBA,
  floorKey: '3',
  x5183: 350_050,
  y5183: 550_100,
  label: '테스트 AP-C',
};

/** A reference "now" timestamp so tests are deterministic. */
const NOW = 1_700_000_000_000;
const OLD = NOW - 130_000; // 130 seconds ago — beyond 120s limit

// ===========================================================================
// Test 1: Equal-RSSI APs → centroid near arithmetic mean
// ===========================================================================
console.log('\n── Test 1: Equal-RSSI centroid ──────────────────────');

(function testEqualRssiCentroid() {
  const obsA: BleObservation = { bleIdentifier: 'beacon-alpha', rssi: -60, observedAt: NOW, floorKey: '3' };
  const obsB: BleObservation = { bleIdentifier: 'beacon-beta',  rssi: -60, observedAt: NOW, floorKey: '3' };
  const obsC: BleObservation = { bleIdentifier: 'beacon-gamma', rssi: -60, observedAt: NOW, floorKey: '3' };

  const result = computeBleWeightedCentroid([apA, apB, apC], [obsA, obsB, obsC], { now: NOW });
  assertSuccess(result, 'should succeed with 3 equal-RSSI APs');

  // For equal RSSI, the weight is the same for all APs.
  // Expected EPSG:5183 centroid:
  //   x = (350000 + 350100 + 350050) / 3 = 350050
  //   y = (550000 + 550000 + 550100) / 3 = 550033.333...
  const expectedX = 350050;
  const expectedY = 550000 + 100 / 3; // 550033.333...
  const [expectedLng, expectedLat] = transformEpsg5183ToWgs84(expectedX, expectedY);

  assertApproxEqual(result.longitude, expectedLng, EPSILON, 'longitude matches independent transform');
  assertApproxEqual(result.latitude, expectedLat, EPSILON, 'latitude matches independent transform');
  assert(result.usedApCount === 3, 'usedApCount === 3');
  assert(result.staleSampleCount === 0, 'staleSampleCount === 0');
  assert(result.confidence >= 0 && result.confidence <= 1, 'confidence in [0, 1]');
  assert(result.accuracyMeters > 0, 'accuracyMeters > 0');
  assert(result.computedAt === NOW, 'computedAt matches provided "now"');
})();

// ===========================================================================
// Test 2: Strong AP pulls centroid closer than weak AP
// ===========================================================================
console.log('\n── Test 2: Strong AP pull ───────────────────────────');

(function testStrongPull() {
  // AP-A at RSSI -40 (very strong), AP-B at RSSI -80 (weak)
  // Centroid should be much closer to AP-A than AP-B
  const strong: BleObservation = { bleIdentifier: 'beacon-alpha', rssi: -40, observedAt: NOW, floorKey: '3' };
  const weak: BleObservation   = { bleIdentifier: 'beacon-beta',  rssi: -80, observedAt: NOW, floorKey: '3' };

  // Need at least 3, so add another moderate AP
  const mid: BleObservation    = { bleIdentifier: 'beacon-gamma', rssi: -60, observedAt: NOW, floorKey: '3' };

  const result = computeBleWeightedCentroid([apA, apB, apC], [strong, weak, mid], { now: NOW });
  assertSuccess(result, 'should succeed');

  // Weights:
  //   strong (rssi -40): 10^((-40+100)/20) = 10^3   = 1000
  //   weak   (rssi -80): 10^((-80+100)/20) = 10^1   = 10
  //   mid    (rssi -60): 10^((-60+100)/20) = 10^2   = 100
  //
  // SumWeight = 1000 + 10 + 100 = 1110
  // Centroid X = (1000*350000 + 10*350100 + 100*350050) / 1110
  //            = (350000000 + 3501000 + 35005000) / 1110
  //            = 388506000 / 1110
  //            = 350005.405...
  //
  // This is MUCH closer to apA.x (350000) than apB.x (350100)

  // The longitude should be closer to apA's longitude than apB's longitude
  const [lngA] = transformEpsg5183ToWgs84(apA.x5183, apA.y5183);
  const [lngB] = transformEpsg5183ToWgs84(apB.x5183, apB.y5183);

  const distToA = Math.abs(result.longitude - lngA);
  const distToB = Math.abs(result.longitude - lngB);

  assert(distToA < distToB, 'centroid longitude is closer to strong AP (A) than weak AP (B)');

  // Also verify directly: the 5183 centroid X should be < 350010 (pulled toward apA at 350000)
  // Since the result is in WGS84 and the transform is monotonic, this should hold
  console.log(`    Strong AP longitude:  ${lngA}`);
  console.log(`    Weak AP longitude:    ${lngB}`);
  console.log(`    Result longitude:     ${result.longitude}`);
  console.log(`    Distance to strong:   ${distToA}`);
  console.log(`    Distance to weak:     ${distToB}`);
})();

// ===========================================================================
// Test 3: Fewer than 3 valid APs → INSUFFICIENT_APS
// ===========================================================================
console.log('\n── Test 3: Insufficient APs ─────────────────────────');

(function testInsufficientAps() {
  const obsA: BleObservation = { bleIdentifier: 'beacon-alpha', rssi: -60, observedAt: NOW, floorKey: '3' };
  const obsB: BleObservation = { bleIdentifier: 'beacon-beta',  rssi: -60, observedAt: NOW, floorKey: '3' };

  const result = computeBleWeightedCentroid([apA, apB], [obsA, obsB], { now: NOW });
  assertFailure(result, '2 APs with 2 observations => INSUFFICIENT_APS');
  console.log(`    reason: ${result.reason}`);
})();

// ===========================================================================
// Test 4: RSSI below -90 rejected before minimum-count check
// ===========================================================================
console.log('\n── Test 4: RSSI threshold rejection ──────────────────');

(function testRssiThreshold() {
  // Three APs but two have RSSI < -90
  const obsA: BleObservation = { bleIdentifier: 'beacon-alpha', rssi: -60,  observedAt: NOW, floorKey: '3' };
  const obsB: BleObservation = { bleIdentifier: 'beacon-beta',  rssi: -95,  observedAt: NOW, floorKey: '3' };
  const obsC: BleObservation = { bleIdentifier: 'beacon-gamma', rssi: -100, observedAt: NOW, floorKey: '3' };

  const result = computeBleWeightedCentroid([apA, apB, apC], [obsA, obsB, obsC], { now: NOW });
  assertFailure(result, '2 out of 3 RSSI below -90 => INSUFFICIENT_APS');
  console.log(`    reason: ${result.reason}`);
})();

// ===========================================================================
// Test 5: Samples older than 120s rejected
// ===========================================================================
console.log('\n── Test 5: Stale sample rejection ────────────────────');

(function testStaleRejection() {
  // All three observations are stale (>120s old)
  const obsA: BleObservation = { bleIdentifier: 'beacon-alpha', rssi: -60, observedAt: OLD, floorKey: '3' };
  const obsB: BleObservation = { bleIdentifier: 'beacon-beta',  rssi: -60, observedAt: OLD, floorKey: '3' };
  const obsC: BleObservation = { bleIdentifier: 'beacon-gamma', rssi: -60, observedAt: OLD, floorKey: '3' };

  const result = computeBleWeightedCentroid([apA, apB, apC], [obsA, obsB, obsC], { now: NOW });
  assertFailure(result, '3 stale observations => INSUFFICIENT_APS');
  console.log(`    reason: ${result.reason}`);

  // Now test mixed: 3 fresh + 1 duplicate-stale => succeeds (3 valid pairs + 1 stale)
  const obsA2: BleObservation = { bleIdentifier: 'beacon-alpha', rssi: -60, observedAt: NOW, floorKey: '3' };
  const obsB2: BleObservation = { bleIdentifier: 'beacon-beta',  rssi: -60, observedAt: NOW, floorKey: '3' };
  const obsC2: BleObservation = { bleIdentifier: 'beacon-gamma', rssi: -60, observedAt: NOW, floorKey: '3' };
  const obsD2: BleObservation = { bleIdentifier: 'beacon-alpha', rssi: -60, observedAt: OLD, floorKey: '3' };

  const result2 = computeBleWeightedCentroid([apA, apB, apC], [obsA2, obsB2, obsC2, obsD2], { now: NOW });
  assertSuccess(result2, '3 fresh + 1 duplicate-stale => still succeeds');
  assert(result2.usedApCount === 3, 'usedApCount === 3 (3 fresh observations)');
  assert(result2.staleSampleCount === 1, 'staleSampleCount === 1 (1 stale observation rejected)');
  console.log(`    usedApCount: ${result2.usedApCount}, staleSampleCount: ${result2.staleSampleCount}`);
})();

// ===========================================================================
// Summary
// ===========================================================================
console.log(`\n══════════════════════════════════════════════════════`);
console.log(`  ${totalTests - failures} / ${totalTests} tests passed`);
if (failures > 0) {
  console.log(`  ${failures} FAILURE(S)`);
  throw new Error(`Verification failed: ${failures} test(s) did not pass`);
} else {
  console.log('  All tests passed.');
}
