import { BLE_AP_FIXTURES } from '../../constants/bleAccessPoints';
import type { BleAccessPoint5183 } from '../../types/bleAccessPoint';
import { transformEpsg5183ToWgs84 } from '../../utils/coordinateTransform';
import type { BleApContribution } from '../../services/location/bleWeightedCentroid';

// ── Constants ────────────────────────────────────────────────────────────────

export const AP_VISUALIZATION = {
  baselineRadius: 4,
  contributorMinRadius: 6,
  contributorMaxRadius: 18,
  dimmedColor: '#7A8A99',
  lowWeightColor: '#64B5F6',
  highWeightColor: '#FF6B35',
  baselineOpacity: 0.35,
  contributorOpacity: 0.9,
} as const;

// ── Types ────────────────────────────────────────────────────────────────────

export interface ApVisualizationInput {
  fixtures: readonly BleAccessPoint5183[];
  contributions?: readonly BleApContribution[] | undefined;
  selectedLevel: number;
}

/** Minimal GeoJSON types — avoids external @types/geojson dependency. */
export interface ApGeoJsonPointGeometry {
  type: 'Point';
  coordinates: [number, number];
}

export interface ApGeoJsonFeature {
  type: 'Feature';
  geometry: ApGeoJsonPointGeometry;
  properties: {
    isContributor: boolean;
    weightPercent: number;
    rssi: number | null;
    label: string;
    circleRadius: number;
    circleColor: string;
    circleOpacity: number;
  };
}

export interface ApGeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: ApGeoJsonFeature[];
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Interpolate between two hex colors.
 *
 * @param low  - Hex colour at t = 0 (e.g. '#64B5F6')
 * @param high - Hex colour at t = 1 (e.g. '#FF6B35')
 * @param t    - Interpolation factor clamped to [0, 1]
 * @returns    - Interpolated hex colour string
 */
function interpolateHexColor(low: string, high: string, t: number): string {
  const parseHex = (h: string) => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
  const [r1, g1, b1] = parseHex(low);
  const [r2, g2, b2] = parseHex(high);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// ── Public helpers ───────────────────────────────────────────────────────────

/**
 * Filter BLE AP fixtures to those on the selected floor level.
 * `selectedLevel` is normalised to string to match the string `floorKey`.
 */
export function filterApsForLevel(
  aps: readonly BleAccessPoint5183[],
  selectedLevel: number,
): BleAccessPoint5183[] {
  return aps.filter((ap) => ap.floorKey === String(selectedLevel));
}

/**
 * Normalise a weight-percent value: undefined → 0, clamped to [0, 100].
 */
export function normalizeWeightPercent(value: number | undefined): number {
  if (value === undefined) return 0;
  return Math.max(0, Math.min(100, value));
}

/**
 * Compute the circle radius for a contributor AP based on its weight percent.
 *
 * Linearly interpolates between `contributorMinRadius` (6 px at 0 %) and
 * `contributorMaxRadius` (18 px at 100 %).
 */
export function getApCircleRadius(weightPercent: number): number {
  const t = Math.max(0, Math.min(100, weightPercent)) / 100;
  return (
    AP_VISUALIZATION.contributorMinRadius +
    (AP_VISUALIZATION.contributorMaxRadius - AP_VISUALIZATION.contributorMinRadius) * t
  );
}

/**
 * Compute the circle fill colour for a contributor AP based on its weight percent.
 *
 * Interpolates between `lowWeightColor` (#64B5F6 at 0 %) and
 * `highWeightColor` (#FF6B35 at 100 %).
 */
export function getApCircleColor(weightPercent: number): string {
  const t = Math.max(0, Math.min(100, weightPercent)) / 100;
  return interpolateHexColor(AP_VISUALIZATION.lowWeightColor, AP_VISUALIZATION.highWeightColor, t);
}

// ── GeoJSON builder ─────────────────────────────────────────────────────────

/**
 * Build a GeoJSON FeatureCollection from BLE AP fixtures and optional
 * weighted-centroid contributions.
 *
 * Each fixture on the selected floor is converted to a GeoJSON Point
 * feature with visualisation properties for map rendering.
 */
export function buildApVisualizationGeoJson(
  input: ApVisualizationInput,
): ApGeoJsonFeatureCollection {
  const { fixtures, contributions, selectedLevel } = input;

  const contribMap = new Map<string, BleApContribution>();
  if (contributions) {
    for (const c of contributions) {
      contribMap.set(c.id, c);
    }
  }

  const floorFixtures = fixtures.filter((f) => f.floorKey === String(selectedLevel));

  const features: ApGeoJsonFeature[] = floorFixtures.map((fixture) => {
      const [lng, lat] = transformEpsg5183ToWgs84(fixture.x5183, fixture.y5183);
      const contribution = contribMap.get(fixture.id);
      const isContributor = contribution !== undefined;
      const weightPercent = isContributor
        ? normalizeWeightPercent(contribution!.weightPercent)
        : 0;

      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [lng, lat],
        },
        properties: {
          isContributor,
          weightPercent,
          rssi: isContributor ? contribution!.rssi : null,
          label: fixture.label,
          circleRadius: isContributor
            ? getApCircleRadius(weightPercent)
            : AP_VISUALIZATION.baselineRadius,
          circleColor: isContributor
            ? getApCircleColor(weightPercent)
            : AP_VISUALIZATION.dimmedColor,
          circleOpacity: isContributor
            ? AP_VISUALIZATION.contributorOpacity
            : AP_VISUALIZATION.baselineOpacity,
        },
      };
    });

  return {
    type: 'FeatureCollection',
    features,
  };
}
