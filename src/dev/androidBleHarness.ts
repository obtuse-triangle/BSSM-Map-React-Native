/**
 * src/dev/androidBleHarness.ts
 *
 * Dev-only QA harness for the Android BLE scanner.
 *
 * The harness exports two functions that wrap `getBleScanner()` from the
 * platform-neutral adapter:
 *
 *   • runAndroidBleOneShotHarness(durationMs)
 *       — calls `scanner.startArubaBleScan(durationMs)` and validates
 *         every returned `ArubaBleObservation` against the same
 *         field/regex contract that `arubaBleParserContract.test.ts`
 *         locks in for the parser layer.
 *
 *   • runAndroidBleContinuousHarness(scanDurationMs, settleMs)
 *       — subscribes to `onArubaBleObservation`, starts a continuous
 *         scan, collects for `scanDurationMs`, calls
 *         `scanner.stopArubaBleScan()`, then waits `settleMs` to
 *         confirm that no further events are emitted (stop-semantics
 *         proof).
 *
 * Both functions return a `HarnessValidationResult` (or the
 * `ContinuousHarnessResult` extension) with `passed`, counters, and
 * the collected error messages.
 *
 * ── Why this lives in `src/dev/` ─────────────────────────────────────
 * Pure-Node execution of BLE scanning is impossible: the Android
 * scanner requires the `AndroidBlePositioning` Expo native module and
 * the full React Native runtime. The harness therefore attaches
 * itself to `globalThis.__androidBleHarness` behind the `__DEV__`
 * guard, so it can be invoked from the Metro / React Native JS
 * console of a development build running on a real Android device
 * with Aruba/HPE beacons in range.
 *
 * See:
 *   • scripts/android-ble-dev-harness.md — invocation steps
 *   • docs/android-ble-field-qa.md        — field QA matrix
 */

import { getBleScanner } from '../services/location/bleScannerAdapter';
import type { ArubaBleObservation } from '../services/location/bleScannerTypes';

const MAC_REGEX = /^[0-9a-f]{2}(?::[0-9a-f]{2}){5}$/;
const HEX_REGEX = /^[0-9a-f]+$/;
const EXPECTED_MANUFACTURER_ID = 283; // 0x011B

export interface HarnessValidationResult {
  passed: boolean;
  totalObservations: number;
  validObservations: number;
  errors: string[];
  durationMs: number;
}

function validateObservation(o: ArubaBleObservation): string[] {
  const errs: string[] = [];
  if (typeof o.bleIdentifier !== 'string') errs.push('bleIdentifier not a string');
  if (!MAC_REGEX.test(o.bleIdentifier)) errs.push(`bleIdentifier not a colon-separated MAC: ${o.bleIdentifier}`);
  if (o.manufacturerId !== EXPECTED_MANUFACTURER_ID) errs.push(`manufacturerId=${o.manufacturerId} (expected ${EXPECTED_MANUFACTURER_ID})`);
  if (typeof o.rssi !== 'number' || !Number.isFinite(o.rssi)) errs.push(`rssi not a finite number: ${o.rssi}`);
  if (typeof o.payloadHex !== 'string' || !HEX_REGEX.test(o.payloadHex)) errs.push(`payloadHex not lowercase hex: ${o.payloadHex}`);
  if (typeof o.observedAt !== 'number' || o.observedAt <= 0) errs.push(`observedAt not a positive ms epoch: ${o.observedAt}`);
  return errs;
}

export async function runAndroidBleOneShotHarness(durationMs = 5000): Promise<HarnessValidationResult> {
  const scanner = getBleScanner();
  if (!scanner) {
    return {
      passed: false, totalObservations: 0, validObservations: 0,
      errors: ['No BLE scanner adapter available on this platform/build'],
      durationMs: 0,
    };
  }
  const start = Date.now();
  const observations = await scanner.startArubaBleScan(durationMs);
  const allErrors: string[] = [];
  let valid = 0;
  for (const obs of observations) {
    const errs = validateObservation(obs);
    if (errs.length === 0) valid++;
    else allErrors.push(...errs.map(e => `obs[${obs.bleIdentifier}]: ${e}`));
  }
  return {
    passed: observations.length > 0 && allErrors.length === 0,
    totalObservations: observations.length,
    validObservations: valid,
    errors: allErrors,
    durationMs: Date.now() - start,
  };
}

export interface ContinuousHarnessResult extends HarnessValidationResult {
  eventsWhileScanning: number;
  eventsAfterStop: number;
  stopRespected: boolean;
}

export async function runAndroidBleContinuousHarness(scanDurationMs = 5000, settleMs = 2000): Promise<ContinuousHarnessResult> {
  const scanner = getBleScanner();
  if (!scanner) {
    return {
      passed: false, totalObservations: 0, validObservations: 0,
      eventsWhileScanning: 0, eventsAfterStop: 0, stopRespected: false,
      errors: ['No BLE scanner adapter available'], durationMs: 0,
    };
  }
  const allErrors: string[] = [];
  let scanningEvents = 0;
  let postStopEvents = 0;
  let stopped = false;
  const sub = scanner.addListener('onArubaBleObservation', (obs) => {
    if (stopped) {
      postStopEvents++;
      return;
    }
    const errs = validateObservation(obs);
    if (errs.length === 0) scanningEvents++;
    else allErrors.push(...errs.map(e => `obs[${obs.bleIdentifier}]: ${e}`));
  });
  scanner.startContinuousArubaBleScan();
  await new Promise(r => setTimeout(r, scanDurationMs));
  scanner.stopArubaBleScan();
  stopped = true;
  await new Promise(r => setTimeout(r, settleMs));
  sub.remove();
  return {
    passed: scanningEvents > 0 && postStopEvents === 0,
    totalObservations: scanningEvents + postStopEvents,
    validObservations: scanningEvents,
    eventsWhileScanning: scanningEvents,
    eventsAfterStop: postStopEvents,
    stopRespected: postStopEvents === 0,
    errors: allErrors,
    durationMs: scanDurationMs + settleMs,
  };
}

/**
 * Dev-only global harness binding. When `__DEV__` is true, this attaches
 * the harness to `globalThis.__androidBleHarness` so it can be invoked
 * from the Metro / React Native JS console.
 */
if (__DEV__) {
  const harness = {
    oneShot: runAndroidBleOneShotHarness,
    continuous: runAndroidBleContinuousHarness,
  };
  (globalThis as unknown as { __androidBleHarness: typeof harness }).__androidBleHarness = harness;
}
