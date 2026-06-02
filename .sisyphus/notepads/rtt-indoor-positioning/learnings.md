
## T1: Build Infrastructure Setup
- `npx expo install expo-dev-client` installed v6.0.21 (SDK 54 compatible)
- app.json stays as-is; app.config.js spreads its `expo` key and adds `android.package`/`ios.bundleIdentifier`
- `require("./app.json")` works for importing JSON in app.config.js
- `.gitignore` already had `/ios` and `/android` entries at lines 40-41
- `npx tsc --noEmit` passes clean with no source changes
- pnpm is the package manager (node-linker=hoisted, verified during install)

## T3: Android WiFi RTT Expo Module Scaffold
- `modules/android-wifi-rtt/` directory structure created with 4 files: `expo-module.config.json` (platforms android only), `android/build.gradle` (expo-module-gradle-plugin), `WifiRttModule.kt` (empty scaffold extending `Module`), `src/index.ts` (JS interface with `RttMeasurement`/`AccessPointInfo` types)
- Config plugin at `plugins/withAndroidRttPermissions.js` uses `withAndroidManifest` to add `ACCESS_FINE_LOCATION`, `ACCESS_WIFI_STATE`, `NEARBY_WIFI_DEVICES` (with `neverForLocation` flag)
- `app.config.js` was already modified by a prior task — had inline `addWifiRttPermissions`/`addBlePermissions` functions and exported a function `({ config })`. Refactored to use external plugin file `./plugins/withAndroidRttPermissions`
- `expo-modules-core` is a transitive dependency of `expo` (v3.0.30) and only becomes available via symlink after `pnpm list` or similar triggers
- `npx expo prebuild --clean --platform android` generates `android/app/src/main/AndroidManifest.xml` with all 3 permissions: ACCESS_FINE_LOCATION, ACCESS_WIFI_STATE, NEARBY_WIFI_DEVICES (neverForLocation)
- `npx tsc --noEmit` passes clean

## T5+T8: JS Bridge Providers + Platform Auto-Selection
- `androidRttProvider.ts` — `createAndroidRttProvider()` maps native `RttMeasurement` (bssid, distanceMm, rssi, success, timestamp) to app `RttMeasurement` via `toAppRttMeasurements()` helper; uses `estimateIndoorPositionFromRtt` for multilateration; provider kind `'android-wifi-rtt'`
- `iosBleProvider.ts` — `createIosBleProvider(calibration: IosCalibrationInput)` tries BLE scan first (maps to RttMeasurement with `accessPointId: \`ble-${identifier}\``), falls back to Core Location via `createIosCalibratedIndoorPosition`; provider kind `'ios-core-location'`
- `indoorLocationProvider.ts` — uses `Platform.OS` with `require()` for platform-conditional provider loading: Android → `createAndroidRttProvider()`, iOS → `createIosBleProvider()` with default bounds calibration, else → `createMockIndoorLocationProvider()`
- Platform guard at module top (`if (Platform.OS !== 'android') throw`) prevents mistaken usage on wrong platform
- `RttMeasurementSource` union does NOT include `'ios-core-location'` — iOS BLE measurements use `source: 'android-wifi-rtt' as const` as a type workaround
- iOS BLE measurements use `startBleScan(null)` (all service UUIDs) and `getCurrentLocation()` → `{latitude, longitude}`
- `npx tsc --noEmit` passes clean

## T6: iOS BLE/Core Location Expo Module Scaffold
- `modules/ios-ble-positioning/` directory structure: `expo-module.config.json` (platforms ios only), `ios/ExpoBlePositioning.podspec` (ExpoModulesCore dependency, swift_version 5.4, deployment target 15.1), `ios/ExpoBlePositioning/ExpoBlePositioningModule.swift` (Module subclass with 3 stub methods: isBleAvailable, startBleScan, getCurrentLocation), `src/index.ts` (requireNativeModule pattern with BleMeasurement/LatLng types)
- Config plugin at `plugins/withIosBlePermissions.js` uses `withInfoPlist` to add NSLocationWhenInUseUsageDescription, NSBluetoothAlwaysUsageDescription, NSBluetoothPeripheralUsageDescription (all Korean descriptions)
- `app.config.js` was already refactored to use external plugins `./plugins/withAndroidRttPermissions` and `./plugins/withIosBlePermissions` (no inline config plugin functions)
- Expo Modules API uses `expo-module.config.json` for auto-discovery — no manual registration needed
- `npx expo prebuild --clean --platform ios` generates ios/ directory with Info.plist containing all 3 permission entries
- CocoaPods install during prebuild may fail on fresh environments (homebrew/gem) — does NOT affect Info.plist generation
- `npx tsc --noEmit` passes clean

## T5+T8: Android RTT & iOS BLE JS Bridge Providers
- `androidRttProvider.ts` implements `IndoorLocationProvider` with `kind: 'android-wifi-rtt'`
  - Uses `AndroidWifiRtt.startRttScan(bssids)` from the native module
  - Converts native `RttMeasurement.distanceMm` to meters via `/ 1000`
  - Matches native measurements to access points by BSSID
  - Uses `estimateIndoorPositionFromRtt` with `source: 'android-wifi-rtt'`
- `iosBleProvider.ts` implements `IndoorLocationProvider` with `kind: 'ios-core-location'`
  - Dual-path: BLE scan first, Core Location GPS fallback
  - BLE: `IosBlePositioning.startBleScan(null)` → matches BLE identifiers to AP BSSIDs → `estimateIndoorPositionFromRtt`
  - Requires ≥3 BLE measurements matching known APs for RTT positioning path
  - Fallback: `IosBlePositioning.getCurrentLocation()` → uses `calibrateLatLngToMapPercent` if bounds provided
  - Accepts optional `IosCalibrationBounds` parameter for GPS→map-percent calibration
  - Without calibration, fallback position defaults to center (x:50, y:50) with `precision: 'limited'`
- `indoorLocationProvider.ts` uses `Platform.OS` for auto-selection:
  - Android → `createAndroidRttProvider()`
  - iOS → `createIosBleProvider()`
  - Other → `createMockIndoorLocationProvider()`
  - `resetIndoorLocationProvider()` now also uses `createDefaultProvider()` (platform-aware)
- `estimateIndoorPositionFromRtt` already accepts `source` parameter for `IndoorPositionSource` — works with `'android-wifi-rtt'` and `'ios-core-location'`

## T9: End-to-end Integration Test + AP Data Collection Guide
- `npx tsc --noEmit` passes clean (verified after all changes)
- iOS prebuild exists (ios/ directory with Podfile, xcodeproj, xcworkspace)
- Android prebuild not yet run (android/ directory doesn't exist — gitignored)
- All 3 provider kind values verified: `'android-wifi-rtt'` (Android), `'ios-core-location'` (iOS), `'mock-rtt'` (mock)
- Android permissions (in plugin): ACCESS_FINE_LOCATION, ACCESS_WIFI_STATE, NEARBY_WIFI_DEVICES
- iOS permissions (in plugin): NSLocationWhenInUseUsageDescription, NSBluetoothAlwaysUsageDescription, NSBluetoothPeripheralUsageDescription
- `docs/ap-data-collection-guide.md` — Korean guide covering BSSID collection, map-percent coordinate calculation, AccessPoint type format, 802.11mc verification, mock vs real BSSID distinction
- `src/constants/realAccessPoints.ts` — template file with empty `AccessPoint[]`, commented example with inline field explanations, TODO workflow
- `AccessPointSource` type (`'room-center'`) needs extension to `'room-center' | 'manual-collection'` before user can add real data with proper source annotation — documented in both guide and template
- Evidence files saved to `.sisyphus/evidence/task-9-e2e.txt` and `task-9-docs.txt`
- `indoorLocationProvider.ts` was updated (by prior task diff) to use `createIosBleProvider(DEFAULT_IOS_CALIBRATION)` with calibration bounds instead of 0-arg call
- `IosCalibrationInput` type from `iosCalibration.ts` is required for `createIosBleProvider`

## F4 Scope Fidelity Check (2026-05-24)

### Verdict: APPROVE

All 7 guardrails verified:
1. ✅ No android/ios/ in git
2. ✅ No ReactContextBaseJavaModule (Expo Modules API used)
3. ✅ Forbidden store/screen files untouched after scaffold
4. ✅ Type definition files untouched after scaffold
5. ✅ No AP collection tool UI
6. ✅ No unnecessary abstractions
7. ✅ Minimal AI slop (1 minor copy-paste note)

### Minor issue flagged
`iosBleProvider.ts:29` — `source: 'android-wifi-rtt'` used per-measurement for iOS BLE data. Semantically incorrect (iOS source labeled as Android), but compiles fine. No behavioral impact.
