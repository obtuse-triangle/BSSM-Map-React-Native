import { create } from 'zustand';

import type { AccessPoint } from '../types/accessPoint';
import type { FloorKey } from '../types/floorMap';
import type { IndoorPosition } from '../types/position';
import type { RttScanResult } from '../services/rtt/rttTypes';

type DebugStoreState = {
  lastFloorKey: FloorKey | null;
  lastAccessPoints: readonly AccessPoint[];
  lastScanResult: RttScanResult | null;
  lastPosition: IndoorPosition | null;
  setLastScanResult: (scanResult: RttScanResult | null) => void;
  setLastPosition: (position: IndoorPosition | null) => void;
  clearDebugData: () => void;
};

export const useDebugStore = create<DebugStoreState>()((set) => ({
  lastFloorKey: null,
  lastAccessPoints: [],
  lastScanResult: null,
  lastPosition: null,
  setLastScanResult: (scanResult) => {
    set({
      lastFloorKey: scanResult?.floorKey ?? null,
      lastAccessPoints: scanResult?.accessPoints ?? [],
      lastScanResult: scanResult,
    });
  },
  setLastPosition: (position) => {
    set({ lastPosition: position });
  },
  clearDebugData: () => {
    set({
      lastFloorKey: null,
      lastAccessPoints: [],
      lastScanResult: null,
      lastPosition: null,
    });
  },
}));
