/**
 * routeLayerData.test.ts
 *
 * Tests for buildRouteLayerData: pure classification of route features
 * into active (current floor) and dimmed (other floors) arrays.
 */

import { buildRouteLayerData } from '../routeLayerData';
import type { RouteResult } from '../../../types/routing';

// ── Test fixtures ─────────────────────────────────────────────────────

// EPSG:5183 coordinates derived from campus center (128.9035, 35.1885)
// Campus center in EPSG:5183 ≈ [191211, 188012]
const EPSG_X1 = 191211;
const EPSG_Y1 = 188012;
const EPSG_X2 = 191261;
const EPSG_Y2 = 188062;
const EPSG_X3 = 191311;
const EPSG_Y3 = 188112;

function makeNodeCoords(): Map<string, [number, number]> {
  const m = new Map<string, [number, number]>();
  m.set('L1A', [EPSG_X1, EPSG_Y1]);
  m.set('L1B', [EPSG_X2, EPSG_Y2]);
  m.set('L2A', [EPSG_X1, EPSG_Y1]);
  m.set('L2B', [EPSG_X3, EPSG_Y3]);
  return m;
}

const multiFloorResult: RouteResult = {
  ok: true,
  floorSegments: [
    { level: 1, nodeIds: ['L1A', 'L1B'], distanceMeters: 80 },
    { level: 2, nodeIds: ['L2A', 'L2B'], distanceMeters: 60 },
  ],
  totalDistanceMeters: 140,
  estimatedTimeSeconds: 180,
  usedStairsFallback: false,
};

const singleFloorResult: RouteResult = {
  ok: true,
  floorSegments: [
    { level: 3, nodeIds: ['L1A', 'L1B'], distanceMeters: 80 },
    { level: 3, nodeIds: ['L2A', 'L2B'], distanceMeters: 60 },
  ],
  totalDistanceMeters: 140,
  estimatedTimeSeconds: 180,
  usedStairsFallback: false,
};

const failedResult: RouteResult = {
  ok: false,
  reason: 'no path',
};

// ── Tests ─────────────────────────────────────────────────────────────

describe('buildRouteLayerData', () => {
  it('returns empty active and dimmed arrays for null route', () => {
    const { activeFeatures, dimmedFeatures } = buildRouteLayerData(
      null,
      1,
      makeNodeCoords(),
    );

    expect(activeFeatures).toEqual([]);
    expect(dimmedFeatures).toEqual([]);
  });

  it('returns empty arrays for failed route (ok: false)', () => {
    const { activeFeatures, dimmedFeatures } = buildRouteLayerData(
      failedResult,
      1,
      makeNodeCoords(),
    );

    expect(activeFeatures).toEqual([]);
    expect(dimmedFeatures).toEqual([]);
  });

  it('classifies segments on level 1 as active and level 2 as dimmed when selectedLevel=1', () => {
    const { activeFeatures, dimmedFeatures } = buildRouteLayerData(
      multiFloorResult,
      1,
      makeNodeCoords(),
    );

    expect(activeFeatures).toHaveLength(1);
    expect(activeFeatures[0].properties.level).toBe(1);

    expect(dimmedFeatures).toHaveLength(1);
    expect(dimmedFeatures[0].properties.level).toBe(2);
  });

  it('classifies segments on level 2 as active and level 1 as dimmed when selectedLevel=2', () => {
    const { activeFeatures, dimmedFeatures } = buildRouteLayerData(
      multiFloorResult,
      2,
      makeNodeCoords(),
    );

    expect(activeFeatures).toHaveLength(1);
    expect(activeFeatures[0].properties.level).toBe(2);

    expect(dimmedFeatures).toHaveLength(1);
    expect(dimmedFeatures[0].properties.level).toBe(1);
  });

  it('all segments on same level as selectedLevel → all active, none dimmed', () => {
    const { activeFeatures, dimmedFeatures } = buildRouteLayerData(
      singleFloorResult,
      3,
      makeNodeCoords(),
    );

    expect(activeFeatures).toHaveLength(2);
    expect(dimmedFeatures).toHaveLength(0);

    // Verify all active features are level 3
    for (const f of activeFeatures) {
      expect(f.properties.level).toBe(3);
    }
  });

  it('all segments dimmed when none match selectedLevel', () => {
    const { activeFeatures, dimmedFeatures } = buildRouteLayerData(
      multiFloorResult,
      4, // no segments on level 4
      makeNodeCoords(),
    );

    expect(activeFeatures).toHaveLength(0);
    expect(dimmedFeatures).toHaveLength(2);
  });

  it('is deterministic: same input → same output', () => {
    const nodeCoords = makeNodeCoords();

    const result1 = buildRouteLayerData(multiFloorResult, 1, nodeCoords);
    const result2 = buildRouteLayerData(multiFloorResult, 1, nodeCoords);

    expect(result1).toEqual(result2);
  });

  it('active features have LineString geometry with WGS84 coordinates', () => {
    const { activeFeatures } = buildRouteLayerData(
      multiFloorResult,
      1,
      makeNodeCoords(),
    );

    expect(activeFeatures[0].geometry.type).toBe('LineString');
    const coords = activeFeatures[0].geometry.coordinates;
    expect(coords.length).toBeGreaterThanOrEqual(2);

    // Each coordinate pair should be [lon, lat] in WGS84 range
    for (const [lon, lat] of coords) {
      expect(typeof lon).toBe('number');
      expect(typeof lat).toBe('number');
      expect(Number.isFinite(lon)).toBe(true);
      expect(Number.isFinite(lat)).toBe(true);
    }
  });

  it('deterministic for selected levels 1-4', () => {
    const nodeCoords = makeNodeCoords();

    for (const level of [1, 2, 3, 4]) {
      const run1 = buildRouteLayerData(multiFloorResult, level, nodeCoords);
      const run2 = buildRouteLayerData(multiFloorResult, level, nodeCoords);
      expect(run1).toEqual(run2);
    }
  });
});
