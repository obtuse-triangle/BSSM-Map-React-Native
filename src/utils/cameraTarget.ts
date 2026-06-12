import type { CampusFeature, GeoJSONMultiPolygon, GeoJSONPolygon } from '../types/geojson';
import { getFeatureCentroid } from './geoJsonHelpers';

export const CAMERA_FLY_TO_DURATION_MS = 500;
export const TRACKING_TARGET_ZOOM = 18.5;
export const FEATURE_TARGET_FALLBACK_ZOOM = 19;
export const FEATURE_FIT_PADDING = { top: 80, right: 64, bottom: 260, left: 64 };

type FeatureBounds = [number, number, number, number];

export type FeatureCameraTarget =
  | {
      type: 'bounds';
      bounds: FeatureBounds;
      padding: { top: number; right: number; bottom: number; left: number };
      duration: number;
    }
  | {
      type: 'center';
      center: [number, number];
      zoom: number;
      duration: number;
    };

const isPolygonGeometry = (
  geometry: CampusFeature['geometry'],
): geometry is GeoJSONPolygon | GeoJSONMultiPolygon => {
  return geometry.type === 'Polygon' || geometry.type === 'MultiPolygon';
};

const getAllPolygonRings = (geometry: GeoJSONPolygon | GeoJSONMultiPolygon): [number, number][][] => {
  if (geometry.type === 'Polygon') {
    return geometry.coordinates as [number, number][][];
  }

  return geometry.coordinates.flat() as [number, number][][];
};

const hasPolygonCoordinates = (geometry: GeoJSONPolygon | GeoJSONMultiPolygon): boolean => {
  const rings = getAllPolygonRings(geometry);
  return rings.length > 0 && rings.some((ring) => ring.length > 0);
};

const isFiniteCoordinate = (coordinate: readonly number[]): coordinate is [number, number] => {
  const [lon, lat] = coordinate;
  return Number.isFinite(lon) && Number.isFinite(lat);
};

export const getFeatureBounds = (feature: CampusFeature): FeatureBounds | null => {
  if (!isPolygonGeometry(feature.geometry)) {
    return null;
  }

  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;

  for (const ring of getAllPolygonRings(feature.geometry)) {
    for (const position of ring) {
      const [lon, lat] = position;

      if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
        return null;
      }

      west = Math.min(west, lon);
      south = Math.min(south, lat);
      east = Math.max(east, lon);
      north = Math.max(north, lat);
    }
  }

  if (!Number.isFinite(west) || !Number.isFinite(south) || !Number.isFinite(east) || !Number.isFinite(north)) {
    return null;
  }

  if (west === east || south === north) {
    return null;
  }

  return [west, south, east, north];
};

export const getCoordinateFlyToOptions = (coordinates: [number, number]): { center: [number, number]; zoom: number; duration: number } => {
  return {
    center: coordinates,
    zoom: TRACKING_TARGET_ZOOM,
    duration: CAMERA_FLY_TO_DURATION_MS,
  };
};

export const getFeatureCameraTarget = (feature: CampusFeature): FeatureCameraTarget | null => {
  if (feature.geometry.type === 'Point') {
    const coordinates = feature.geometry.coordinates;
    if (!isFiniteCoordinate(coordinates)) {
      return null;
    }

    return {
      type: 'center',
      center: coordinates,
      zoom: FEATURE_TARGET_FALLBACK_ZOOM,
      duration: CAMERA_FLY_TO_DURATION_MS,
    };
  }

  if (!isPolygonGeometry(feature.geometry)) {
    return null;
  }

  const bounds = getFeatureBounds(feature);
  if (bounds) {
    return {
      type: 'bounds',
      bounds,
      padding: FEATURE_FIT_PADDING,
      duration: CAMERA_FLY_TO_DURATION_MS,
    };
  }

  if (!hasPolygonCoordinates(feature.geometry)) {
    return null;
  }

  const centroid = getFeatureCentroid(feature);
  if (!isFiniteCoordinate(centroid)) {
    return null;
  }

  return {
    type: 'center',
    center: centroid,
    zoom: FEATURE_TARGET_FALLBACK_ZOOM,
    duration: CAMERA_FLY_TO_DURATION_MS,
  };
};
