/**
 * routeLayerData.ts
 *
 * Pure functions for classifying route GeoJSON features into active (current
 * floor) and dimmed (other floors) groups for MapLibre layer rendering.
 *
 * No React or MapLibre imports — fully testable in Jest.
 */

import type { RouteResult } from '../../types/routing';
import {
  routeResultToGeoJson,
  type RouteGeoJsonFeature,
  type RouteGeoJsonFeatureCollection,
} from '../../services/routing/routeGeoJson';

// ── Exported types ────────────────────────────────────────────────────

export interface RouteLayerData {
  activeFeatures: RouteGeoJsonFeature[];
  dimmedFeatures: RouteGeoJsonFeature[];
}

// ── Main export ───────────────────────────────────────────────────────

/**
 * Classify route features into active (current floor) and dimmed (other floors).
 *
 * @param result       RouteResult from the store, or null.
 * @param selectedLevel  Currently selected floor level (1-4).
 * @param nodeCoords   Map from node ID → EPSG:5183 [x, y] for coordinate resolution.
 * @returns Split feature arrays for MapLibre source data.
 */
export function buildRouteLayerData(
  result: RouteResult | null,
  selectedLevel: number,
  nodeCoords: Map<string, [number, number]>,
): RouteLayerData {
  if (!result || !result.ok) {
    return { activeFeatures: [], dimmedFeatures: [] };
  }

  const geoJson = routeResultToGeoJson(result, nodeCoords, selectedLevel);

  const activeFeatures: RouteGeoJsonFeature[] = [];
  const dimmedFeatures: RouteGeoJsonFeature[] = [];

  for (const feature of geoJson.features) {
    if (feature.properties.level === selectedLevel) {
      activeFeatures.push(feature);
    } else {
      dimmedFeatures.push(feature);
    }
  }

  return { activeFeatures, dimmedFeatures };
}
