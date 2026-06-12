import { create } from 'zustand';

import { bssmFloorMap } from '../constants/bssmFloorMap';
import type { FloorKey } from '../types/floorMap';
import { getFirstFloorKey } from '../utils/floorMap';

import type { MapStyleId } from '../constants/mapStyles';

export type MapBaseLayer = MapStyleId;

export type LocationSource = 'gps' | 'ble';
export type SourceCoordinates = { longitude: number; latitude: number } | null;

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
  gpsTrackingEnabled: boolean;
  bleTrackingEnabled: boolean;
  userCoordinatesSource: LocationSource | null;
  gpsCoordinates: SourceCoordinates;
  bleCoordinates: SourceCoordinates;
  // Cross-screen UI state shared between MapScreen (glass bar) and MapSheetScreen (content)
  bleCardVisible: boolean;
  settingsVisible: boolean;
  pendingFlyToFeatureId: string | null;
  showAttributionTick: number;
  setSelectedFloorKey: (floorKey: FloorKey) => void;
  setSelectedLevel: (level: number) => void;
  setSelectedRoomId: (roomId: number | null) => void;
  setSelectedFeatureId: (featureId: string | null) => void;
  clearSelectedRoom: () => void;
  setShowApMarkers: (showApMarkers: boolean) => void;
  setDetectedBuildingId: (buildingId: string | null) => void;
  /** @deprecated Use setGpsCoordinates instead. */
  setUserCoordinates: (coords: { longitude: number; latitude: number } | null) => void;
  setGpsTrackingEnabled: (enabled: boolean) => void;
  setBleTrackingEnabled: (enabled: boolean) => void;
  setGpsCoordinates: (coords: SourceCoordinates) => void;
  setBleCoordinates: (coords: SourceCoordinates) => void;
  clearLocationSource: (source: LocationSource) => void;
  toggleApMarkers: () => void;
  setBaseLayer: (layer: MapBaseLayer) => void;
  toggleCategory: (category: CampusFeatureCategory) => void;
  showAllCategories: () => void;
  hideAllCategories: () => void;
  allCategories: () => CampusFeatureCategory[];
  // Cross-screen UI actions
  setBleCardVisible: (visible: boolean) => void;
  setSettingsVisible: (visible: boolean) => void;
  setPendingFlyToFeatureId: (featureId: string | null) => void;
  requestShowAttribution: () => void;
};

const initialFloorKey = getFirstFloorKey(bssmFloorMap) ?? null;

function resolveMergedCoordinates(
  state: Pick<MapStoreState, 'bleTrackingEnabled' | 'bleCoordinates' | 'gpsTrackingEnabled' | 'gpsCoordinates'>,
): Pick<MapStoreState, 'userCoordinates' | 'userCoordinatesSource'> {
  if (state.bleTrackingEnabled && state.bleCoordinates !== null) {
    return { userCoordinates: state.bleCoordinates, userCoordinatesSource: 'ble' };
  }
  if (state.gpsTrackingEnabled && state.gpsCoordinates !== null) {
    return { userCoordinates: state.gpsCoordinates, userCoordinatesSource: 'gps' };
  }
  return { userCoordinates: null, userCoordinatesSource: null };
}

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
  gpsTrackingEnabled: false,
  bleTrackingEnabled: false,
  userCoordinatesSource: null,
  gpsCoordinates: null,
  bleCoordinates: null,
  bleCardVisible: false,
  settingsVisible: false,
  pendingFlyToFeatureId: null,
  showAttributionTick: 0,
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
  /** @deprecated Use setGpsCoordinates instead — delegates to setGpsCoordinates for backward compatibility. */
  setUserCoordinates: (coords) => {
    set((state) => ({
      gpsCoordinates: coords,
      ...resolveMergedCoordinates({ ...state, gpsCoordinates: coords }),
    }));
  },
  setGpsTrackingEnabled: (enabled) => {
    set((state) => {
      const gpsCoordinates = enabled ? state.gpsCoordinates : null;
      return {
        gpsTrackingEnabled: enabled,
        gpsCoordinates,
        ...resolveMergedCoordinates({ ...state, gpsTrackingEnabled: enabled, gpsCoordinates }),
      };
    });
  },
  setBleTrackingEnabled: (enabled) => {
    set((state) => {
      const bleCoordinates = enabled ? state.bleCoordinates : null;
      return {
        bleTrackingEnabled: enabled,
        bleCoordinates,
        ...resolveMergedCoordinates({ ...state, bleTrackingEnabled: enabled, bleCoordinates }),
      };
    });
  },
  setGpsCoordinates: (coords) => {
    if (get().gpsTrackingEnabled === false && coords !== null) return;
    set((state) => ({
      gpsCoordinates: coords,
      ...resolveMergedCoordinates({ ...state, gpsCoordinates: coords }),
    }));
  },
  setBleCoordinates: (coords) => {
    if (get().bleTrackingEnabled === false && coords !== null) return;
    set((state) => ({
      bleCoordinates: coords,
      ...resolveMergedCoordinates({ ...state, bleCoordinates: coords }),
    }));
  },
  clearLocationSource: (source) => {
    set((state) => {
      if (source === 'gps') {
        return {
          gpsCoordinates: null,
          ...resolveMergedCoordinates({ ...state, gpsCoordinates: null }),
        };
      }
      return {
        bleCoordinates: null,
        ...resolveMergedCoordinates({ ...state, bleCoordinates: null }),
      };
    });
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
  setBleCardVisible: (bleCardVisible) => {
    set({ bleCardVisible });
  },
  setSettingsVisible: (settingsVisible) => {
    set({ settingsVisible });
  },
  setPendingFlyToFeatureId: (pendingFlyToFeatureId) => {
    set({ pendingFlyToFeatureId });
  },
  requestShowAttribution: () => set((state) => ({ showAttributionTick: state.showAttributionTick + 1 })),
}));
