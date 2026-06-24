import { Platform } from 'react-native';
import { estimateIndoorPositionFromRtt } from '../../utils/positioning';
import { createIosCalibratedIndoorPosition, type IosCalibrationInput } from '../calibration/iosCalibration';
import type { IndoorLocationProvider, IndoorLocationRequest, IndoorLocationResult } from './locationTypes';
import type { RttMeasurement } from '../rtt/rttTypes';
import { IosBlePositioning } from '../../../modules/ios-ble-positioning/src';

function getIosBlePositioning(): typeof IosBlePositioning {
  if (!IosBlePositioning) {
    throw new Error('IosBlePositioning native module is not available on this device');
  }
  return IosBlePositioning;
}

export function createIosBleProvider(calibration: IosCalibrationInput): IndoorLocationProvider {
  if (Platform.OS !== 'ios') {
    throw new Error('iosBleProvider can only be used on iOS');
  }
  return {
    kind: 'ios-core-location',
    label: 'BLE + Core Location',
    locate: async (request: IndoorLocationRequest): Promise<IndoorLocationResult> => {
      try {
        const bleDevices: any[] = await getIosBlePositioning().startBleScan(null);

        if (bleDevices.length > 0) {
          const bleMeasurements: RttMeasurement[] = bleDevices.map((d: any) => ({
            accessPointId: `ble-${d.identifier}`,
            floorKey: request.floorKey,
            ssid: '',
            bssid: d.identifier,
            distanceMeters: d.distanceEstimate > 0 ? d.distanceEstimate : 3.0,
            rssiDbm: d.rssi,
            measuredAt: d.timestamp,
            // type compatibility: RttMeasurementSource doesn't include 'ios-core-location';
            // the position.source is correctly set to 'ios-core-location' in the estimate call below
            source: 'android-wifi-rtt' as const,
            isValid: d.distanceEstimate > 0,
          }));
          const estimate = estimateIndoorPositionFromRtt({
            floorKey: request.floorKey,
            accessPoints: request.accessPoints,
            measurements: bleMeasurements,
            updatedAt: request.measuredAt ?? Date.now(),
            source: 'ios-core-location',
          });

          return {
            providerKind: 'ios-core-location',
            measuredAt: request.measuredAt ?? Date.now(),
            floorKey: request.floorKey,
            accessPoints: [...request.accessPoints],
            measurements: bleMeasurements,
            referencePosition: null,
            scanResult: null,
            position: estimate.position,
            measurementCount: bleMeasurements.length,
            validMeasurementCount: estimate.validMeasurementCount,
            precision: estimate.position.precision,
            precisionNotes: estimate.position.precisionNotes,
            floorGuaranteed: estimate.position.isFloorGuaranteed,
            roomGuaranteed: estimate.position.isRoomGuaranteed,
          };
        }
      } catch {
        // BLE failed, fall through to Core Location
      }

      // Step 2: Core Location fallback
      const location = await getIosBlePositioning().getCurrentLocation();
      const position = createIosCalibratedIndoorPosition({
        floorKey: request.floorKey,
        latitude: location.latitude,
        longitude: location.longitude,
        calibration,
      });

      return {
        providerKind: 'ios-core-location',
        measuredAt: request.measuredAt ?? Date.now(),
        floorKey: request.floorKey,
        accessPoints: [...request.accessPoints],
        measurements: [],
        referencePosition: null,
        scanResult: null,
        position,
        measurementCount: 0,
        validMeasurementCount: 0,
        precision: position.precision,
        precisionNotes: position.precisionNotes,
        floorGuaranteed: position.isFloorGuaranteed,
        roomGuaranteed: position.isRoomGuaranteed,
      };
    },
  };
}
