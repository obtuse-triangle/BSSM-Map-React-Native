import type { CampusFeature, CampusGeoJSON, GeoJSONMultiPolygon, GeoJSONPolygon } from '../types/geojson';

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

export const getFeaturesForLevel = (geojson: CampusGeoJSON | null | undefined, level: number): CampusFeature[] => {
  if (!geojson) {
    return [];
  }

  return geojson.features.filter((feature) => feature.properties.level === level);
};

export const getBuildingBounds = (geojson: CampusGeoJSON | null | undefined): [number, number, number, number] => {
  if (!geojson || geojson.features.length === 0) {
    return [0, 0, 0, 0];
  }

  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;

  for (const feature of geojson.features) {
    if (!isPolygonGeometry(feature.geometry)) {
      continue;
    }

    for (const ring of getAllPolygonRings(feature.geometry)) {
      for (const position of ring) {
        const [lon, lat] = position;

        west = Math.min(west, lon);
        south = Math.min(south, lat);
        east = Math.max(east, lon);
        north = Math.max(north, lat);
      }
    }
  }

  if (!Number.isFinite(west) || !Number.isFinite(south) || !Number.isFinite(east) || !Number.isFinite(north)) {
    return [0, 0, 0, 0];
  }

  return [west, south, east, north];
};

export const getLevelKeys = (geojson: CampusGeoJSON | null | undefined): number[] => {
  if (!geojson) {
    return [];
  }

  return [...new Set(geojson.features.map((feature) => feature.properties.level))].sort((a, b) => a - b);
};

export const getInteractiveFeatures = (geojson: CampusGeoJSON | null | undefined): CampusFeature[] => {
  if (!geojson) {
    return [];
  }

  return geojson.features.filter((feature) => feature.properties.interactive);
};

export const getFeatureById = (geojson: CampusGeoJSON | null | undefined, id: string): CampusFeature | undefined => {
  if (!geojson) {
    return undefined;
  }

  return geojson.features.find((feature) => {
    if (String(feature.id) === id) {
      return true;
    }
    return feature.properties.id === id;
  });
};

export const getFeatureCentroid = (feature: CampusFeature): [number, number] => {
  if (!isPolygonGeometry(feature.geometry)) {
    return [0, 0];
  }

  let totalLon = 0;
  let totalLat = 0;
  let count = 0;

  for (const ring of getAllPolygonRings(feature.geometry)) {
    for (const [lon, lat] of ring) {
      totalLon += lon;
      totalLat += lat;
      count += 1;
    }
  }

  if (count === 0) {
    return [0, 0];
  }

  return [totalLon / count, totalLat / count];
};
