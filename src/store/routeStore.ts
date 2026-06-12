import { create } from 'zustand';

import campusDataUntyped from '../data/campus-wgs84.json';

import type { CampusGeoJSON } from '../types/geojson';
import type {
  RouteAccessibilityMode,
  RouteDestination,
  RouteOrigin,
  RouteResult,
} from '../types/routing';
import { getFeatureById, getFeatureCentroid } from '../utils/geoJsonHelpers';

const campusData = campusDataUntyped as unknown as CampusGeoJSON;

// ── Injectable route computer ──────────────────────────────────────

function mockComputeRoute(input: {
  origin: RouteOrigin;
  destination: RouteDestination;
  accessibilityMode: RouteAccessibilityMode;
}): RouteResult {
  return {
    ok: true,
    floorSegments: [
      {
        level: input.origin.level,
        nodeIds: ['mock-origin', 'mock-destination'],
        distanceMeters: 50,
      },
    ],
    totalDistanceMeters: 50,
    estimatedTimeSeconds: 60,
    usedStairsFallback: false,
  };
}

export let computeIndoorRoute: (input: {
  origin: RouteOrigin;
  destination: RouteDestination;
  accessibilityMode: RouteAccessibilityMode;
}) => RouteResult = mockComputeRoute;

export function setRouteComputer(
  fn: typeof computeIndoorRoute,
): void {
  computeIndoorRoute = fn;
}

// ── Store ──────────────────────────────────────────────────────────

export interface RouteStoreState {
  routeOrigin: RouteOrigin | null;
  routeDestination: RouteDestination | null;
  routeResult: RouteResult | null;
  accessibilityMode: RouteAccessibilityMode;
  isComputing: boolean;
  error: string | null;

  setOriginFromFeature: (featureId: string) => void;
  setOriginFromUserLocation: (
    coordinates: [number, number],
    level: number,
    accuracy?: number,
  ) => void;
  setDestinationFeature: (featureId: string) => void;
  computeRoute: () => void;
  clearRoute: () => void;
  setAccessibilityMode: (mode: RouteAccessibilityMode) => void;
  recomputeRoute: () => void;
}

export const useRouteStore = create<RouteStoreState>()((set, get) => ({
  routeOrigin: null,
  routeDestination: null,
  routeResult: null,
  accessibilityMode: 'normal',
  isComputing: false,
  error: null,

  setOriginFromFeature: (featureId: string) => {
    const feature = getFeatureById(campusData, featureId);
    if (!feature) {
      set({ error: `Feature "${featureId}" not found` });
      return;
    }
    const centroid = getFeatureCentroid(feature);
    const level = feature.properties.level;
    set({
      routeOrigin: {
        type: 'selected_place',
        featureId,
        coordinates: centroid,
        level,
      },
      error: null,
    });
  },

  setOriginFromUserLocation: (
    coordinates: [number, number],
    level: number,
    accuracy?: number,
  ) => {
    const origin: RouteOrigin = {
      type: 'user_location',
      coordinates,
      level,
      ...(accuracy !== undefined ? { accuracy } : {}),
    };
    set({ routeOrigin: origin, error: null });
  },

  setDestinationFeature: (featureId: string) => {
    const feature = getFeatureById(campusData, featureId);
    if (!feature) {
      set({ error: `Feature "${featureId}" not found` });
      return;
    }
    const centroid = getFeatureCentroid(feature);
    const level = feature.properties.level;
    set({
      routeDestination: { featureId, coordinates: centroid, level },
      error: null,
    });
  },

  computeRoute: () => {
    const { routeOrigin, routeDestination } = get();
    if (!routeOrigin) {
      set({ error: 'ROUTE_ORIGIN_REQUIRED', isComputing: false });
      return;
    }
    if (!routeDestination) {
      set({ error: 'ROUTE_DESTINATION_REQUIRED', isComputing: false });
      return;
    }
    set({ isComputing: true, error: null });
    try {
      const result = computeIndoorRoute({
        origin: routeOrigin,
        destination: routeDestination,
        accessibilityMode: get().accessibilityMode,
      });
      if (result.ok) {
        set({ routeResult: result, isComputing: false, error: null });
      } else {
        set({ routeResult: null, isComputing: false, error: result.reason });
      }
    } catch (_e) {
      set({
        isComputing: false,
        error: 'Route computation failed',
      });
    }
  },

  clearRoute: () => {
    set({
      routeOrigin: null,
      routeDestination: null,
      routeResult: null,
      error: null,
      isComputing: false,
    });
  },

  setAccessibilityMode: (mode: RouteAccessibilityMode) => {
    set({ accessibilityMode: mode });
  },

  recomputeRoute: () => {
    const { routeResult, routeOrigin, routeDestination } = get();
    if (routeResult && routeOrigin && routeDestination) {
      get().computeRoute();
    }
  },
}));
