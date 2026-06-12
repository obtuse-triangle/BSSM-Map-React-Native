/**
 * DOCUMENTATION/VALIDATOR TEMPLATE for the Android continuous BLE scan harness.
 *
 * This file is NOT meant to be invoked directly via `npx ts-node` or a
 * similar direct Node-native-module invocation.  BLE scans require the
 * full React Native runtime and the `AndroidBlePositioning` native module,
 * neither of which is available in a plain Node process.
 *
 * The actual runtime execution path is:
 *   1. The harness module `src/dev/androidBleHarness.ts` self-registers
 *      `runAndroidBleContinuousHarness` on
 *      `globalThis.__androidBleHarness.continuous` behind the `__DEV__`
 *      guard, so any development build already exposes it on the JS
 *      global without any further wiring in `index.ts`.
 *   2. Run `npx expo run:android --device` to launch the app on a real
 *      Android device with Bluetooth enabled and Aruba/HPE beacons in range.
 *   3. In the Metro / React Native JS console, run:
 *        await globalThis.__androidBleHarness.continuous()
 *   4. Inspect the returned `ContinuousHarnessResult` object (see shape
 *      below) for `passed === true` and `stopRespected === true`.
 *
 * No edit to `index.ts` is required: the harness self-registers on
 * import via the `if (__DEV__) { ... }` block at the bottom of
 * `src/dev/androidBleHarness.ts`.  Any temporary import that was added
 * during early bring-up should be removed before commit; it is not
 * required for the harness to be reachable from the console.
 *
 * See scripts/android-ble-dev-harness.md for the complete step-by-step.
 *
 * ── Stop-Semantics Contract ───────────────────────────────────────────
 * The continuous harness proves that the scanner's stop actually halts
 * event delivery, not just that it stops the underlying `ScanCallback`.
 * It does this with a closure-captured `stopped` flag:
 *
 *   1. Subscribe to `onArubaBleObservation`.
 *   2. Call `startContinuousArubaBleScan()`.
 *   3. Wait `scanDurationMs` (default 5000) — events received during
 *      this window increment `eventsWhileScanning` (and pass the same
 *      field/regex validation contract as the one-shot harness).
 *   4. Call `stopArubaBleScan()` and set `stopped = true` in the same
 *      tick.  Subsequent events are bucketed as `eventsAfterStop`
 *      regardless of their payload validity.
 *   5. Wait an additional `settleMs` (default 2000) to drain any
 *      already-queued events.
 *   6. Unsubscribe via `sub.remove()` and return the result.
 *
 * Pass conditions (all required):
 *   - eventsWhileScanning > 0
 *   - eventsAfterStop === 0
 *   - stopRespected === (eventsAfterStop === 0)
 *   - errors.length === 0  (no field/regex violations observed)
 *
 * The harness returns:
 *   {
 *     passed: boolean,
 *     totalObservations: number,
 *     validObservations: number,
 *     eventsWhileScanning: number,
 *     eventsAfterStop: number,
 *     stopRespected: boolean,
 *     errors: string[],
 *     durationMs: number,
 *   }
 *
 * ── Why this file ships at all ───────────────────────────────────────
 * It exists to:
 *   (a) document the stop-semantics contract in source control, and
 *   (b) make the stop-window defaults and pass-conditions
 *       machine-discoverable by future tooling.
 *
 * No code is executed on import; the export below is a frozen constant
 * used solely as a contract reference.
 */
export const ANDROID_BLE_CONTINUOUS_VALIDATION_DOCS = {
  defaultScanDurationMs: 5000,
  defaultSettleMs: 2000,
  /** Pass requires at least one event during the scan window. */
  requireEventsWhileScanning: true,
  /** Pass requires zero events after `stopArubaBleScan()` returns. */
  requireZeroEventsAfterStop: true,
  /** `stopRespected` is derived as `eventsAfterStop === 0`. */
  stopRespectedIsZeroEventsAfterStop: true,
} as const;
