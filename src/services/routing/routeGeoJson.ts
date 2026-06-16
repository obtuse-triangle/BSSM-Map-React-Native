/**
 * routeGeoJson.ts
 *
 * Converts a successful RouteResult's floorSegments into a WGS84 GeoJSON
 * FeatureCollection of LineString features suitable for MapLibre rendering.
 *
 * Node coordinates are resolved from a caller-supplied map (EPSG:5183 [x, y])
 * and transformed to WGS84 [lon, lat] via `transformEpsg5183ToWgs84`.
 */

import { transformEpsg5183ToWgs84 } from '../../utils/coordinateTransform';
import type { RouteResult, RouteFloorSegment } from '../../types/routing';

// ── Exported types ────────────────────────────────────────────────────

export interface RouteGeoJsonFeature {
  type: 'Feature';
  geometry: {
    type: 'LineString';
    coordinates: [number, number][]; // WGS84 [lon, lat]
  };
  properties: {
    level: number;
    segmentType: 'walk';
    segmentIndex: number;
    isCurrentLevel: boolean;
    opacityClass: 'active' | 'dimmed';
  };
}

export interface RouteGeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: RouteGeoJsonFeature[];
}

// ── Helpers ───────────────────────────────────────────────────────────

function segmentToFeature(
  segment: RouteFloorSegment,
  segmentIndex: number,
  nodeCoords: Map<string, [number, number]>,
  selectedLevel?: number,
  prependPoint?: { x: number; y: number },
  appendPoint?: { x: number; y: number },
): RouteGeoJsonFeature | null {
  const coords: [number, number][] = [];

  // Anchor the drawn line at the real origin (e.g. the selected room) so the
  // route visibly starts there and connects to the nearest corridor node it
  // enters the graph at, instead of leaving a gap.
  if (prependPoint) {
    coords.push(transformEpsg5183ToWgs84(prependPoint.x, prependPoint.y));
  }

  for (const nodeId of segment.nodeIds) {
    const epsg = nodeCoords.get(nodeId);
    if (!epsg) {
      // Skip segments with unresolvable nodes rather than crashing
      return null;
    }
    const [x, y] = epsg;
    const wgs84 = transformEpsg5183ToWgs84(x, y);
    coords.push(wgs84);
  }

  // Likewise anchor the end at the real destination point.
  if (appendPoint) {
    coords.push(transformEpsg5183ToWgs84(appendPoint.x, appendPoint.y));
  }

  // A LineString needs at least 2 coordinates
  if (coords.length < 2) {
    return null;
  }

  return {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: coords,
    },
    properties: {
      level: segment.level,
      segmentType: 'walk',
      segmentIndex,
      isCurrentLevel: selectedLevel !== undefined ? segment.level === selectedLevel : false,
      opacityClass: selectedLevel !== undefined && segment.level === selectedLevel ? 'active' : 'dimmed',
    },
  };
}

// ── Main export ───────────────────────────────────────────────────────

/**
 * Convert a successful RouteResult into a WGS84 GeoJSON FeatureCollection.
 *
 * @param result  A RouteResult. If `ok: false`, returns an empty collection.
 * @param nodeCoords  Map from node ID → EPSG:5183 [x, y] coordinates.
 * @returns FeatureCollection with one LineString per floor segment.
 */
export function routeResultToGeoJson(
  result: RouteResult,
  nodeCoords: Map<string, [number, number]>,
  selectedLevel?: number,
): RouteGeoJsonFeatureCollection {
  if (!result.ok) {
    return { type: 'FeatureCollection', features: [] };
  }

  const features: RouteGeoJsonFeature[] = [];
  const lastIndex = result.floorSegments.length - 1;

  for (let i = 0; i < result.floorSegments.length; i++) {
    const segment = result.floorSegments[i];
    // Anchor the first segment to the origin and the last to the destination,
    // but only when they share that segment's floor (a cross-floor route's
    // origin/destination live on the first/last segment respectively).
    const prependPoint =
      i === 0 && result.originPoint?.level === segment.level ? result.originPoint : undefined;
    const appendPoint =
      i === lastIndex && result.destinationPoint?.level === segment.level
        ? result.destinationPoint
        : undefined;

    const feature = segmentToFeature(
      segment,
      i,
      nodeCoords,
      selectedLevel,
      prependPoint,
      appendPoint,
    );
    if (feature) {
      features.push(feature);
    }
  }

  return { type: 'FeatureCollection', features };
}
