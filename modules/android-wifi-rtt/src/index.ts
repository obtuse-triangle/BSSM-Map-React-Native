import { NativeModule, requireNativeModule } from 'expo-modules-core';

interface RttMeasurement {
  bssid: string;
  distanceMm: number;
  distanceStdDevMm: number;
  rssi: number;
  success: boolean;
  timestamp: number;
}

interface AccessPointInfo {
  bssid: string;
  ssid: string;
  frequency: number;
  is80211mcResponder: boolean;
}

declare class AndroidWifiRttModule extends NativeModule {
  isAvailable(): boolean;
  startRttScan(bssids: string[]): Promise<RttMeasurement[]>;
  getAvailableAccessPoints(): Promise<AccessPointInfo[]>;
}

const AndroidWifiRtt = requireNativeModule<AndroidWifiRttModule>('AndroidWifiRtt');
export { AndroidWifiRtt, RttMeasurement, AccessPointInfo };
