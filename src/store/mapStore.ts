import { create } from 'zustand';

import { bssmFloorMap } from '../constants/bssmFloorMap';
import type { FloorKey } from '../types/floorMap';
import { getFirstFloorKey } from '../utils/floorMap';

type MapStoreState = {
  selectedFloorKey: FloorKey | null;
  selectedLevel: number;
  selectedRoomId: number | null;
  selectedFeatureId: string | null;
  showApMarkers: boolean;
  setSelectedFloorKey: (floorKey: FloorKey) => void;
  setSelectedLevel: (level: number) => void;
  setSelectedRoomId: (roomId: number | null) => void;
  setSelectedFeatureId: (featureId: string | null) => void;
  clearSelectedRoom: () => void;
  setShowApMarkers: (showApMarkers: boolean) => void;
  toggleApMarkers: () => void;
};

const initialFloorKey = getFirstFloorKey(bssmFloorMap) ?? null;

export const useMapStore = create<MapStoreState>()((set) => ({
  selectedFloorKey: initialFloorKey,
  selectedLevel: 1,
  selectedRoomId: null,
  selectedFeatureId: null,
  showApMarkers: false,
  setSelectedFloorKey: (floorKey) => {
    set({ selectedFloorKey: floorKey, selectedRoomId: null, selectedFeatureId: null });
  },
  setSelectedLevel: (level) => {
    set({ selectedLevel: level, selectedRoomId: null, selectedFeatureId: null });
  },
  setSelectedRoomId: (roomId) => {
    set({ selectedRoomId: roomId });
  },
  setSelectedFeatureId: (featureId) => {
    set({ selectedFeatureId: featureId });
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
