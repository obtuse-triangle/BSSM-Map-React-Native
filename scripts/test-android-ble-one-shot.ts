/**
 * DOCUMENTATION/VALIDATOR TEMPLATE for the Android one-shot BLE scan harness.
 *
 * This file is NOT meant to be invoked directly via `npx ts-node` or a
 * similar direct Node-native-module invocation.  BLE scans require the
 * full React Native runtime and the `AndroidBlePositioning` native module,
 * neither of which is available in a plain Node process.
 *
 * The actual runtime execution path is:
 *   1. The harness module `src/dev/androidBleHarness.ts` self-registers
 *      `runAndroidBleOneShotHarness` and `runAndroidBleContinuousHarness`
 *      on `globalThis.__androidBleHarness` behind the `__DEV__` guard, so
 *      any development build already has them on the JS global without
 *      any further wiring in `index.ts`.
 *   2. Run `npx expo run:android --device` to launch the app on a real
 *      Android device with Bluetooth enabled and Aruba/HPE beacons in range.
 *   3. In the Metro / React Native JS console, run:
 *        await globalThis.__androidBleHarness.oneShot()
 *   4. Inspect the returned `HarnessValidationResult` object (see shape
 *      below) for `passed === true`.
 *
 * No edit to `index.ts` is required: the harness self-registers on
 * import via the `if (__DEV__) { ... }` block at the bottom of
 * `src/dev/androidBleHarness.ts`.  Any temporary import that was added
 * during early bring-up should be removed before commit; it is not
 * required for the harness to be reachable from the console.
 *
 * See scripts/android-ble-dev-harness.md for the complete step-by-step.
 *
 * ── Validation Contract ───────────────────────────────────────────────
 * Each `ArubaBleObservation` returned from a one-shot scan must satisfy:
 *   - bleIdentifier: string matching /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/
 *   - manufacturerId: number === 283 (0x011B for HPE/Aruba)
 *   - rssi: finite number
 *   - payloadHex: string matching /^[0-9a-f]+$/ (lowercase hex)
 *   - observedAt: number > 0 (epoch ms)
 *
 * The harness returns:
 *   {
 *     passed: boolean,
 *     totalObservations: number,
 *     validObservations: number,
 *     errors: string[],
 *     durationMs: number,
 *   }
 *
 * Pass condition:  totalObservations > 0  AND  errors.length === 0
 *
 * ── Why this file ships at all ───────────────────────────────────────
 * It exists to:
 *   (a) document the validation contract in source control, and
 *   (b) make the contract machine-discoverable by future tooling
 *       (e.g. an editor / AI agent that wants to re-derive the regex
 *       and expected manufacturer id without re-reading the harness).
 *
 * No code is executed on import; the export below is a frozen constant
 * used solely as a contract reference.
 */
export const ANDROID_BLE_ONE_SHOT_VALIDATION_DOCS = {
  macRegex: /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/,
  hexRegex: /^[0-9a-f]+$/,
  expectedManufacturerId: 283,
  defaultDurationMs: 5000,
} as const;
