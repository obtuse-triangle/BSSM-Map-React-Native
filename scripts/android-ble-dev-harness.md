# Android BLE Dev Harness — Invocation Guide

Step-by-step recipe for exercising the dev-only BLE QA harness
(`src/dev/androidBleHarness.ts`) from a real Android device.

This file is the *only* source of truth for the on-device BLE smoke.
The `scripts/test-android-ble-*.ts` files in this directory are
**DOCUMENTATION/VALIDATOR TEMPLATES** — they are not Node-runnable.

---

## 1. Why this exists

The Android BLE scanner is a thin wrapper around the system
`BluetoothLeScanner` via the `AndroidBlePositioning` Expo module. The
following execution environments **cannot** validate it:

| Environment | Why it can't run the harness |
|---|---|
| `npx ts-node scripts/test-android-ble-*.ts` (plain Node) | The `AndroidBlePositioning` native module and the React Native event loop are unavailable — `getBleScanner()` returns `null`. |
| Android emulator | Emulators have no real Bluetooth radio and the `BluetoothLeScanner` returns no advertisements; an emulator "scan" silently returns an empty array, which is indistinguishable from "no beacons in range". |
| CI runner | No real Bluetooth adapter, no beacons, no permissions, and the `__DEV__` global is not flipped on. |
| `npx jest` | The unit-test layer already covers the parser contract; the harness exists for the *runtime* contract that only a real device can exercise. |

To actually prove the scan loop — subscribe → start → emit → stop →
no-more-emit — you need:

- a **real** Android device with Bluetooth enabled,
- **physical Aruba/HPE beacons** (manufacturer id `0x011B`) within range,
- location permission granted to the app, and
- the dev build of the app running with the JS console reachable
  (Metro / React Native dev tools).

---

## 2. Prerequisites

1. **Real Android device.** USB-connected or wireless-debugging-attached.
   `adb devices` must list it as `device` (not `unauthorized` or
   `offline`).
2. **Bluetooth ON.** `Settings → Connected devices → Connection
   preferences → Bluetooth` must show "On". Confirm via
   `adb shell dumpsys bluetooth_manager | grep -i 'state:'` →
   `STATE_ON`.
3. **Location permission granted.** Android requires
   `ACCESS_FINE_LOCATION` (and on API 31+ `BLUETOOTH_SCAN` /
   `BLUETOOTH_CONNECT`) for any BLE scan. The app's permission flow
   (`usePermissions`) prompts for these — accept them.
4. **Aruba/HPE beacons in range.** At least one physical beacon
   advertising an Aruba manufacturer-data payload (`manufacturerId ===
   0x011B`) within ~5 m of the device. A working beacon is one that
   shows up in another scanner app (e.g. "nRF Connect") with a
   non-empty manufacturer-specific data blob.
5. **Dev build of the app.** Run `npx expo run:android --device`
   from the repo root. This builds a debug APK that bundles the
   `AndroidBlePositioning` module and runs JS in dev mode (the
   `__DEV__` global is `true`).
6. **JS console reachable.** Either:
   - the Metro terminal running alongside `expo run:android`, or
   - Chrome DevTools (`j` in Metro, or open `http://localhost:8081/debugger-ui`
     and use the Console tab).

> The harness's `getBleScanner()` returns `null` on iOS too, so this
> is Android-only. There is a parallel iOS BLE QA flow that is out of
> scope for this plan.

---

## 3. Temporary invocation steps

> **Heads-up.** As of this plan, the harness **self-registers** on the
> JS global via the `if (__DEV__) { ... }` block at the bottom of
> `src/dev/androidBleHarness.ts`. That means **no edit to `index.ts`
> is required** for the harness to be reachable from the console.
>
> The original bring-up recipe asked for a temporary import in
> `index.ts` so that the harness module would be guaranteed to load.
> It is kept here for parity with the plan spec, but the recommended
> path is the self-registration path. **Do not commit a permanent
> edit to `index.ts` either way.**

### 3a. Self-registration path (recommended — no `index.ts` edit)

1. Build and run the dev build:
   ```bash
   npx expo run:android --device
   ```
2. The harness module is reachable from anywhere in the JS bundle
   via the dev-only side-effect at the bottom of
   `src/dev/androidBleHarness.ts`. To make that side-effect actually
   execute, **import the module once** from any file that is
   reachable in the dev bundle. The simplest hook is the dev build
   of the BLE Status Card or the WCL provider screen. If you want a
   zero-app-edit setup, the next section shows the optional
   `index.ts` import that you can add and immediately remove.

### 3b. Optional temporary `index.ts` import (original plan spec)

If you want to guarantee the harness module loads as early as
possible, add this at the top of `index.ts` alongside the existing
imports:

```typescript
// Add at the top of index.ts (alongside existing imports):
import { runAndroidBleOneShotHarness, runAndroidBleContinuousHarness } from './src/dev/androidBleHarness';
// These will be available as globalThis.__androidBleHarness.oneShot() / .continuous()
// only because the harness itself registers them in __DEV__ mode.
// No additional wiring is required in index.ts — the harness is
// self-registering via globalThis assignment in src/dev/androidBleHarness.ts.
```

The import is **optional**. The harness's bottom-of-file
`if (__DEV__) { (globalThis as any).__androidBleHarness = ... }`
assignment runs as a side effect of the module being loaded, and
TypeScript will tree-shake the import in production. In development,
the moment **anything** in the JS bundle imports
`./src/dev/androidBleHarness`, the global is populated.

3. **Remove the temporary import from `index.ts` before commit.**
   This applies only if you took the optional path in §3b. The
   self-registration path requires no cleanup at all.

---

## 4. In the Metro console

Once the app is running on the device, type the following into the
Metro / React Native JS console:

```javascript
// One-shot: 5-second timed scan, validates every observation.
const oneShot = await globalThis.__androidBleHarness.oneShot();
console.log('one-shot', JSON.stringify(oneShot, null, 2));

// Continuous: 5 seconds of events, then stop, then 2-second settle.
const continuous = await globalThis.__androidBleHarness.continuous();
console.log('continuous', JSON.stringify(continuous, null, 2));
```

If the global is `undefined`, you skipped the import in §3. Re-do
the import step and reload the app.

---

## 5. Expected outputs

### 5a. `oneShot` (success — beacons visible)

```json
{
  "passed": true,
  "totalObservations": 14,
  "validObservations": 14,
  "errors": [],
  "durationMs": 5023
}
```

Every `ArubaBleObservation` you logged individually (if you spread
the array) will look like:

```json
{
  "bleIdentifier": "20:4c:03:e9:00:50",
  "manufacturerId": 283,
  "rssi": -68,
  "payloadHex": "1b0100ebe9034c20",
  "observedAt": 1718210000000
}
```

### 5b. `continuous` (success — events arrive, stop is respected)

```json
{
  "passed": true,
  "totalObservations": 22,
  "validObservations": 22,
  "eventsWhileScanning": 22,
  "eventsAfterStop": 0,
  "stopRespected": true,
  "errors": [],
  "durationMs": 7011
}
```

The `durationMs` is `scanDurationMs (5000) + settleMs (2000)` plus
the runtime of the `await scanner.startContinuousArubaBleScan()` /
`scanner.stopArubaBleScan()` calls.

### 5c. Field-by-field validation (one observation)

| Field | Type | Constraint | Source of truth |
|---|---|---|---|
| `bleIdentifier` | `string` | matches `/^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/` | parser `bytes[3..8].reversed().join(':')` |
| `manufacturerId` | `number` | `=== 283` (0x011B) | HPE/Aruba assigned id |
| `rssi` | `number` | finite (no `NaN` / `Infinity`) | passed through from `ScanResult.getRssi()` |
| `payloadHex` | `string` | matches `/^[0-9a-f]+$/` | `bytes.joinToString("%02x")` |
| `observedAt` | `number` | `> 0` (epoch ms) | `System.currentTimeMillis()` at scan time |

---

## 6. Cleanup

- **§3a path (self-registration, the recommended one):** nothing to
  clean up. The harness module is reachable from the JS bundle
  regardless of any `index.ts` edit, and TypeScript dead-code-
  eliminates the `if (__DEV__)` block in production builds.
- **§3b path (optional temporary `index.ts` import):** remove the
  `import { ... } from './src/dev/androidBleHarness';` line from
  `index.ts` and the surrounding comments **before commit**. The
  orchestrator will run `git status` and `git diff --stat` to
  confirm `index.ts` is unchanged.

In both paths, `src/dev/androidBleHarness.ts` itself is a tracked
file in the repo and is meant to remain in place across commits.
The `__DEV__` guard guarantees that none of the runtime side-effects
leak into a production build (`__DEV__ === false` → the
`globalThis.__androidBleHarness` assignment is skipped, and the
imports into the harness collapse to nothing under tree-shaking).

---

## 7. Blocker behavior

If the device is in range of **no** Aruba/HPE beacons (or Bluetooth
is off, or permissions are denied, or the harness is invoked in a
non-Android / non-dev-build context), the harness returns one of:

| Situation | Returned shape |
|---|---|
| `getBleScanner()` returns `null` (non-Android, missing module) | `{ passed: false, totalObservations: 0, validObservations: 0, errors: ['No BLE scanner adapter available …'], durationMs: 0 }` |
| Bluetooth off / no beacons | `{ passed: false, totalObservations: 0, validObservations: 0, errors: [], durationMs: ≈5000 }` (one-shot returns empty array; continuous returns zero events) |
| Permission denied | `startArubaBleScan` throws `MissingPermissionException` from the native side — the harness will reject, and the JS error surfaces in the console |
| Stop not respected (regression) | `{ passed: false, eventsAfterStop: N>0, stopRespected: false, … }` |

**This is acceptable evidence with a bounded blocker note** in CI:
capturing the harness code in source, running `npx tsc --noEmit` to
prove it compiles, and recording the absence of a real-device run
in `.omo/evidence/task-6-android-ble-*-device.txt` as a blocker
is the documented fallback when no beacons/device are available.
The real-device run is then carried out by the human reviewer (or
a future CI lane with a physical beacon farm) and the same
evidence files are overwritten with the live results.
