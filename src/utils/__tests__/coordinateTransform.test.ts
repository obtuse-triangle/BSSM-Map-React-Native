import {
  EPSG_4326,
  EPSG_5183,
  transformEpsg5183ToWgs84,
  transformWgs84ToEpsg5183,
} from '../coordinateTransform';
import { BLE_AP_FIXTURES } from '../../constants/bleAccessPoints';

describe('coordinateTransform', () => {
  // ── CRS Constants ────────────────────────────────────────────────

  describe('CRS constants', () => {
    it('exports EPSG_5183 and EPSG_4326 strings', () => {
      expect(EPSG_5183).toContain('tmerc');
      expect(EPSG_4326).toContain('longlat');
    });
  });

  // ── Round-trip: EPSG:5183 → WGS84 → EPSG:5183 ───────────────────

  describe('EPSG:5183 round-trip via BLE AP fixtures', () => {
    const apFixtures = [
      BLE_AP_FIXTURES[0],  // MA-1F-A06
      BLE_AP_FIXTURES[7],  // M-1F-A07 (different floor region)
      BLE_AP_FIXTURES[5],  // MA-1F-A01 (different x range)
    ];

    it.each(apFixtures)('round-trips $id', ({ id, x5183, y5183 }) => {
      // EPSG:5183 → WGS84
      const [lon, lat] = transformEpsg5183ToWgs84(x5183, y5183);

      // WGS84 → EPSG:5183
      const [x2, y2] = transformWgs84ToEpsg5183(lon, lat);

      // Should return to within 0.01 m of the original
      expect(x2).toBeCloseTo(x5183, 2);
      expect(y2).toBeCloseTo(y5183, 2);
    });
  });

  // ── Round-trip: WGS84 → EPSG:5183 → WGS84 ───────────────────────

  describe('WGS84 round-trip', () => {
    // Derive WGS84 starting points from known EPSG:5183 AP coordinates.
    // This tests mathematical invertibility, not absolute accuracy.
    const wgs84Points = [
      transformEpsg5183ToWgs84(
        BLE_AP_FIXTURES[0].x5183,
        BLE_AP_FIXTURES[0].y5183,
      ),
      transformEpsg5183ToWgs84(
        BLE_AP_FIXTURES[10].x5183,
        BLE_AP_FIXTURES[10].y5183,
      ),
      transformEpsg5183ToWgs84(
        BLE_AP_FIXTURES[BLE_AP_FIXTURES.length - 1].x5183,
        BLE_AP_FIXTURES[BLE_AP_FIXTURES.length - 1].y5183,
      ),
    ];

    it.each(wgs84Points)('round-trips WGS84 [%d, %d]', (lon, lat) => {
      // WGS84 → EPSG:5183
      const [x, y] = transformWgs84ToEpsg5183(lon, lat);

      // EPSG:5183 → WGS84
      const [lon2, lat2] = transformEpsg5183ToWgs84(x, y);

      // Should return to within 1e-8 degrees of the original
      expect(lon2).toBeCloseTo(lon, 8);
      expect(lat2).toBeCloseTo(lat, 8);
    });
  });

  // ── Invalid Input Guards ─────────────────────────────────────────

  describe('invalid input guards', () => {
    const invalidCases: [string, number, number][] = [
      ['NaN input', Number.NaN, 0],
      ['Infinity input', Number.POSITIVE_INFINITY, 0],
      ['-Infinity input', Number.NEGATIVE_INFINITY, 0],
    ];

    describe('transformEpsg5183ToWgs84', () => {
      it.each(invalidCases)('throws for %s', (_, x, y) => {
        expect(() => transformEpsg5183ToWgs84(x, y)).toThrow(
          /CoordinateTransform/,
        );
      });
    });

    describe('transformWgs84ToEpsg5183', () => {
      it.each(invalidCases)('throws for %s', (_, lon, lat) => {
        expect(() => transformWgs84ToEpsg5183(lon, lat)).toThrow(
          /CoordinateTransform/,
        );
      });
    });
  });
});
