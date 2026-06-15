/**
 * RoutePathLayer — Renders the computed route on the MapLibre map.
 *
 * ## Design
 *
 * Follows the imperative subscribe pattern from SavedPinsLayer to avoid
 * cascading re-renders. Subscribes to routeStore (routeResult) and mapStore
 * (selectedLevel), rebuilds GeoJSON only when relevant state changes.
 *
 * Two visual layers:
 *   - route-dimmed:  grey, thin, low-opacity — segments on OTHER floors
 *   - route-active:  blue, wide, full-opacity — segments on CURRENT floor
 *
 * ## Data flow
 *
 *   routeStore.routeResult + mapStore.selectedLevel
 *       │
 *       └── imperative subscribe (no React re-render)
 *               ↓
 *           buildRouteLayerData(result, level, nodeCoords)
 *               ↓
 *           GeoJSONSource data → MapLibre GL layers
 *
 * ## Node coordinate cache
 *
 * The routing graph (~4543 nodes, ~760ms build) is cached at module level
 * as a node-ID → EPSG:5183 [x,y] map, same pattern as coordinateSnap.ts.
 *
 * ## Layer IDs (stable — not queried by CampusMap but kept stable for consistency)
 *
 *   - route-dimmed-source  / route-dimmed  (LineString)
 *   - route-active-source  / route-active  (LineString)
 *
 * @see CampusMap.tsx — renders this inside <Map>
 */

import React, { useEffect, useRef, useState } from 'react';
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { useRouteStore } from '../../store/routeStore';
import { useMapStore } from '../../store/mapStore';
import { buildRoutingGraph } from '../../services/routing/graphBuilder';
import { buildRouteLayerData } from './routeLayerData';
import type { RouteGeoJsonFeature } from '../../services/routing/routeGeoJson';

// ── Node coordinate cache (module-level singleton) ────────────────────

let nodeCoordCache: Map<string, [number, number]> | null = null;

function getNodeCoords(): Map<string, [number, number]> {
  if (!nodeCoordCache) {
    const graph = buildRoutingGraph();
    nodeCoordCache = new Map<string, [number, number]>();
    for (const [id, node] of graph.nodes) {
      nodeCoordCache.set(id, [node.x, node.y]);
    }
  }
  return nodeCoordCache;
}

// ── Types for local state ─────────────────────────────────────────────

type FeatureCollection = {
  type: 'FeatureCollection';
  features: RouteGeoJsonFeature[];
};

type PointFeatureCollection = {
  type: 'FeatureCollection';
  features: {
    type: 'Feature';
    geometry: { type: 'Point'; coordinates: [number, number] };
    properties: Record<string, never>;
  }[];
};

// ── Component ─────────────────────────────────────────────────────────

function RoutePathLayer() {
  const [activeData, setActiveData] = useState<FeatureCollection | null>(null);
  const [dimmedData, setDimmedData] = useState<FeatureCollection | null>(null);
  const [originData, setOriginData] = useState<PointFeatureCollection | null>(null);
  const [destinationData, setDestinationData] = useState<PointFeatureCollection | null>(null);
  const lastRouteResultRef = useRef<unknown>(null);
  const lastSelectedLevelRef = useRef<number>(-1);

  useEffect(() => {
    const rebuild = () => {
      const routeResult = useRouteStore.getState().routeResult;
      const selectedLevel = useMapStore.getState().selectedLevel;

      // Skip rebuild if nothing changed (reference + value compare)
      if (
        routeResult === lastRouteResultRef.current &&
        selectedLevel === lastSelectedLevelRef.current
      ) {
        return;
      }

      lastRouteResultRef.current = routeResult;
      lastSelectedLevelRef.current = selectedLevel;

      const { activeFeatures, dimmedFeatures } = buildRouteLayerData(
        routeResult,
        selectedLevel,
        getNodeCoords(),
      );

      setActiveData(
        activeFeatures.length > 0
          ? { type: 'FeatureCollection', features: activeFeatures }
          : null,
      );
      setDimmedData(
        dimmedFeatures.length > 0
          ? { type: 'FeatureCollection', features: dimmedFeatures }
          : null,
      );

      const origin = useRouteStore.getState().routeOrigin;
      const dest = useRouteStore.getState().routeDestination;

      setOriginData(
        origin && origin.level === selectedLevel
          ? {
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  geometry: { type: 'Point', coordinates: origin.coordinates },
                  properties: {},
                },
              ],
            }
          : null,
      );

      setDestinationData(
        dest && dest.level === selectedLevel
          ? {
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  geometry: { type: 'Point', coordinates: dest.coordinates },
                  properties: {},
                },
              ],
            }
          : null,
      );
    };

    // Initial data load
    rebuild();

    // Subscribe to route result changes
    const unsubRoute = useRouteStore.subscribe(rebuild);

    // Subscribe to selected level changes
    const unsubLevel = useMapStore.subscribe((state, prevState) => {
      if (state.selectedLevel === prevState.selectedLevel) return;
      rebuild();
    });

    return () => {
      unsubRoute();
      unsubLevel();
    };
  }, []);

  // If no route data at all, render nothing
  if (!activeData && !dimmedData && !originData && !destinationData) {
    return null;
  }

  return (
    <>
      {/* Dimmed segments — other floors */}
      {dimmedData && (
        <GeoJSONSource id="route-dimmed-source" data={dimmedData}>
          <Layer
            id="route-dimmed"
            type="line"
            paint={{
              'line-color': '#999999',
              'line-opacity': 0.3,
              'line-width': 2,
            }}
          />
        </GeoJSONSource>
      )}

      {/* Active segments — current floor */}
      {activeData && (
        <GeoJSONSource id="route-active-source" data={activeData}>
          <Layer
            id="route-active"
            type="line"
            paint={{
              'line-color': '#2979FF',
              'line-opacity': 1.0,
              'line-width': 4,
            }}
          />
        </GeoJSONSource>
      )}

      {originData && (
        <GeoJSONSource id="route-origin-source" data={originData}>
          <Layer
            id="route-origin-marker"
            type="circle"
            paint={{
              'circle-radius': 8,
              'circle-color': '#34C759',
              'circle-opacity': 1.0,
              'circle-stroke-width': 2,
              'circle-stroke-color': '#FFFFFF',
            }}
          />
        </GeoJSONSource>
      )}

      {destinationData && (
        <GeoJSONSource id="route-destination-source" data={destinationData}>
          <Layer
            id="route-destination-marker"
            type="circle"
            paint={{
              'circle-radius': 8,
              'circle-color': '#FF3B30',
              'circle-opacity': 1.0,
              'circle-stroke-width': 2,
              'circle-stroke-color': '#FFFFFF',
            }}
          />
        </GeoJSONSource>
      )}
    </>
  );
}

/** React.memo prevents parent (CampusMap) re-renders from cascading. */
export default React.memo(RoutePathLayer);
