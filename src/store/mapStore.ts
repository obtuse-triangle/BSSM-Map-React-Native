import { create } from 'zustand';

import { bssmFloorMap } from '../constants/bssmFloorMap';
import type { FloorKey } from '../types/floorMap';
import { getFirstFloorKey } from '../utils/floorMap';

export type MapBaseLayer = 'osm' | 'satellite' | 'design';

export type CampusFeatureCategory =
  | 'classroom'
  | 'corridor'
  | 'elevator'
  | 'facility'
  | 'restroom'
  | 'room'
  | 'stair'
  | 'structural';

const ALL_CATEGORIES: CampusFeatureCategory[] = [
  'classroom',
  'corridor',
  'elevator',
  'facility',
  'restroom',
  'room',
  'stair',
  'structural',
];

type MapStoreState = {
  selectedFloorKey: FloorKey | null;
  selectedLevel: number;
  selectedRoomId: number | null;
  selectedFeatureId: string | null;
  showApMarkers: boolean;
  baseLayer: MapBaseLayer;
  hiddenCategories: Set<CampusFeatureCategory>;
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
  setBaseLayer: (layer: MapBaseLayer) => void;
  toggleCategory: (category: CampusFeatureCategory) => void;
  showAllCategories: () => void;
  hideAllCategories: () => void;
  allCategories: () => CampusFeatureCategory[];
};

const initialFloorKey = getFirstFloorKey(bssmFloorMap) ?? null;

export const useMapStore = create<MapStoreState>()((set, get) => ({
  selectedFloorKey: initialFloorKey,
  selectedLevel: 1,
  selectedRoomId: null,
  selectedFeatureId: null,
  showApMarkers: false,
  baseLayer: 'osm',
  hiddenCategories: new Set<CampusFeatureCategory>(),
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
  setBaseLayer: (layer) => {
    set({ baseLayer: layer });
  },
  toggleCategory: (category) => {
    set((state) => {
      const next = new Set(state.hiddenCategories);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return { hiddenCategories: next };
    });
  },
  showAllCategories: () => {
    set({ hiddenCategories: new Set() });
  },
  hideAllCategories: () => {
    set({ hiddenCategories: new Set(ALL_CATEGORIES) });
  },
  allCategories: () => ALL_CATEGORIES,
}));
