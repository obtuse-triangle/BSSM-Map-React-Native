import ExpoModulesCore
import CoreBluetooth
import CoreLocation

public class ExpoBlePositioningModule: Module {
  private lazy var centralManager: CBCentralManager = {
    CBCentralManager(delegate: nil, queue: nil,
                     options: [CBCentralManagerOptionShowPowerAlertKey: false])
  }()

  private var locationManager: CLLocationManager?
  private var scanDelegate: BleScanDelegate?
  private var locationDelegate: LocationResultDelegate?
  private var discoveredDevices: [String: [String: Any]] = [:]

  public func definition() -> ModuleDefinition {
    Name("IosBlePositioning")

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
  }

  private func estimateDistance(rssi: Int) -> Double {
    guard rssi != 0 else { return -1.0 }
    let txPower = -59
    let n: Double = 4.0
    let ratio = Double(txPower - rssi) / (10.0 * n)
    return pow(10.0, ratio)
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

private class LocationResultDelegate: NSObject, CLLocationManagerDelegate {
  var onLocation: ((CLLocation) -> Void)?
  var onError: ((Error) -> Void)?

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    if let location = locations.last {
      onLocation?(location)
    }
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    onError?(error)
  }
}
