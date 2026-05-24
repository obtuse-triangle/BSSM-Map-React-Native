import { ACCESS_POINT_NAME_EXCLUSIONS, isEligibleAccessPointName } from '../constants/mapFilter';
import type { AccessPoint } from '../types/accessPoint';
import type { Floor, FloorElement, FloorKey } from '../types/floorMap';
import { clampPercent } from './coordinate';

export const DEFAULT_ACCESS_POINT_HEIGHT_METERS = 2.7;

const hashString = (value: string): number => {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
};

const toHexOctet = (value: number): string => {
  return (value & 0xff).toString(16).padStart(2, '0');
};

const buildMockBssid = (floorKey: FloorKey, room: FloorElement): string => {
  const seed = hashString(`${floorKey}:${room.id}:${room.name}`);

  return [0x02, seed, seed >>> 8, seed >>> 16, seed >>> 24, seed ^ 0x5a].map(toHexOctet).join(':');
};

const buildMockSsid = (floorKey: FloorKey, room: FloorElement): string => {
  return `BSSM-${floorKey}-${room.id}`;
};

export const getRoomCenterPercentPoint = (room: FloorElement): { x: number; y: number } => {
  return {
    x: clampPercent(room.x + room.width / 2),
    y: clampPercent(room.y + room.height / 2),
  };
};

export const shouldGenerateAccessPoint = (room: FloorElement): boolean => {
  return room.interactive === true && isEligibleAccessPointName(room.name);
};

export const createAccessPoint = (floorKey: FloorKey, room: FloorElement): AccessPoint => {
  const center = getRoomCenterPercentPoint(room);

  return {
    id: `ap-${floorKey}-${room.id}`,
    floorKey,
    roomId: room.id,
    roomName: room.name.trim(),
    ssid: buildMockSsid(floorKey, room),
    bssid: buildMockBssid(floorKey, room),
    x: center.x,
    y: center.y,
    heightMeters: DEFAULT_ACCESS_POINT_HEIGHT_METERS,
    coordinateMode: 'map-percent',
    source: 'room-center',
  };
};

export const getAccessPointsForFloor = (floorKey: FloorKey, floor: Floor | undefined): AccessPoint[] => {
  if (!floor) {
    return [];
  }

  return floor.elements.filter(shouldGenerateAccessPoint).map((room) => createAccessPoint(floorKey, room));
};

export { ACCESS_POINT_NAME_EXCLUSIONS, isEligibleAccessPointName };
