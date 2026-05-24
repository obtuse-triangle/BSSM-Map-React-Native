import type { FloorKey } from './floorMap';

export type AccessPointCoordinateMode = 'map-percent';

export type AccessPointSource = 'room-center';

export interface AccessPoint {
  id: string;
  floorKey: FloorKey;
  roomId: number;
  roomName: string;
  ssid: string;
  bssid: string;
  x: number;
  y: number;
  heightMeters: number;
  coordinateMode: AccessPointCoordinateMode;
  source: AccessPointSource;
}
