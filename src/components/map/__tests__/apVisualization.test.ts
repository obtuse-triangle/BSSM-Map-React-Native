import {
  filterApsForLevel,
  normalizeWeightPercent,
  getApCircleRadius,
  getApCircleColor,
  buildApVisualizationGeoJson,
  AP_VISUALIZATION,
} from '../apVisualization';
import { BLE_AP_FIXTURES } from '../../../constants/bleAccessPoints';
import type { BleApContribution } from '../../../services/location/bleWeightedCentroid';

describe('AP visualization helpers', () => {
  // ── filterApsForLevel ──────────────────────────────────────────────

  describe('filterApsForLevel', () => {
    it('returns 14 APs for floor 1', () => {
      const result = filterApsForLevel(BLE_AP_FIXTURES, 1);
      expect(result).toHaveLength(14);
    });

    it('returns 48 APs for floor 3', () => {
      const result = filterApsForLevel(BLE_AP_FIXTURES, 3);
      expect(result).toHaveLength(48);
    });

    it('returns empty array for floor 2 without throwing', () => {
      const result = filterApsForLevel(BLE_AP_FIXTURES, 2);
      expect(result).toEqual([]);
    });

    it('returns empty array for floor 4 without throwing', () => {
      const result = filterApsForLevel(BLE_AP_FIXTURES, 4);
      expect(result).toEqual([]);
    });

    it('normalises number floor level to string for comparison', () => {
      const result = filterApsForLevel(BLE_AP_FIXTURES, 1);
      expect(result.length).toBeGreaterThan(0);
      for (const ap of result) {
        expect(ap.floorKey).toBe('1');
      }
    });
  });

  // ── normalizeWeightPercent ──────────────────────────────────────────

  describe('normalizeWeightPercent', () => {
    it('returns 0 for undefined', () => {
      expect(normalizeWeightPercent(undefined)).toBe(0);
    });

    it('returns 0 for 0', () => {
      expect(normalizeWeightPercent(0)).toBe(0);
    });

    it('returns 1 for 1', () => {
      expect(normalizeWeightPercent(1)).toBe(1);
    });

    it('returns 50 for 50', () => {
      expect(normalizeWeightPercent(50)).toBe(50);
    });

    it('returns 99 for 99', () => {
      expect(normalizeWeightPercent(99)).toBe(99);
    });

    it('returns 100 for 100', () => {
      expect(normalizeWeightPercent(100)).toBe(100);
    });

    it('clamps negative values to 0', () => {
      expect(normalizeWeightPercent(-10)).toBe(0);
      expect(normalizeWeightPercent(-0.5)).toBe(0);
    });

    it('clamps values above 100 to 100', () => {
      expect(normalizeWeightPercent(150)).toBe(100);
      expect(normalizeWeightPercent(999)).toBe(100);
    });
  });

  // ── getApCircleRadius ───────────────────────────────────────────────

  describe('getApCircleRadius', () => {
    it('returns 6 for 0% weight', () => {
      expect(getApCircleRadius(0)).toBe(AP_VISUALIZATION.contributorMinRadius);
    });

    it('returns 18 for 100% weight', () => {
      expect(getApCircleRadius(100)).toBe(AP_VISUALIZATION.contributorMaxRadius);
    });

    it('interpolates linearly at 50%', () => {
      // (6 + 18) / 2 = 12
      expect(getApCircleRadius(50)).toBe(12);
    });

    it('clamps weight below 0 to 0% radius', () => {
      expect(getApCircleRadius(-50)).toBe(AP_VISUALIZATION.contributorMinRadius);
    });

    it('clamps weight above 100 to 100% radius', () => {
      expect(getApCircleRadius(200)).toBe(AP_VISUALIZATION.contributorMaxRadius);
    });
  });

  // ── getApCircleColor ────────────────────────────────────────────────

  describe('getApCircleColor', () => {
    it('returns low weight color (#64b5f6) for 0%', () => {
      expect(getApCircleColor(0)).toBe('#64b5f6');
    });

    it('returns high weight color (#ff6b35) for 100%', () => {
      expect(getApCircleColor(100)).toBe('#ff6b35');
    });
  });

  // ── buildApVisualizationGeoJson ─────────────────────────────────────

  describe('buildApVisualizationGeoJson', () => {
    it('returns 14 features for floor 1 with undefined contributions', () => {
      const result = buildApVisualizationGeoJson({
        fixtures: BLE_AP_FIXTURES,
        contributions: undefined,
        selectedLevel: 1,
      });

      expect(result.type).toBe('FeatureCollection');
      expect(result.features).toHaveLength(14);
    });

    it('marks all features as non-contributor when no contributions provided', () => {
      const result = buildApVisualizationGeoJson({
        fixtures: BLE_AP_FIXTURES,
        contributions: undefined,
        selectedLevel: 1,
      });

      for (const feature of result.features) {
        expect(feature.properties.isContributor).toBe(false);
        expect(feature.properties.weightPercent).toBe(0);
        expect(feature.properties.rssi).toBeNull();
        expect(feature.properties.circleRadius).toBe(AP_VISUALIZATION.baselineRadius);
        expect(feature.properties.circleColor).toBe(AP_VISUALIZATION.dimmedColor);
        expect(feature.properties.circleOpacity).toBe(AP_VISUALIZATION.baselineOpacity);
      }
    });

    it('skips unknown contribution IDs silently (no crash, no phantom features)', () => {
      const unknownContributions: BleApContribution[] = [
        {
          id: 'NONEXISTENT-1',
          label: 'Ghost AP',
          floorKey: '1',
          rssi: -70,
          weight: 0.5,
          weightPercent: 50,
        },
        {
          id: 'NONEXISTENT-2',
          label: 'Phantom AP',
          floorKey: '1',
          rssi: -80,
          weight: 0.2,
          weightPercent: 20,
        },
      ];

      const result = buildApVisualizationGeoJson({
        fixtures: BLE_AP_FIXTURES,
        contributions: unknownContributions,
        selectedLevel: 1,
      });

      // Should still have 14 features (no extras from unknown IDs)
      expect(result.features).toHaveLength(14);

      // All features should be non-contributors since unknown IDs don't match
      for (const feature of result.features) {
        expect(feature.properties.isContributor).toBe(false);
      }
    });

    it('applies contributor properties when contribution exists', () => {
      const contributions: BleApContribution[] = [
        {
          id: 'MA-1F-A06',
          label: 'MA-1F-A06',
          floorKey: '1',
          rssi: -65,
          weight: 0.8,
          weightPercent: 40,
        },
      ];

      const result = buildApVisualizationGeoJson({
        fixtures: BLE_AP_FIXTURES,
        contributions,
        selectedLevel: 1,
      });

      // Find the contributor feature
      const contributorFeature = result.features.find(
        (f) => f.properties.label === 'MA-1F-A06',
      );
      expect(contributorFeature).toBeDefined();
      expect(contributorFeature!.properties.isContributor).toBe(true);
      expect(contributorFeature!.properties.rssi).toBe(-65);
      expect(contributorFeature!.properties.weightPercent).toBe(40);
      expect(contributorFeature!.properties.circleRadius).toBe(getApCircleRadius(40));
      expect(contributorFeature!.properties.circleColor).toBe(getApCircleColor(40));
      expect(contributorFeature!.properties.circleOpacity).toBe(
        AP_VISUALIZATION.contributorOpacity,
      );

      // Other features should be non-contributors
      const nonContributorFeatures = result.features.filter(
        (f) => f.properties.label !== 'MA-1F-A06',
      );
      for (const feature of nonContributorFeatures) {
        expect(feature.properties.isContributor).toBe(false);
      }
    });

    it('produces valid GeoJSON structure for each feature', () => {
      const result = buildApVisualizationGeoJson({
        fixtures: BLE_AP_FIXTURES,
        contributions: undefined,
        selectedLevel: 1,
      });

      for (const feature of result.features) {
        expect(feature.type).toBe('Feature');
        expect(feature.geometry.type).toBe('Point');
        expect(Array.isArray(feature.geometry.coordinates)).toBe(true);
        expect(feature.geometry.coordinates).toHaveLength(2);
        // Coordinates should be valid numbers (longitude, latitude)
        expect(typeof feature.geometry.coordinates[0]).toBe('number');
        expect(typeof feature.geometry.coordinates[1]).toBe('number');
        // Longitude should be in valid range
        expect(feature.geometry.coordinates[0]).toBeGreaterThanOrEqual(-180);
        expect(feature.geometry.coordinates[0]).toBeLessThanOrEqual(180);
        // Latitude should be in valid range
        expect(feature.geometry.coordinates[1]).toBeGreaterThanOrEqual(-90);
        expect(feature.geometry.coordinates[1]).toBeLessThanOrEqual(90);
      }
    });

    it('handles empty contributions array gracefully', () => {
      const result = buildApVisualizationGeoJson({
        fixtures: BLE_AP_FIXTURES,
        contributions: [],
        selectedLevel: 1,
      });

      expect(result.features).toHaveLength(14);
      for (const feature of result.features) {
        expect(feature.properties.isContributor).toBe(false);
      }
    });

    it('returns correct number of features per floor', () => {
      const floor1 = buildApVisualizationGeoJson({
        fixtures: BLE_AP_FIXTURES,
        selectedLevel: 1,
      });
      const floor3 = buildApVisualizationGeoJson({
        fixtures: BLE_AP_FIXTURES,
        selectedLevel: 3,
      });
      const floor2 = buildApVisualizationGeoJson({
        fixtures: BLE_AP_FIXTURES,
        selectedLevel: 2,
      });

      expect(floor1.features).toHaveLength(14);
      expect(floor3.features).toHaveLength(48);
      expect(floor2.features).toHaveLength(0);
    });

    it('includes label property from fixture in GeoJSON feature', () => {
      const result = buildApVisualizationGeoJson({
        fixtures: BLE_AP_FIXTURES,
        selectedLevel: 1,
      });

      const labels = result.features.map((f) => f.properties.label);
      expect(labels).toContain('MA-1F-A06');
      expect(labels).toContain('MA-1F-A01');
      expect(labels).toContain('D-1F-A01');
    });
  });
});
