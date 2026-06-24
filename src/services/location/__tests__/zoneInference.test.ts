import campusDataUntyped from '../../../data/campus-wgs84.json';
import type { CampusGeoJSON } from '../../../types/geojson';
import { getFeaturesForFloor, inferZone } from '../zoneInference';

const campusData = campusDataUntyped as unknown as CampusGeoJSON;

const chosenRoom = campusData.features.find(
  (feature) => feature.geometry.type === 'Polygon' && String(feature.properties.level_id) === '1' && feature.properties.id === '1-1-67',
);

if (chosenRoom === undefined) {
  throw new Error('Expected fixture room 1-4-7 to exist in campus data');
}

const ring = chosenRoom.geometry.type === 'Polygon' ? chosenRoom.geometry.coordinates[0] : [];
const centerLng = (Math.min(...ring.map(([lng]) => lng)) + Math.max(...ring.map(([lng]) => lng))) / 2;
const centerLat = (Math.min(...ring.map(([, lat]) => lat)) + Math.max(...ring.map(([, lat]) => lat))) / 2;

describe('zoneInference', () => {
  it('returns the containing room on the matching floor', () => {
    const result = inferZone(centerLat, centerLng, '1');

    expect(result).toEqual({
      zoneId: '1-1-67',
      zoneName: '기계실',
      zoneNameKo: '기계실',
      category: 'classroom',
      floorKey: '1',
      isInsideKnownZone: true,
    });
  });

  it('returns unknown when the floor does not match', () => {
    const result = inferZone(centerLat, centerLng, '3');

    expect(result).toEqual({
      zoneId: null,
      zoneName: null,
      zoneNameKo: null,
      category: 'unknown',
      floorKey: '3',
      isInsideKnownZone: false,
    });
  });

  it('returns unknown for a point outside all polygons', () => {
    expect(() => inferZone(0, 0, '1')).not.toThrow();

    const result = inferZone(0, 0, '1');

    expect(result).toEqual({
      zoneId: null,
      zoneName: null,
      zoneNameKo: null,
      category: 'unknown',
      floorKey: '1',
      isInsideKnownZone: false,
    });
  });

  it('filters features by floor key', () => {
    const floorOneFeatures = getFeaturesForFloor('1');

    expect(floorOneFeatures.length).toBeGreaterThan(0);
    expect(floorOneFeatures.every((feature) => String(feature.properties.level) === '1' || String(feature.properties.level_id) === '1')).toBe(true);
    expect(floorOneFeatures.some((feature) => feature.properties.id === '3-5-27')).toBe(false);
  });
});
