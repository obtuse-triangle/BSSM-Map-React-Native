import campusDataUntyped from '../../data/campus-wgs84.json';
import type { CampusFeature, CampusGeoJSON, GeoJSONPosition } from '../../types/geojson';
import type { ZoneInference } from '../../types/fusion';
import { pointInPolygon } from '../../utils/buildingDetection';

const campusData = campusDataUntyped as unknown as CampusGeoJSON;

const normalizeFloorKey = (value: string | number | null | undefined): string => String(value ?? '').trim();

const matchesFloor = (feature: CampusFeature, floorKey: string): boolean => {
  const normalizedFloorKey = normalizeFloorKey(floorKey);
  const { level, level_id: levelId } = feature.properties;

  return normalizeFloorKey(level) === normalizedFloorKey || normalizeFloorKey(levelId) === normalizedFloorKey;
};

const ringArea = (ring: readonly GeoJSONPosition[]): number => {
  if (ring.length < 3) {
    return 0;
  }

  let area = 0;

  for (let index = 0; index < ring.length; index += 1) {
    const [currentLng, currentLat] = ring[index];
    const [nextLng, nextLat] = ring[(index + 1) % ring.length];
    area += currentLng * nextLat - nextLng * currentLat;
  }

  return Math.abs(area) / 2;
};

const getExteriorRings = (feature: CampusFeature): readonly GeoJSONPosition[][] => {
  if (feature.geometry.type === 'Polygon') {
    return [feature.geometry.coordinates[0]];
  }

  if (feature.geometry.type === 'MultiPolygon') {
    return feature.geometry.coordinates.map((polygon) => polygon[0]);
  }

  return [];
};

const findContainingFeature = (lat: number, lng: number, floorKey: string): CampusFeature | null => {
  let bestMatch: { feature: CampusFeature; area: number } | null = null;

  for (const feature of campusData.features) {
    if (!matchesFloor(feature, floorKey)) {
      continue;
    }

    for (const ring of getExteriorRings(feature)) {
      if (!pointInPolygon(lng, lat, ring)) {
        continue;
      }

      const area = ringArea(ring);
      if (bestMatch === null || area < bestMatch.area) {
        bestMatch = { feature, area };
      }
    }
  }

  return bestMatch?.feature ?? null;
};

export const getFeaturesForFloor = (floorKey: string): readonly CampusFeature[] => {
  return campusData.features.filter((feature) => matchesFloor(feature, floorKey));
};

export const inferZone = (lat: number, lng: number, floorKey: string): ZoneInference => {
  const feature = findContainingFeature(lat, lng, floorKey);

  if (feature === null) {
    return {
      zoneId: null,
      zoneName: null,
      zoneNameKo: null,
      category: 'unknown',
      floorKey,
      isInsideKnownZone: false,
    };
  }

  return {
    zoneId: feature.properties.id,
    zoneName: feature.properties.name,
    zoneNameKo: feature.properties.name_ko,
    category: feature.properties.category,
    floorKey,
    isInsideKnownZone: true,
  };
};

export type { ZoneInference } from '../../types/fusion';
