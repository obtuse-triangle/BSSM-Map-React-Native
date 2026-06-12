/**
 * routeGeoJson.test.ts
 *
 * Tests for routeResultToGeoJson: converts RouteResult floor segments
 * into WGS84 GeoJSON FeatureCollection with LineString features.
 */

import { routeResultToGeoJson } from '../routeGeoJson';
import type { RouteResult } from '../../../types/routing';

// ── Campus coordinate range (WGS84) ──────────────────────────────────
// From learnings: CAMPUS_BOUNDS = [128.9028, 35.1876, 128.9041, 35.1893]
const CAMPUS_LON_MIN = 128.90;
const CAMPUS_LON_MAX = 128.91;
const CAMPUS_LAT_MIN = 35.18;
const CAMPUS_LAT_MAX = 35.19;

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
  m.set('n1', [EPSG_X1, EPSG_Y1]);
  m.set('n2', [EPSG_X2, EPSG_Y2]);
  m.set('n3', [EPSG_X3, EPSG_Y3]);
  m.set('n4', [EPSG_X1 + 50, EPSG_Y1 + 50]);
  m.set('n5', [EPSG_X2 + 50, EPSG_Y2 + 50]);
  return m;
}

const successResult: RouteResult = {
  ok: true,
  floorSegments: [
    {
      level: 1,
      nodeIds: ['n1', 'n2', 'n3'],
      distanceMeters: 100,
    },
    {
      level: 2,
      nodeIds: ['n4', 'n5'],
      distanceMeters: 70,
    },
  ],
  totalDistanceMeters: 170,
  estimatedTimeSeconds: 200,
  usedStairsFallback: false,
};

const failedResult: RouteResult = {
  ok: false,
  reason: 'no path',
};

// ── Tests ─────────────────────────────────────────────────────────────

describe('routeResultToGeoJson', () => {
  it('returns FeatureCollection with correct number of LineString features for valid result', () => {
    const nodeCoords = makeNodeCoords();
    const geoJson = routeResultToGeoJson(successResult, nodeCoords);

    expect(geoJson.type).toBe('FeatureCollection');
    expect(geoJson.features).toHaveLength(2);
    expect(geoJson.features[0].geometry.type).toBe('LineString');
    expect(geoJson.features[1].geometry.type).toBe('LineString');
  });

  it('projects EPSG:5183 coordinates to WGS84 within campus bounds', () => {
    const nodeCoords = makeNodeCoords();
    const geoJson = routeResultToGeoJson(successResult, nodeCoords);

    for (const feature of geoJson.features) {
      for (const [lon, lat] of feature.geometry.coordinates) {
        expect(lon).toBeGreaterThan(CAMPUS_LON_MIN);
        expect(lon).toBeLessThan(CAMPUS_LON_MAX);
        expect(lat).toBeGreaterThan(CAMPUS_LAT_MIN);
        expect(lat).toBeLessThan(CAMPUS_LAT_MAX);
      }
    }
  });

  it('each feature has required properties (level, segmentType, segmentIndex)', () => {
    const nodeCoords = makeNodeCoords();
    const geoJson = routeResultToGeoJson(successResult, nodeCoords);

    expect(geoJson.features[0].properties).toEqual({
      level: 1,
      segmentType: 'walk',
      segmentIndex: 0,
    });

    expect(geoJson.features[1].properties).toEqual({
      level: 2,
      segmentType: 'walk',
      segmentIndex: 1,
    });
  });

  it('LineString coordinates match the node count (3 nodes → 3 coords)', () => {
    const nodeCoords = makeNodeCoords();
    const geoJson = routeResultToGeoJson(successResult, nodeCoords);

    // Segment 0: n1, n2, n3 → 3 coordinate pairs
    expect(geoJson.features[0].geometry.coordinates).toHaveLength(3);
    // Segment 1: n4, n5 → 2 coordinate pairs
    expect(geoJson.features[1].geometry.coordinates).toHaveLength(2);
  });

  it('returns empty FeatureCollection for failed route (ok: false)', () => {
    const nodeCoords = makeNodeCoords();
    const geoJson = routeResultToGeoJson(failedResult, nodeCoords);

    expect(geoJson.type).toBe('FeatureCollection');
    expect(geoJson.features).toHaveLength(0);
  });

  it('skips segments with unresolvable nodeIds', () => {
    const resultWithMissing: RouteResult = {
      ok: true,
      floorSegments: [
        { level: 1, nodeIds: ['n1', 'n2'], distanceMeters: 50 },
        { level: 1, nodeIds: ['n_missing', 'n_also_missing'], distanceMeters: 50 },
      ],
      totalDistanceMeters: 100,
      estimatedTimeSeconds: 120,
      usedStairsFallback: false,
    };

    const nodeCoords = makeNodeCoords();
    const geoJson = routeResultToGeoJson(resultWithMissing, nodeCoords);

    // Only first segment (with valid nodes) should appear
    expect(geoJson.features).toHaveLength(1);
    expect(geoJson.features[0].properties.segmentIndex).toBe(0);
  });

  it('skips segments with fewer than 2 resolved nodes', () => {
    const resultOneNode: RouteResult = {
      ok: true,
      floorSegments: [
        { level: 1, nodeIds: ['n1'], distanceMeters: 0 },
      ],
      totalDistanceMeters: 0,
      estimatedTimeSeconds: 0,
      usedStairsFallback: false,
    };

    const nodeCoords = makeNodeCoords();
    const geoJson = routeResultToGeoJson(resultOneNode, nodeCoords);

    expect(geoJson.features).toHaveLength(0);
  });
});
