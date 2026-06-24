import { Platform } from 'react-native';
import { AndroidWifiRtt } from '../../../modules/android-wifi-rtt/src';
import { estimateIndoorPositionFromRtt } from '../../utils/positioning';
import type { IndoorLocationProvider, IndoorLocationRequest, IndoorLocationResult } from './locationTypes';
import type { RttMeasurement as AppRttMeasurement } from '../rtt/rttTypes';

function toAppRttMeasurements(
  nativeResults: Array<{ bssid: string; distanceMm: number; rssi: number; success: boolean; timestamp: number }>,
  accessPoints: readonly import('../../types/accessPoint').AccessPoint[],
  floorKey: string,
): AppRttMeasurement[] {
  const apByBssid = new Map(accessPoints.map((ap) => [ap.bssid, ap]));

  return nativeResults.map((r) => ({
    accessPointId: apByBssid.get(r.bssid)?.id ?? '',
    floorKey,
    ssid: apByBssid.get(r.bssid)?.ssid ?? '',
    bssid: r.bssid,
    distanceMeters: r.distanceMm / 1000,
    rssiDbm: r.rssi,
    measuredAt: r.timestamp,
    source: 'android-wifi-rtt' as const,
    isValid: r.success,
  }));
}

export function createAndroidRttProvider(): IndoorLocationProvider {
  if (Platform.OS !== 'android') {
    throw new Error('androidRttProvider can only be used on Android');
  }
  return {
    kind: 'android-wifi-rtt',
    label: 'WiFi RTT',
    locate: async (request: IndoorLocationRequest): Promise<IndoorLocationResult> => {
      const bssids = request.accessPoints.map((ap) => ap.bssid);
      let nativeResults: Awaited<ReturnType<typeof AndroidWifiRtt.startRttScan>>;
      try {
        nativeResults = await AndroidWifiRtt.startRttScan(bssids);
      } catch (error) {
        const detail = error instanceof Error ? ` (${error.message})` : '';
        throw new Error(
          `WiFi RTT 스캔에 실패했습니다. Wi-Fi가 활성화되어 있고, 기기가 RTT를 지원하는지 확인해주세요.${detail}`
        );
      }
      const measurements = toAppRttMeasurements(nativeResults, [...request.accessPoints], request.floorKey);
      const estimate = estimateIndoorPositionFromRtt({
        floorKey: request.floorKey,
        accessPoints: request.accessPoints,
        measurements,
        updatedAt: request.measuredAt ?? Date.now(),
        source: 'android-wifi-rtt',
      });

      return {
        providerKind: 'android-wifi-rtt',
        measuredAt: request.measuredAt ?? Date.now(),
        floorKey: request.floorKey,
        accessPoints: [...request.accessPoints],
        measurements,
        referencePosition: null,
        scanResult: null,
        position: estimate.position,
        measurementCount: measurements.length,
        validMeasurementCount: estimate.validMeasurementCount,
        precision: estimate.position.precision,
        precisionNotes: estimate.position.precisionNotes,
        floorGuaranteed: estimate.position.isFloorGuaranteed,
        roomGuaranteed: estimate.position.isRoomGuaranteed,
      };
    },
  };
}
