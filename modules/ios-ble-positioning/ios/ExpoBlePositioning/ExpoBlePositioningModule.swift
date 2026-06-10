import ExpoModulesCore
import CoreBluetooth
import CoreLocation
import CoreMotion

public class ExpoBlePositioningModule: Module {
  private lazy var centralManager: CBCentralManager = {
    CBCentralManager(delegate: nil, queue: nil,
                     options: [CBCentralManagerOptionShowPowerAlertKey: false])
  }()

  private var locationManager: CLLocationManager?
  private var scanDelegate: NSObject?
  private var continuousScanDelegate: ArubaBleScanDelegate?
  private var stateWaitDelegate: BleStateWaitDelegate?
  private var locationDelegate: LocationResultDelegate?
  private var discoveredDevices: [String: [String: Any]] = [:]
  private var motionPedometer: CMPedometer?
  private var motionManager: CMMotionManager?
  private var lastKnownSteps: Int = 0
  private var savedStepsBeforeBackground: Int = 0
  private var motionUpdatesActive = false
  private var pendingSteps: Int32 = 0

  public func definition() -> ModuleDefinition {
    Name("IosBlePositioning")

    // ── Events ───────────────────────────────────────────────────────
    Events("onArubaBleObservation", "onMotionUpdate")

    Function("isBleAvailable") { () -> Bool in
      return self.centralManager.state == .poweredOn
    }

    AsyncFunction("startBleScan") { (serviceUuids: [String]?) -> [[String: Any]] in
      guard self.centralManager.state == .poweredOn else {
        throw Exception(
          name: "BluetoothUnavailable",
          description: "Bluetooth is not available or powered off on this device"
        )
      }
      guard self.continuousScanDelegate == nil else {
        throw Exception(
          name: "ScanConflict",
          description: "Continuous scan is already running; stop it first with stopArubaBleScan()"
        )
      }

      let services: [CBUUID]? = serviceUuids?.map { CBUUID(string: $0) }
      let semaphore = DispatchSemaphore(value: 0)

      let delegate = BleScanDelegate()
      delegate.onDiscover = { [weak self] identifier, rssi in
        guard let self = self else { return }
        self.discoveredDevices[identifier] = [
          "identifier": identifier,
          "rssi": rssi,
          "distanceEstimate": self.estimateDistance(rssi: rssi),
          "timestamp": Date().timeIntervalSince1970 * 1000
        ]
      }

      self.centralManager.delegate = delegate
      self.scanDelegate = delegate

      DispatchQueue.main.async {
        self.centralManager.scanForPeripherals(
          withServices: services,
          options: [CBCentralManagerScanOptionAllowDuplicatesKey: true]
        )
      }

      DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) {
        self.centralManager.stopScan()
        semaphore.signal()
      }

      _ = semaphore.wait(timeout: .now() + 10.0)

      let results = Array(self.discoveredDevices.values)
      self.discoveredDevices = [:]
      self.centralManager.delegate = nil
      self.scanDelegate = nil

      if results.isEmpty {
        throw Exception(
          name: "NoDevicesFound",
          description: "No BLE devices were discovered during the scan"
        )
      }

      return results
    }

    AsyncFunction("startArubaBleScan") { (durationMs: Double?) -> [[String: Any]] in
      guard self.centralManager.state == .poweredOn else {
        throw Exception(
          name: "BluetoothUnavailable",
          description: "Bluetooth is not available or powered off on this device"
        )
      }
      guard self.continuousScanDelegate == nil else {
        throw Exception(
          name: "ScanConflict",
          description: "Continuous scan is already running; stop it first with stopArubaBleScan()"
        )
      }

      let scanDuration: Double = durationMs ?? 10000
      let manufacturerId: UInt16 = 0x011B  // HPE / Aruba
      let semaphore = DispatchSemaphore(value: 0)
      var observations: [[String: Any]] = []
      let lock = NSLock()

      let delegate = ArubaBleScanDelegate()
      delegate.onDiscover = { identifier, manufId, rssi, payloadHex, timestamp in
        lock.lock()
        observations.append([
          "bleIdentifier": identifier,
          "manufacturerId": manufId,
          "rssi": rssi,
          "payloadHex": payloadHex,
          "observedAt": timestamp
        ])
        lock.unlock()
      }

      self.centralManager.delegate = delegate
      self.scanDelegate = delegate

      DispatchQueue.main.async {
        self.centralManager.scanForPeripherals(
          withServices: nil,
          options: [CBCentralManagerScanOptionAllowDuplicatesKey: true]
        )
      }

      DispatchQueue.main.asyncAfter(deadline: .now() + scanDuration / 1000.0) {
        self.centralManager.stopScan()
        semaphore.signal()
      }

      _ = semaphore.wait(timeout: .now() + scanDuration / 1000.0 + 2.0)

      self.centralManager.delegate = nil
      self.scanDelegate = nil

      return observations
    }

    // ── Continuous scan (realtime events) ────────────────────────────
    Function("startContinuousArubaBleScan") {
      guard self.centralManager.state == .poweredOn else {
        let stateDelegate = BleStateWaitDelegate()
        stateDelegate.onPoweredOn = { [weak self] in
          guard let self = self else { return }
          self.stateWaitDelegate = nil
          self.performContinuousScan()
        }
        self.stateWaitDelegate = stateDelegate
        self.centralManager.delegate = stateDelegate
        self.centralManager.scanForPeripherals(withServices: nil, options: nil)
        self.centralManager.stopScan()
        return
      }

      self.performContinuousScan()
    }

    Function("stopArubaBleScan") {
      self.centralManager.stopScan()
      if self.continuousScanDelegate != nil {
        self.centralManager.delegate = nil
        self.continuousScanDelegate = nil
      }
    }

    AsyncFunction("requestPreciseLocationPermission") { () -> Bool in
      let manager = CLLocationManager()
      let status = manager.authorizationStatus

      guard status == .authorizedWhenInUse || status == .authorizedAlways else {
        throw Exception(
          name: "LocationPermissionDenied",
          description: "Location permission has not been granted. Please enable location access in Settings."
        )
      }

      if manager.accuracyAuthorization == .fullAccuracy {
        return true
      }

      guard let purposeKey = Bundle.main.object(forInfoDictionaryKey: "NSLocationTemporaryUsageDescriptionDictionary") as? [String: String],
            let _ = purposeKey["SchoolMapPreciseLocation"] else {
        throw Exception(
          name: "MissingPurposeKey",
          description: "NSLocationTemporaryUsageDescriptionDictionary with key SchoolMapPreciseLocation is missing from Info.plist"
        )
      }

      let semaphore = DispatchSemaphore(value: 0)
      var newAccuracy: CLAccuracyAuthorization = manager.accuracyAuthorization

      let delegate = LocationResultDelegate()
      manager.delegate = delegate
      self.locationManager = manager
      self.locationDelegate = delegate

      delegate.onAuthorizationChange = { authStatus, accuracy in
        newAccuracy = accuracy
        semaphore.signal()
      }

      manager.requestTemporaryFullAccuracyAuthorization(withPurposeKey: "SchoolMapPreciseLocation")

      _ = semaphore.wait(timeout: .now() + 5.0)

      self.locationManager = nil
      self.locationDelegate = delegate

      return newAccuracy == .fullAccuracy
    }

    AsyncFunction("getCurrentLocation") { () -> [String: Any] in
      guard CLLocationManager.locationServicesEnabled() else {
        throw Exception(
          name: "LocationServicesDisabled",
          description: "Location services are disabled on this device"
        )
      }

      let manager = CLLocationManager()
      let status = manager.authorizationStatus

      guard status == .authorizedWhenInUse || status == .authorizedAlways else {
        throw Exception(
          name: "LocationPermissionDenied",
          description: "Location permission has not been granted. Please enable location access in Settings."
        )
      }

      let semaphore = DispatchSemaphore(value: 0)
      var result: [String: Any] = [:]
      var locationError: Error?

      let delegate = LocationResultDelegate()
      delegate.onLocation = { location in
        result = [
          "latitude": location.coordinate.latitude,
          "longitude": location.coordinate.longitude,
          "altitude": location.altitude,
          "horizontalAccuracy": location.horizontalAccuracy,
          "verticalAccuracy": location.verticalAccuracy,
          "timestamp": location.timestamp.timeIntervalSince1970 * 1000
        ]
        semaphore.signal()
      }
      delegate.onError = { error in
        locationError = error
        semaphore.signal()
      }

      manager.delegate = delegate
      self.locationManager = manager
      self.locationDelegate = delegate
      manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
      manager.requestLocation()

      _ = semaphore.wait(timeout: .now() + 10.0)

      self.locationManager = nil
      self.locationDelegate = nil

      if let error = locationError {
        throw error
      }

      return result
    }

    // ── Motion updates (CoreMotion: pedometer + heading) ────────────
    Function("startMotionUpdates") {
      guard !self.motionUpdatesActive else { return }

      // CMPedometer
      let pedometer = CMPedometer()
      self.motionPedometer = pedometer

      if CMPedometer.isStepCountingAvailable() {
        pedometer.startUpdates(from: Date()) { [weak self] data, error in
          guard let self = self, let data = data, error == nil else { return }
          let steps = data.numberOfSteps.intValue
          let delta = Int32(steps - self.lastKnownSteps)
          if delta > 0 {
            OSAtomicAdd32(delta, &self.pendingSteps)
          }
          self.lastKnownSteps = steps
        }
      }

      // CMMotionManager heading
      let manager = CMMotionManager()
      self.motionManager = manager

      if manager.isDeviceMotionAvailable {
        let queue = OperationQueue()
        queue.name = "com.expo.motion.heading"
          manager.startDeviceMotionUpdates(using: .xMagneticNorthZVertical, to: queue) { [weak self] motion, error in
            guard let self = self, self.motionUpdatesActive, let motion = motion, error == nil else { return }
            // Atomically consume one pending step. Only send event if one was available.
            guard OSAtomicAdd32(-1, &self.pendingSteps) >= 0 else {
              OSAtomicAdd32(1, &self.pendingSteps)
              return
            }
            var headingDeg = motion.heading * 180.0 / .pi
            if headingDeg < 0 { headingDeg += 360 }
            let accel = motion.userAcceleration
            let magnitude = sqrt(accel.x * accel.x + accel.y * accel.y + accel.z * accel.z)
            self.sendEvent("onMotionUpdate", [
              "steps": 1,
              "heading": headingDeg,
              "userAccelerationMagnitude": magnitude,
              "timestamp": Date().timeIntervalSince1970 * 1000
            ])
          }

      self.motionUpdatesActive = true
    }

    Function("stopMotionUpdates") {
      self.motionPedometer?.stopUpdates()
      self.motionPedometer = nil
      self.motionManager?.stopDeviceMotionUpdates()
      self.motionManager = nil
      self.motionUpdatesActive = false
      self.pendingSteps = 0
    }

    AsyncFunction("isMotionAvailable") { () -> Bool in
      return CMPedometer.isStepCountingAvailable() && CMMotionManager().isDeviceMotionAvailable
    }

    OnAppEntersBackground {
      if self.motionUpdatesActive {
        self.savedStepsBeforeBackground = self.lastKnownSteps
        self.pendingSteps = 0
        self.motionPedometer?.stopUpdates()
        self.motionManager?.stopDeviceMotionUpdates()
      }
    }

    OnAppEntersForeground {
      if self.motionUpdatesActive {
        self.lastKnownSteps = self.savedStepsBeforeBackground
        self.pendingSteps = 0
        let pedometer = CMPedometer()
        self.motionPedometer = pedometer

        if CMPedometer.isStepCountingAvailable() {
          pedometer.startUpdates(from: Date()) { [weak self] data, error in
            guard let self = self, let data = data, error == nil else { return }
            let steps = data.numberOfSteps.intValue
            let delta = Int32(steps - self.lastKnownSteps)
            if delta > 0 {
              OSAtomicAdd32(delta, &self.pendingSteps)
            }
            self.lastKnownSteps = steps
          }
        }

        let manager = CMMotionManager()
        self.motionManager = manager

        if manager.isDeviceMotionAvailable {
          let queue = OperationQueue()
          queue.name = "com.expo.motion.heading"
          manager.startDeviceMotionUpdates(using: .xMagneticNorthZVertical, to: queue) { [weak self] motion, error in
            guard let self = self, self.motionUpdatesActive, let motion = motion, error == nil else { return }
            // Atomically consume one pending step. Only send event if one was available.
            guard OSAtomicAdd32(-1, &self.pendingSteps) >= 0 else {
              OSAtomicAdd32(1, &self.pendingSteps)
              return
            }
            var headingDeg = motion.heading * 180.0 / .pi
            if headingDeg < 0 { headingDeg += 360 }
            let accel = motion.userAcceleration
            let magnitude = sqrt(accel.x * accel.x + accel.y * accel.y + accel.z * accel.z)
            self.sendEvent("onMotionUpdate", [
              "steps": 1,
              "heading": headingDeg,
              "userAccelerationMagnitude": magnitude,
              "timestamp": Date().timeIntervalSince1970 * 1000
            ])
          }
        }
      }
    }
  }

  }  // end definition()

  private func estimateDistance(rssi: Int) -> Double {
    guard rssi != 0 else { return -1.0 }
    let txPower = -59
    let n: Double = 4.0
    let ratio = Double(txPower - rssi) / (10.0 * n)
    return pow(10.0, ratio)
  }

  func performContinuousScan() {
    guard self.continuousScanDelegate == nil else { return }

    let delegate = ArubaBleScanDelegate()
    delegate.onDiscover = { [weak self] identifier, manufId, rssi, payloadHex, timestamp in
      guard let self = self else { return }
      self.sendEvent("onArubaBleObservation", [
        "bleIdentifier": identifier,
        "manufacturerId": manufId,
        "rssi": rssi,
        "payloadHex": payloadHex,
        "observedAt": timestamp,
      ])
    }

    self.continuousScanDelegate = delegate
    self.centralManager.delegate = delegate

    DispatchQueue.main.async {
      self.centralManager.scanForPeripherals(
        withServices: nil,
        options: [CBCentralManagerScanOptionAllowDuplicatesKey: true]
      )
    }
  }
}

private class BleScanDelegate: NSObject, CBCentralManagerDelegate {
  var onDiscover: ((String, Int) -> Void)?

  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    // State validation is done before starting the scan
  }

  func centralManager(
    _ central: CBCentralManager,
    didDiscover peripheral: CBPeripheral,
    advertisementData: [String: Any],
    rssi RSSI: NSNumber
  ) {
    let identifier = peripheral.identifier.uuidString
    onDiscover?(identifier, RSSI.intValue)
  }
}

/**
 * Delegate for scanning Aruba/HPE BLE advertisements filtered by
 * manufacturer ID 0x011B.
 *
 * The BLE MAC address is extracted from manufacturer-specific data bytes
 * [3...8] in little-endian order, then reversed to produce the standard
 * colon-separated MAC string (e.g. "20:4c:03:e9:00:50").
 *
 * Payload format (confirmed from real Aruba AP packet capture):
 *   [0-1] Company ID (0x011B LE)
 *   [2]   Sub-type header byte
 *   [3-8] BLE MAC address (6 bytes, little-endian)
 *   [9+]  Other telemetry data
 *
 * If the payload is too short (< 9 bytes), falls back to the peripheral
 * UUID + payload prefix for identification.
 */
private class ArubaBleScanDelegate: NSObject, CBCentralManagerDelegate {
  var onDiscover: ((String, Int, Int, String, Double) -> Void)?

  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    // State validation is done before starting the scan
  }

  func centralManager(
    _ central: CBCentralManager,
    didDiscover peripheral: CBPeripheral,
    advertisementData: [String: Any],
    rssi RSSI: NSNumber
  ) {
    guard let manufData = advertisementData[CBAdvertisementDataManufacturerDataKey] as? Data else {
      return
    }

    // First 2 bytes = manufacturer ID in little-endian
    guard manufData.count >= 2 else { return }
    let manufId = UInt16(manufData[0]) | (UInt16(manufData[1]) << 8)

    // Filter for HPE / Aruba (0x011B)
    guard manufId == 0x011B else { return }

    // Full manufacturer payload as hex string (kept for debugging)
    let payloadHex = manufData.map { String(format: "%02x", $0) }.joined()

    // Extract BLE MAC from bytes [3...8] (little-endian)
    // Aruba HPE payload: [0-1] Company ID LE, [2] subtype, [3-8] BLE MAC LE
    let bleMac: String
    if manufData.count >= 9 {
      let macBytes = manufData[3...8].reversed()
      bleMac = macBytes.map { String(format: "%02x", $0) }.joined(separator: ":")
    } else {
      // Fallback for truncated payloads
      bleMac = "\(peripheral.identifier.uuidString)_\(payloadHex.prefix(8))"
    }

    let timestamp = Date().timeIntervalSince1970 * 1000
    onDiscover?(bleMac, Int(manufId), RSSI.intValue, payloadHex, timestamp)
  }
}

private class LocationResultDelegate: NSObject, CLLocationManagerDelegate {
  var onLocation: ((CLLocation) -> Void)?
  var onError: ((Error) -> Void)?
  var onAuthorizationChange: ((CLAuthorizationStatus, CLAccuracyAuthorization) -> Void)?

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    if let location = locations.last {
      onLocation?(location)
    }
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    onError?(error)
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    onAuthorizationChange?(manager.authorizationStatus, manager.accuracyAuthorization)
  }
}

private class BleStateWaitDelegate: NSObject, CBCentralManagerDelegate {
  var onPoweredOn: (() -> Void)?

  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    if central.state == .poweredOn {
      onPoweredOn?()
    }
  }
}

