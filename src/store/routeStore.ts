import { create } from 'zustand';

import campusDataUntyped from '../data/campus-wgs84.json';

import type { CampusGeoJSON } from '../types/geojson';
import type {
  RouteAccessibilityMode,
  RouteDestination,
  RouteOption,
  RouteOrigin,
  RouteResult,
  RouteSortMode,
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
    effortMeters: 50,
    effortScore: 0.5,
    connectorStats: {
      stairAscentFloors: 0,
      stairDescentFloors: 0,
      elevatorRideCount: 0,
      floorChangeCount: 0,
    },
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
  computeIndoorRoute = fn
  useRouteOptionsService = false
}

let computeRouteOptionsService: ((input: {
  origin: RouteOrigin
  destination: RouteDestination
  accessibilityMode?: RouteAccessibilityMode
}) => RouteOption[]) | null = null

let useRouteOptionsService = true

function compareBySortMode(a: RouteOption, b: RouteOption, mode: RouteSortMode): number {
  const ar = a.result;
  const br = b.result;
  if (!ar.ok || !br.ok) return 0;

  switch (mode) {
    case 'recommended':
      return (a.balancedScore ?? Infinity) - (b.balancedScore ?? Infinity);
    case 'fastest':
      return ar.estimatedTimeSeconds - br.estimatedTimeSeconds;
    case 'shortest':
      return ar.totalDistanceMeters - br.totalDistanceMeters;
    case 'easiest':
      return (ar.effortMeters ?? Infinity) - (br.effortMeters ?? Infinity);
  }
}

function computeRouteOptionsUsingIndoorRoute(input: {
  origin: RouteOrigin
  destination: RouteDestination
}): { options: RouteOption[]; lastError: string | null } {
  const options: RouteOption[] = []
  let lastError: string | null = null
  const modes: RouteAccessibilityMode[] = ['normal', 'elevator_priority']
  for (const mode of modes) {
    const result = computeIndoorRoute({
      ...input,
      accessibilityMode: mode,
    })
    if (result.ok) {
      const isDuplicate = options.some(
        (o) =>
          o.result.ok &&
          Math.abs(o.result.totalDistanceMeters - result.totalDistanceMeters) < 0.1 &&
          o.result.floorSegments.length === result.floorSegments.length,
      )
      if (!isDuplicate) {
        options.push({
          id: mode === 'normal' ? 'shortest' : 'elevator_priority',
          label: mode === 'normal' ? '최단 경로' : '엘리베이터 우선',
          profile: mode === 'normal' ? 'shortest' : 'easiest',
          accessibilityMode: mode,
          result,
        })
      }
    } else {
      lastError = result.reason
    }
  }
  return { options, lastError }
}

export interface RouteStoreState {
  routeOrigin: RouteOrigin | null;
  routeDestination: RouteDestination | null;
  routeResult: RouteResult | null;
  routeOptions: RouteOption[];
  selectedRouteIndex: number;
  accessibilityMode: RouteAccessibilityMode;
  sortMode: RouteSortMode;
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
  setSortMode: (mode: RouteSortMode) => void;
  recomputeRoute: () => void;
}

export const useRouteStore = create<RouteStoreState>()((set, get) => ({
  routeOrigin: null,
  routeDestination: null,
  routeResult: null,
  routeOptions: [],
  selectedRouteIndex: 0,
  accessibilityMode: 'normal',
  sortMode: 'recommended',
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
    if (get().routeDestination) {
      get().computeRouteOptions();
    }
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
    if (get().routeDestination) {
      get().computeRouteOptions();
    }
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
    if (get().routeOrigin) {
      get().computeRouteOptions();
    }
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
      let options: RouteOption[]
      let lastError: string | null = null
      const accessibilityMode = get().accessibilityMode

      if (useRouteOptionsService && computeRouteOptionsService) {
        options = computeRouteOptionsService({
          origin: routeOrigin,
          destination: routeDestination,
          accessibilityMode,
        })
      } else {
        const result = computeRouteOptionsUsingIndoorRoute({ origin: routeOrigin, destination: routeDestination })
        options = result.options
        lastError = result.lastError
      }

      if (options.length === 0) {
        console.warn('[RouteStore] computeRouteOptions returned 0 options. lastError:', lastError)
        set({
          routeResult: null,
          routeOptions: [],
          selectedRouteIndex: 0,
          isComputing: false,
          error: lastError ?? 'Route computation failed',
        })
      } else {
        const { sortMode } = get();
        const sorted = [...options].sort((a, b) => compareBySortMode(a, b, sortMode));
        set({
          routeOptions: sorted,
          selectedRouteIndex: 0,
          routeResult: sorted[0].result,
          isComputing: false,
          error: null,
        })
      }
    } catch (_e) {
      console.warn('[RouteStore] computeRouteOptions failed:', _e)
      set({
        isComputing: false,
        error: 'Route computation failed',
        routeOptions: [],
        routeResult: null,
      })
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
      sortMode: 'recommended',
      error: null,
      isComputing: false,
    });
  },

  setAccessibilityMode: (mode: RouteAccessibilityMode) => {
    set({ accessibilityMode: mode });
  },

  setSortMode: (mode: RouteSortMode) => {
    const { routeOptions, selectedRouteIndex } = get();
    if (routeOptions.length === 0) {
      set({ sortMode: mode });
      return;
    }

    const selectedId = routeOptions[selectedRouteIndex]?.id;

    const sorted = [...routeOptions].sort((a, b) => compareBySortMode(a, b, mode));

    let nextSelectedIndex = 0;
    if (selectedId) {
      const found = sorted.findIndex((o) => o.id === selectedId);
      if (found >= 0) nextSelectedIndex = found;
    }

    set({
      sortMode: mode,
      routeOptions: sorted,
      selectedRouteIndex: nextSelectedIndex,
      routeResult: sorted[nextSelectedIndex]?.result ?? null,
    });
  },

  recomputeRoute: () => {
    const { routeResult, routeOrigin, routeDestination } = get();
    if (routeResult && routeOrigin && routeDestination) {
      get().computeRoute();
    }
  },
}));

try {
  const { computeRoute, computeRouteOptions } = require('../services/routing/routeComputer');
  setRouteComputer(computeRoute);
  computeRouteOptionsService = computeRouteOptions;
  useRouteOptionsService = true;
} catch (_e) {
  // Tests or environments without routing data keep the mock
}
