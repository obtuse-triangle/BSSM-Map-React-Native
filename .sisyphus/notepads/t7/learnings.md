# T7: BLE/CoreLocation Swift Implementation

## Key Technical Decisions
- **CheckedContinuation bridging**: CoreBluetooth and CoreLocation are callback-based. Use `withCheckedThrowingContinuation` to bridge to Swift async/await.
- **CBCentralManager lifecycle**: Create per scan with `CBCentralManager(delegate: self, queue: .main)`. State is synchronous after init. Store as optional.
- **Scan timeout pattern**: `DispatchWorkItem` with `[weak self]` + `scanCompleted` flag prevents double-continuation-resume. Two timers: 5s max + 1s after first discovery.
- **Location one-shot**: `requestLocation()` not `startUpdatingLocation()`. Delegate kept alive via `objc_setAssociatedObject` (Swift ARC would deallocate otherwise).
- **CLAuthorizationStatus**: Instance property deprecated in iOS 14+, needs `#available(iOS 14.0, *)` check.

## Error Codes
1 = Bluetooth OFF, 2 = No BLE devices found, 3 = Location disabled, 4 = Location permission not granted

## Module Name
Must be `"IosBlePositioning"` to match `requireNativeModule('IosBlePositioning')` on TS side.

## Result Fields
- BLE: identifier, name, rssi, distanceEstimate, timestamp, isBleDevice
- Core Location: latitude, longitude, altitude, horizontalAccuracy, verticalAccuracy, timestamp

## 2026-05-24 - T7: locationManager didFailWithError verification

- File: modules/ios-ble-positioning/ios/ExpoBlePositioning/ExpoBlePositioningModule.swift
- The file has been refactored to remove LocationRequestDelegate (CheckedContinuation pattern) and use LocationResultDelegate (closure/semaphore pattern) instead
- LocationResultDelegate (lines 162-175) already has locationManager(_:didFailWithError:) at lines 172-174
- Error propagation chain: didFailWithError -> onError?(error) -> semaphore.signal() -> check locationError -> throw error
- T7 requirement already satisfied - no edits needed
