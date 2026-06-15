import { create } from 'zustand';

import campusDataUntyped from '../data/campus-wgs84.json';

import type { CampusGeoJSON } from '../types/geojson';
import type {
  RouteAccessibilityMode,
  RouteDestination,
  RouteOption,
  RouteOrigin,
  RouteResult,
} from '../types/routing';
import { getFeatureById, getFeatureCentroid } from '../utils/geoJsonHelpers';

const campusData = campusDataUntyped as unknown as CampusGeoJSON;

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

export interface RouteStoreState {
  routeOrigin: RouteOrigin | null;
  routeDestination: RouteDestination | null;
  routeResult: RouteResult | null;
  routeOptions: RouteOption[];
  selectedRouteIndex: number;
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
  computeRouteOptions: () => void;
  selectRoute: (index: number) => void;
  clearRoute: () => void;
  setAccessibilityMode: (mode: RouteAccessibilityMode) => void;
  recomputeRoute: () => void;
}

export const useRouteStore = create<RouteStoreState>()((set, get) => ({
  routeOrigin: null,
  routeDestination: null,
  routeResult: null,
  routeOptions: [],
  selectedRouteIndex: 0,
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
    get().computeRouteOptions();
  },

  computeRouteOptions: () => {
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
      const options: RouteOption[] = [];
      let lastError: string | null = null;
      const modes: RouteAccessibilityMode[] = ['normal', 'elevator_priority'];
      for (const mode of modes) {
        const result = computeIndoorRoute({
          origin: routeOrigin,
          destination: routeDestination,
          accessibilityMode: mode,
        });
        if (result.ok) {
          const isDuplicate = options.some(
            (o) =>
              o.result.ok &&
              Math.abs(o.result.totalDistanceMeters - result.totalDistanceMeters) < 0.1 &&
              o.result.floorSegments.length === result.floorSegments.length,
          );
          if (!isDuplicate) {
            options.push({
              id: mode === 'normal' ? 'shortest' : 'elevator_priority',
              label: mode === 'normal' ? '최단 경로' : '엘리베이터 우선',
              accessibilityMode: mode,
              result,
            });
          }
        } else {
          lastError = result.reason;
        }
      }
      if (options.length === 0) {
        set({
          routeResult: null,
          routeOptions: [],
          selectedRouteIndex: 0,
          isComputing: false,
          error: lastError ?? 'Route computation failed',
        });
      } else {
        set({
          routeOptions: options,
          selectedRouteIndex: 0,
          routeResult: options[0].result,
          isComputing: false,
          error: null,
        });
      }
    } catch (_e) {
      set({
        isComputing: false,
        error: 'Route computation failed',
        routeOptions: [],
        routeResult: null,
      });
    }
  },

  selectRoute: (index: number) => {
    const { routeOptions } = get();
    if (index >= 0 && index < routeOptions.length) {
      set({ selectedRouteIndex: index, routeResult: routeOptions[index].result });
    }
  },

  clearRoute: () => {
    set({
      routeOrigin: null,
      routeDestination: null,
      routeResult: null,
      routeOptions: [],
      selectedRouteIndex: 0,
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

try {
  const { computeRoute } = require('../services/routing/routeComputer');
  setRouteComputer(computeRoute);
} catch (_e) {
  // Tests or environments without routing data keep the mock
}
