import type { Floor, FloorKey, FloorListItem, FloorMapData } from '../types/floorMap';

export const getFloorKeys = (floorMap: FloorMapData | null | undefined): FloorKey[] => {
  if (!floorMap) {
    return [];
  }

  return Object.keys(floorMap.floors);
};

export const getFloorList = (floorMap: FloorMapData | null | undefined): FloorListItem[] => {
  if (!floorMap) {
    return [];
  }

  return getFloorKeys(floorMap).map((floorKey) => ({
    floorKey,
    floor: floorMap.floors[floorKey],
  }));
};

export const getSelectedFloor = (
  floorMap: FloorMapData | null | undefined,
  selectedFloorKey: FloorKey | null | undefined,
): Floor | undefined => {
  if (!floorMap || !selectedFloorKey) {
    return undefined;
  }

  return floorMap.floors[selectedFloorKey];
};

export const hasFloorKey = (
  floorMap: FloorMapData | null | undefined,
  floorKey: FloorKey | null | undefined,
): floorKey is FloorKey => {
  if (!floorMap || !floorKey) {
    return false;
  }

  return Object.prototype.hasOwnProperty.call(floorMap.floors, floorKey);
};

export const getFirstFloorKey = (floorMap: FloorMapData | null | undefined): FloorKey | undefined => {
  return getFloorKeys(floorMap)[0];
};
