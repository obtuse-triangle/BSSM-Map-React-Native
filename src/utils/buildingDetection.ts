import type { CampusGeoJSON, GeoJSONPosition } from '../types/geojson';

export const pointInPolygon = (lng: number, lat: number, polygon: readonly GeoJSONPosition[]): boolean => {
  let isInside = false;

  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index, index += 1) {
    const [currentLng, currentLat] = polygon[index];
    const [previousLng, previousLat] = polygon[previousIndex];

    const latIntersects = currentLat > lat !== previousLat > lat;

    if (latIntersects) {
      const intersectLng = ((previousLng - currentLng) * (lat - currentLat)) / (previousLat - currentLat) + currentLng;

      if (lng < intersectLng) {
        isInside = !isInside;
      }
    }
  }

  return isInside;
};

export const isPointInBuilding = (lng: number, lat: number, geojson: CampusGeoJSON): boolean => {
  return geojson.features.some((feature) => {
    const { geometry } = feature;

    if (geometry.type !== 'Polygon') {
      return false;
    }

    const exteriorRing = geometry.coordinates[0];

    return pointInPolygon(lng, lat, exteriorRing);
  });
};

export const getDetectedBuildingId = (lng: number, lat: number, geojson: CampusGeoJSON): string | null => {
  for (const feature of geojson.features) {
    if (feature.geometry.type !== 'Polygon') {
      continue;
    }

    const exteriorRing = feature.geometry.coordinates[0];

    if (pointInPolygon(lng, lat, exteriorRing)) {
      return feature.properties.building_id ?? null;
    }
  }

  return null;
};

/**
 * Returns null because GPS altitude is not reliable enough to infer floor level.
 * Typical phone GPS altitude accuracy is often around ±10m, while a floor is only
 * about 3m tall, so altitude alone can easily map to the wrong floor.
 */
export const getFloorFromAltitude = (_altitude: number): number | null => {
  return null;
};
