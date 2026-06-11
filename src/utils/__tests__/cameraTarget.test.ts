import type { CampusFeature, CampusFeatureProperties, CampusGeometry } from '../../types/geojson';
import {
  CAMERA_FLY_TO_DURATION_MS,
  FEATURE_FIT_PADDING,
  FEATURE_TARGET_FALLBACK_ZOOM,
  TRACKING_TARGET_ZOOM,
  getCoordinateFlyToOptions,
  getFeatureBounds,
  getFeatureCameraTarget,
} from '../cameraTarget';

const defaultProperties: CampusFeatureProperties = {
  fid: 1,
  id: 'feature-1',
  name: 'Feature 1',
  name_ko: '피처 1',
  level: 1,
  level_id: '1',
  building_id: 'b1',
  category: 'room',
  interactive: false,
  source: 'test',
};

const makeFeature = (id: string | number, geometry: CampusGeometry): CampusFeature => ({
  type: 'Feature',
  id,
  geometry,
  properties: {
    ...defaultProperties,
    id: String(id),
    fid: typeof id === 'number' ? id : defaultProperties.fid,
  },
});

const makePointFeature = (coordinates: [number, number] | [number, number, number]) =>
  makeFeature('point', { type: 'Point', coordinates });

const polygonFeature = (coordinates: [[number, number][], ...[number, number][][]]) =>
  makeFeature('polygon', { type: 'Polygon', coordinates });

const multiPolygonFeature = (coordinates: [number, number][][][]) =>
  makeFeature('multipolygon', { type: 'MultiPolygon', coordinates });

describe('cameraTarget', () => {
  describe('constants', () => {
    it('exports the expected timing and zoom values', () => {
      expect(CAMERA_FLY_TO_DURATION_MS).toBe(500);
      expect(TRACKING_TARGET_ZOOM).toBe(18.5);
      expect(FEATURE_TARGET_FALLBACK_ZOOM).toBe(19);
      expect(FEATURE_FIT_PADDING).toEqual({ top: 80, right: 64, bottom: 260, left: 64 });
    });
  });

  describe('getFeatureBounds()', () => {
    it('returns polygon bounds for valid finite coordinates', () => {
      const feature = polygonFeature([
        [
          [127.1, 37.1],
          [127.4, 37.2],
          [127.3, 37.5],
          [127.1, 37.1],
        ],
      ]);

      expect(getFeatureBounds(feature)).toEqual([127.1, 37.1, 127.4, 37.5]);
    });

    it('returns multipolygon bounds across all rings', () => {
      const feature = multiPolygonFeature([
        [
          [
            [127.1, 37.1],
            [127.2, 37.1],
            [127.2, 37.2],
            [127.1, 37.1],
          ],
        ],
        [
          [
            [126.5, 36.7],
            [126.6, 36.7],
            [126.6, 36.8],
            [126.5, 36.7],
          ],
        ],
      ]);

      expect(getFeatureBounds(feature)).toEqual([126.5, 36.7, 127.2, 37.2]);
    });

    it('returns null for degenerate polygon bounds', () => {
      const feature = polygonFeature([
        [
          [127.1, 37.1],
          [127.1, 37.1],
          [127.1, 37.1],
        ],
      ]);

      expect(getFeatureBounds(feature)).toBeNull();
    });

    it('returns null for non-polygon geometry', () => {
      expect(getFeatureBounds(makePointFeature([127.1, 37.1]))).toBeNull();
    });

    it('returns null for non-finite polygon coordinates', () => {
      const feature = polygonFeature([
        [
          [127.1, 37.1],
          [Number.POSITIVE_INFINITY, 37.2],
          [127.3, Number.NaN],
        ],
      ]);

      expect(getFeatureBounds(feature)).toBeNull();
    });
  });

  describe('getCoordinateFlyToOptions()', () => {
    it('returns center, zoom, and duration for the provided coordinates', () => {
      const coordinates: [number, number] = [127.1234, 37.5678];

      expect(getCoordinateFlyToOptions(coordinates)).toEqual({
        center: coordinates,
        zoom: TRACKING_TARGET_ZOOM,
        duration: CAMERA_FLY_TO_DURATION_MS,
      });
    });
  });

  describe('getFeatureCameraTarget()', () => {
    it('returns a centered target for a finite point feature', () => {
      const feature = makePointFeature([127.1, 37.1]);

      expect(getFeatureCameraTarget(feature)).toEqual({
        type: 'center',
        center: [127.1, 37.1],
        zoom: FEATURE_TARGET_FALLBACK_ZOOM,
        duration: CAMERA_FLY_TO_DURATION_MS,
      });
    });

    it('returns null for a point feature with non-finite coordinates', () => {
      const feature = makePointFeature([Number.NaN, 37.1]);

      expect(getFeatureCameraTarget(feature)).toBeNull();
    });

    it('returns a bounds target for a polygon feature with valid bounds', () => {
      const feature = polygonFeature([
        [
          [127.1, 37.1],
          [127.4, 37.1],
          [127.4, 37.4],
          [127.1, 37.4],
          [127.1, 37.1],
        ],
      ]);

      expect(getFeatureCameraTarget(feature)).toEqual({
        type: 'bounds',
        bounds: [127.1, 37.1, 127.4, 37.4],
        padding: FEATURE_FIT_PADDING,
        duration: CAMERA_FLY_TO_DURATION_MS,
      });
    });

    it('falls back to centroid for a degenerate polygon with finite centroid', () => {
      const feature = polygonFeature([
        [
          [127.25, 37.55],
          [127.25, 37.55],
          [127.25, 37.55],
        ],
      ]);

      expect(getFeatureCameraTarget(feature)).toEqual({
        type: 'center',
        center: [127.25, 37.55],
        zoom: FEATURE_TARGET_FALLBACK_ZOOM,
        duration: CAMERA_FLY_TO_DURATION_MS,
      });
    });

    it('returns a bounds target for a multipolygon with valid bounds', () => {
      const feature = multiPolygonFeature([
        [
          [
            [127.1, 37.1],
            [127.2, 37.1],
            [127.2, 37.2],
            [127.1, 37.1],
          ],
        ],
        [
          [
            [126.8, 36.9],
            [126.9, 36.9],
            [126.9, 37.0],
            [126.8, 36.9],
          ],
        ],
      ]);

      expect(getFeatureCameraTarget(feature)).toEqual({
        type: 'bounds',
        bounds: [126.8, 36.9, 127.2, 37.2],
        padding: FEATURE_FIT_PADDING,
        duration: CAMERA_FLY_TO_DURATION_MS,
      });
    });

    it('falls back to centroid for a degenerate multipolygon with finite centroid', () => {
      const feature = multiPolygonFeature([
        [
          [
            [127.5, 37.6],
            [127.5, 37.6],
            [127.5, 37.6],
          ],
        ],
      ]);

      expect(getFeatureCameraTarget(feature)).toEqual({
        type: 'center',
        center: [127.5, 37.6],
        zoom: FEATURE_TARGET_FALLBACK_ZOOM,
        duration: CAMERA_FLY_TO_DURATION_MS,
      });
    });

    it('returns null for unsupported or empty geometry', () => {
      const feature = makeFeature('unsupported', {
        type: 'LineString',
        coordinates: [[127.1, 37.1], [127.2, 37.2]],
      } as unknown as CampusGeometry);

      expect(getFeatureCameraTarget(feature)).toBeNull();
    });
  });
});
