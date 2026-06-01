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
  showSatellite: boolean;
  detectedBuildingId: string | null;
  userCoordinates: { longitude: number; latitude: number } | null;
  setSelectedFloorKey: (floorKey: FloorKey) => void;
  setSelectedLevel: (level: number) => void;
  setSelectedRoomId: (roomId: number | null) => void;
  setSelectedFeatureId: (featureId: string | null) => void;
  clearSelectedRoom: () => void;
  setShowApMarkers: (showApMarkers: boolean) => void;
  setDetectedBuildingId: (buildingId: string | null) => void;
  setUserCoordinates: (coords: { longitude: number; latitude: number } | null) => void;
  toggleApMarkers: () => void;
  toggleSatellite: () => void;
};

const initialFloorKey = getFirstFloorKey(bssmFloorMap) ?? null;

export const useMapStore = create<MapStoreState>()((set) => ({
  selectedFloorKey: initialFloorKey,
  selectedLevel: 1,
  selectedRoomId: null,
  selectedFeatureId: null,
  showApMarkers: false,
  showSatellite: false,
  detectedBuildingId: null,
  userCoordinates: null,
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
  setDetectedBuildingId: (detectedBuildingId) => {
    set({ detectedBuildingId });
  },
  setUserCoordinates: (userCoordinates) => {
    set({ userCoordinates });
  },
  toggleApMarkers: () => {
    set((state) => ({ showApMarkers: !state.showApMarkers }));
  },
  toggleSatellite: () => {
    set((state) => ({ showSatellite: !state.showSatellite }));
  },
}));
