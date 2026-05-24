import { create } from 'zustand';

import type { AccessPoint } from '../types/accessPoint';
import type { FloorKey } from '../types/floorMap';
import type { IndoorPosition, IndoorPositionStatus } from '../types/position';
import { getIndoorLocationProvider } from '../services/location/indoorLocationProvider';
import { useDebugStore } from './debugStore';

type PositionStoreState = {
  status: IndoorPositionStatus;
  position: IndoorPosition | null;
  error: string | null;
  lastScanAt: number | null;
  lastMeasurementCount: number;
  lastValidMeasurementCount: number;
  locateCurrentPosition: (params: { floorKey: FloorKey; accessPoints: readonly AccessPoint[] }) => Promise<void>;
  clearCurrentPosition: () => void;
};

export const usePositionStore = create<PositionStoreState>()((set) => ({
  status: 'idle',
  position: null,
  error: null,
  lastScanAt: null,
  lastMeasurementCount: 0,
  lastValidMeasurementCount: 0,
  locateCurrentPosition: async ({ floorKey, accessPoints }) => {
    set((state) => ({
      ...state,
      status: 'loading',
      error: null,
    }));

    try {
      const provider = getIndoorLocationProvider();
      const result = await provider.locate({
        floorKey,
        accessPoints,
      });

      useDebugStore.getState().setLastScanResult(result.scanResult);
      useDebugStore.getState().setLastPosition(result.position);

      set({
        status: 'success',
        position: result.position,
        error: null,
        lastScanAt: result.measuredAt,
        lastMeasurementCount: result.measurementCount,
        lastValidMeasurementCount: result.validMeasurementCount,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '현재 위치를 찾을 수 없습니다.';

      useDebugStore.getState().setLastScanResult(null);
      useDebugStore.getState().setLastPosition(null);

      set({
        status: 'error',
        position: null,
        error: message,
        lastScanAt: Date.now(),
        lastMeasurementCount: accessPoints.length,
        lastValidMeasurementCount: 0,
      });
    }
  },
  clearCurrentPosition: () => {
    useDebugStore.getState().setLastPosition(null);

    set({
      status: 'idle',
      position: null,
      error: null,
      lastScanAt: null,
      lastMeasurementCount: 0,
      lastValidMeasurementCount: 0,
    });
  },
}));
