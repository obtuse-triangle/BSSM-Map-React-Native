import { create } from 'zustand';

import { bssmFloorMap } from '../constants/bssmFloorMap';
import type { FloorKey } from '../types/floorMap';
import { getFirstFloorKey } from '../utils/floorMap';

type MapStoreState = {
  selectedFloorKey: FloorKey | null;
  selectedRoomId: number | null;
  showApMarkers: boolean;
  setSelectedFloorKey: (floorKey: FloorKey) => void;
  setSelectedRoomId: (roomId: number | null) => void;
  clearSelectedRoom: () => void;
  setShowApMarkers: (showApMarkers: boolean) => void;
  toggleApMarkers: () => void;
};

const initialFloorKey = getFirstFloorKey(bssmFloorMap) ?? null;

export const useMapStore = create<MapStoreState>()((set) => ({
  selectedFloorKey: initialFloorKey,
  selectedRoomId: null,
  showApMarkers: false,
  setSelectedFloorKey: (floorKey) => {
    set({ selectedFloorKey: floorKey, selectedRoomId: null });
  },
  setSelectedRoomId: (roomId) => {
    set({ selectedRoomId: roomId });
  },
  clearSelectedRoom: () => {
    set({ selectedRoomId: null });
  },
  setShowApMarkers: (showApMarkers) => {
    set({ showApMarkers });
  },
  toggleApMarkers: () => {
    set((state) => ({ showApMarkers: !state.showApMarkers }));
  },
}));
