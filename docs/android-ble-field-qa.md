# Android BLE — Field QA

This document is the field-QA matrix for the Android BLE positioning
pipeline. It is the operational counterpart to
`scripts/android-ble-dev-harness.md` and is referenced from
`.omo/plans/android-ble-native-scanner-parity.md` (Task 6) and Task 7
(integrated regression).

---

## Overview

Android BLE positioning is **real-device-only**. The Android
`BluetoothLeScanner` API depends on a physical radio and a permission
flow that the Android emulator does not exercise:

- The emulator has no Bluetooth radio. Calling
  `BluetoothManager.getAdapter()` either returns `null` or a stub
  adapter that emits zero scan results, which is indistinguishable
  from "no beacons in range" — useless for proving the parser path.
- Even on a system image that *does* expose a virtual Bluetooth
  adapter, the `ScanCallback.onScanResult` events are not driven by
  real advertising frames, so the `manufacturerId === 0x011B` filter
  and the byte-slice MAC extraction in the Kotlin parser never run
  against real Aruba/HPE data.
- The permission grant flow (`BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`,
  `ACCESS_FINE_LOCATION`) cannot be exercised end-to-end on an
  emulator, so the `MissingPermissionException` path is not
  reachable.
- Background vs. foreground scan state is also emulator-agnostic.

The dev harness at `src/dev/androidBleHarness.ts` exists exactly to
close this gap: it runs on a real device via the dev-build JS
console and validates both the *shape* of returned observations and
the *lifecycle* (start → emit → stop → no more emit) of the
continuous scan path.

> **Consequence:** any CI lane that does not have a physical beacon
> farm attached can only verify that the harness code compiles and
> type-checks. The on-device smoke (this matrix) is the human-
> reviewer gate. The blocker evidence file format
> `.omo/evidence/task-6-android-ble-*-device.txt` is the accepted
> placeholder for that gate.

---

## Test matrix

The matrix below covers the four canonical expected outcomes. Each
row is a single scenario; "Expected" is the harness return value
that proves the scenario is handled correctly.

### Scenario A — Bluetooth OFF

| Aspect | Expected |
|---|---|
| Pre-conditions | Real Android device, `BLUETOOTH_SCAN` granted, Bluetooth toggle OFF in system settings, beacons in range |
| `getBleScanner()` | returns the Android adapter (the module is loaded; the toggle is read at scan time, not adapter-resolution time) |
| `isBleAvailable()` | returns `false` |
| `startArubaBleScan(5000)` | completes without throwing; resolves to `[]` (empty array) |
| `startContinuousArubaBleScan()` + `addListener` | scan callback never fires; the listener records zero events over the scan window; `stopArubaBleScan()` is a no-op; settle window emits zero events |
| Harness return (one-shot) | `{ passed: false, totalObservations: 0, validObservations: 0, errors: [], durationMs: ≈5000 }` |
| Harness return (continuous) | `{ passed: false, eventsWhileScanning: 0, eventsAfterStop: 0, stopRespected: true, errors: [], durationMs: 7000 }` |
| Pass condition | No error, no exception, no `MissingPermissionException`. Empty result is the contract. |

### Scenario B — Missing permission

| Aspect | Expected |
|---|---|
| Pre-conditions | Real Android device, Bluetooth ON, beacons in range, **`BLUETOOTH_SCAN` (or `ACCESS_FINE_LOCATION` on pre-S) not granted** |
| `getBleScanner()` | returns the Android adapter |
| `isBleAvailable()` | may return `true` (Bluetooth is on at the system level) |
| `requestBlePermissions()` | returns `false` (the JS layer surfaces this to `usePermissions`, which prompts the user) |
| `startArubaBleScan(5000)` (when invoked before permission grant) | throws `MissingPermissionException(permission = "android.permission.BLUETOOTH_SCAN" \| "android.permission.ACCESS_FINE_LOCATION")` synchronously from the native module; the harness sees the rejection and reports `errors: ['...MissingPermissionException...']` |
| `startContinuousArubaBleScan()` (when invoked before permission grant) | throws `MissingPermissionException` from `startScan`; the `ScanCallback` is never registered; the listener observes zero events; `stopArubaBleScan()` is a no-op |
| Harness return (one-shot) | `{ passed: false, totalObservations: 0, validObservations: 0, errors: ['obs[...]: ...'], durationMs: <scan-time> }` |
| Harness return (continuous) | `{ passed: false, eventsWhileScanning: 0, eventsAfterStop: 0, stopRespected: true, errors: ['...MissingPermissionException...'], durationMs: 7000 }` |
| Pass condition | Native throws, harness reports the failure cleanly, no crash. **No** silent empty result. |

### Scenario C — No beacon environment

| Aspect | Expected |
|---|---|
| Pre-conditions | Real Android device, Bluetooth ON, all permissions granted, **no Aruba/HPE beacons within range** |
| `getBleScanner()` | returns the Android adapter |
| `isBleAvailable()` | returns `true` |
| `requestBlePermissions()` | returns `true` |
| `startArubaBleScan(5000)` | completes without throwing; resolves to `[]` |
| `startContinuousArubaBleScan()` | `ScanCallback.onScanResult` is never invoked for an Aruba manufacturer payload; non-Aruba advertisements are filtered out by the `manufacturerId === 0x011B` guard and never reach the harness; the listener observes zero events; `stopArubaBleScan()` is a clean no-op; settle window emits zero events |
| Harness return (one-shot) | `{ passed: false, totalObservations: 0, validObservations: 0, errors: [], durationMs: ≈5000 }` |
| Harness return (continuous) | `{ passed: false, eventsWhileScanning: 0, eventsAfterStop: 0, stopRespected: true, errors: [], durationMs: 7000 }` |
| Pass condition | No error, no crash. `errors: []` is the contract. The `passed: false` is expected and indicates the harness ran cleanly in an empty environment — **not** a regression. See §"Blocker note" below. |

### Scenario D — Successful beacon environment

| Aspect | Expected |
|---|---|
| Pre-conditions | Real Android device, Bluetooth ON, all permissions granted, **at least one Aruba/HPE beacon within range advertising manufacturer id `0x011B`** |
| `getBleScanner()` | returns the Android adapter |
| `isBleAvailable()` | returns `true` |
| `requestBlePermissions()` | returns `true` |
| `startArubaBleScan(5000)` | completes without throwing; resolves to an array of ≥ 1 observations |
| `startContinuousArubaBleScan()` | events arrive at 1 Hz per visible beacon; `stopArubaBleScan()` halts event delivery; settle window emits zero events |
| Per-observation shape | `bleIdentifier` matches `/^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/`, `manufacturerId === 283`, `rssi` is a finite negative dBm number, `payloadHex` matches `/^[0-9a-f]+$/`, `observedAt` is a positive ms epoch |
| Harness return (one-shot) | `{ passed: true, totalObservations: N≥1, validObservations: N, errors: [], durationMs: ≈5000 }` |
| Harness return (continuous) | `{ passed: true, eventsWhileScanning: M≥1, eventsAfterStop: 0, stopRespected: true, errors: [], durationMs: 7000 }` |
| Pass condition | `passed: true` and `stopRespected: true` (continuous). |

---

## Step-by-step: launching a QA run

The full recipe lives in `scripts/android-ble-dev-harness.md`. The
TL;DR is:

1. **Build & install the dev APK** on a real Android device:
   ```bash
   npx expo run:android --device
   ```
2. **Confirm prerequisites** (see `scripts/android-ble-dev-harness.md`
   §2): Bluetooth on, location permission granted, Aruba/HPE
   beacons in range.
3. **Open the JS console** in Metro (`j` from the running `expo
   run:android` terminal) or Chrome DevTools at
   `http://localhost:8081/debugger-ui`.
4. **Run the harness:**
   ```javascript
   const oneShot = await globalThis.__androidBleHarness.oneShot();
   console.log(JSON.stringify(oneShot, null, 2));
   const continuous = await globalThis.__androidBleHarness.continuous();
   console.log(JSON.stringify(continuous, null, 2));
   ```
5. **Compare the return shapes** against the test matrix above for
   the scenario you're in (A / B / C / D).
6. **Capture the output** by copy-pasting the JSON into
   `.omo/evidence/task-6-android-ble-one-shot-device.txt` (one-shot)
   and `.omo/evidence/task-6-android-ble-continuous-device.txt`
   (continuous).

If `globalThis.__androidBleHarness` is `undefined`, see
`scripts/android-ble-dev-harness.md` §3 (the harness module must be
imported once in the JS bundle for the `__DEV__` side-effect to run).

---

## Evidence

| Evidence file | What it proves |
|---|---|
| `.omo/evidence/task-6-android-ble-one-shot-device.txt` | Live one-shot scan JSON from `globalThis.__androidBleHarness.oneShot()` on a real Android device, OR a bounded blocker note if no device/beacons are available in this CI run. |
| `.omo/evidence/task-6-android-ble-continuous-device.txt` | Live continuous scan JSON (with `eventsWhileScanning`, `eventsAfterStop`, `stopRespected`) from `globalThis.__androidBleHarness.continuous()` on a real Android device, OR a bounded blocker note. |

Both files are produced in Task 6. Task 7 (integrated regression)
re-runs the harness and overwrites the same files with the live
output.

The blocker-note format is:

```
=== task-6-android-ble-one-shot-device.txt ===
Bounded blocker: No real Android device / beacon environment available
in this CI run. Harness code verified via tsc. Live device smoke to
be executed by the human reviewer with the dev build per
scripts/android-ble-dev-harness.md.
```

The blocker note is **acceptable evidence** for the on-device BLE
runtime smoke per `.omo/plans/android-ble-native-scanner-parity.md`
Task 7 ("only the real-device BLE runtime smoke may use bounded
blocker evidence if AP/device environment is unavailable").

---

## What this matrix does NOT cover

- The parser contract (MAC extraction, hex formatting, manufacturer
  id filtering) is covered by the unit-test layer at
  `src/services/location/__tests__/arubaBleParserContract.test.ts`
  (8/8 cases). The field QA matrix is about the *runtime* contract
  that only a real device can exercise.
- WCL math (weighted centroid, EPSG:5183 → WGS84 conversion,
  freshness windows) is covered by `scripts/verify-ble-wcl.ts` and
  the relevant Jest suites. It is not a BLE-scan concern and is
  out of scope here.
- Motion / dead-reckoning fusion is iOS-only in the current plan
  and is not in scope for the Android BLE parity work.
