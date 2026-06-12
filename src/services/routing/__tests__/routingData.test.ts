/**
 * routingData.test.ts
 *
 * Jest tests that validate the integrity of committed GeoJSON routing data files.
 * These tests run at test time (not build time) and verify:
 *   - routing-walkable-areas.geojson  — Features for levels 1–4
 *   - routing-connectors.geojson       — Connectors with valid connectsLevels
 */

import fs from 'fs';
import path from 'path';

// ── Paths ────────────────────────────────────────────────────────────
const DATA_DIR = path.resolve(__dirname, '../../../../src/data');
const WALKABLE_PATH = path.join(DATA_DIR, 'routing-walkable-areas.geojson');
const CONNECTORS_PATH = path.join(DATA_DIR, 'routing-connectors.geojson');

// ── Campus data for cross-reference ──────────────────────────────────
const CAMPUS_PATH = path.join(DATA_DIR, 'campus-wgs84.json');

interface WalkableFeature {
  type: 'Feature';
  geometry: { type: 'Polygon'; coordinates: number[][][] };
  properties: {
    level: number;
    areaSquareMeters: number;
    sourceFeatureIds: string[];
  };
}

interface ConnectorFeature {
  type: 'Feature';
  id?: string;
  geometry: { type: 'Point'; coordinates: number[] };
  properties: {
    connectorType: 'stair' | 'elevator';
    connectsLevels: [number, number];
    traversalTimeSeconds: number;
    accessibilityPenalty: number;
    sourceFeatureIds: string[];
    confidence: 'auto' | 'manual';
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

function loadJSON(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function isValidWalkableFeature(v: unknown): v is WalkableFeature {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  if (obj.type !== 'Feature') return false;
  const geom = obj.geometry as Record<string, unknown> | undefined;
  if (!geom || geom.type !== 'Polygon') return false;
  if (!Array.isArray(geom.coordinates) || geom.coordinates.length === 0) return false;
  const props = obj.properties as Record<string, unknown> | undefined;
  if (!props) return false;
  if (typeof props.level !== 'number') return false;
  if (typeof props.areaSquareMeters !== 'number') return false;
  if (!Array.isArray(props.sourceFeatureIds)) return false;
  return true;
}

function isValidConnectorFeature(v: unknown): v is ConnectorFeature {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  if (obj.type !== 'Feature') return false;
  const geom = obj.geometry as Record<string, unknown> | undefined;
  if (!geom || geom.type !== 'Point') return false;
  if (!Array.isArray(geom.coordinates) || geom.coordinates.length < 2) return false;
  const props = obj.properties as Record<string, unknown> | undefined;
  if (!props) return false;
  if (props.connectorType !== 'stair' && props.connectorType !== 'elevator') return false;
  if (!Array.isArray(props.connectsLevels) || props.connectsLevels.length !== 2) return false;
  if (typeof props.traversalTimeSeconds !== 'number') return false;
  if (typeof props.accessibilityPenalty !== 'number') return false;
  if (!Array.isArray(props.sourceFeatureIds)) return false;
  if (props.confidence !== 'auto' && props.confidence !== 'manual') return false;
  return true;
}

// ── Tests ────────────────────────────────────────────────────────────

describe('routing-walkable-areas.geojson', () => {
  let featureCollection: { type: string; features: unknown[] };

  beforeAll(() => {
    const data = loadJSON(WALKABLE_PATH) as Record<string, unknown>;
    featureCollection = data as { type: string; features: unknown[] };
  });

  it('is a valid FeatureCollection', () => {
    expect(featureCollection.type).toBe('FeatureCollection');
    expect(Array.isArray(featureCollection.features)).toBe(true);
  });

  it('has features', () => {
    expect(featureCollection.features.length).toBeGreaterThan(0);
  });

  it('has features for levels 1–4', () => {
    const levelsPresent = new Set<number>();
    for (const feat of featureCollection.features) {
      expect(isValidWalkableFeature(feat)).toBe(true);
      const f = feat as WalkableFeature;
      levelsPresent.add(f.properties.level);
    }
    for (let level = 1; level <= 4; level++) {
      expect(levelsPresent.has(level)).toBe(true);
    }
  });

  it('each feature has positive areaSquareMeters', () => {
    for (const feat of featureCollection.features) {
      const f = feat as WalkableFeature;
      expect(f.properties.areaSquareMeters).toBeGreaterThan(0);
    }
  });

  it('each feature has non-empty sourceFeatureIds', () => {
    for (const feat of featureCollection.features) {
      const f = feat as WalkableFeature;
      expect(f.properties.sourceFeatureIds.length).toBeGreaterThan(0);
    }
  });

  it('all levels are in range 1–4', () => {
    for (const feat of featureCollection.features) {
      const f = feat as WalkableFeature;
      expect(f.properties.level).toBeGreaterThanOrEqual(1);
      expect(f.properties.level).toBeLessThanOrEqual(4);
    }
  });
});

describe('routing-connectors.geojson', () => {
  let featureCollection: { type: string; features: unknown[] };

  beforeAll(() => {
    const data = loadJSON(CONNECTORS_PATH) as Record<string, unknown>;
    featureCollection = data as { type: string; features: unknown[] };
  });

  it('is a valid FeatureCollection', () => {
    expect(featureCollection.type).toBe('FeatureCollection');
    expect(Array.isArray(featureCollection.features)).toBe(true);
  });

  it('has features', () => {
    expect(featureCollection.features.length).toBeGreaterThan(0);
  });

  it('all features are valid connector features', () => {
    for (const feat of featureCollection.features) {
      expect(isValidConnectorFeature(feat)).toBe(true);
    }
  });

  it('has stair and/or elevator connectors', () => {
    const types = new Set<string>();
    for (const feat of featureCollection.features) {
      const f = feat as ConnectorFeature;
      types.add(f.properties.connectorType);
    }
    // At least one stair or elevator
    expect(types.size).toBeGreaterThan(0);
    // Only valid types
    for (const t of types) {
      expect(['stair', 'elevator']).toContain(t);
    }
  });

  describe('connectsLevels validity', () => {
    it('all connectsLevels are in range 1–4', () => {
      for (const feat of featureCollection.features) {
        const f = feat as ConnectorFeature;
        const [from, to] = f.properties.connectsLevels;
        expect(from).toBeGreaterThanOrEqual(1);
        expect(from).toBeLessThanOrEqual(4);
        expect(to).toBeGreaterThanOrEqual(1);
        expect(to).toBeLessThanOrEqual(4);
      }
    });

    it('connectsLevels are integers', () => {
      for (const feat of featureCollection.features) {
        const f = feat as ConnectorFeature;
        const [from, to] = f.properties.connectsLevels;
        expect(Number.isInteger(from)).toBe(true);
        expect(Number.isInteger(to)).toBe(true);
      }
    });

    it('connectsLevels from < to (no downward connectors)', () => {
      for (const feat of featureCollection.features) {
        const f = feat as ConnectorFeature;
        const [from, to] = f.properties.connectsLevels;
        expect(from).toBeLessThan(to);
      }
    });
  });

  it('stair connectors have accessibilityPenalty 5', () => {
    for (const feat of featureCollection.features) {
      const f = feat as ConnectorFeature;
      if (f.properties.connectorType === 'stair') {
        expect(f.properties.accessibilityPenalty).toBe(5);
        expect(f.properties.traversalTimeSeconds).toBe(15);
      }
    }
  });

  it('elevator connectors have accessibilityPenalty 0', () => {
    for (const feat of featureCollection.features) {
      const f = feat as ConnectorFeature;
      if (f.properties.connectorType === 'elevator') {
        expect(f.properties.accessibilityPenalty).toBe(0);
        expect(f.properties.traversalTimeSeconds).toBe(30);
      }
    }
  });

  it('each connector has confidence "auto" or "manual"', () => {
    for (const feat of featureCollection.features) {
      const f = feat as ConnectorFeature;
      expect(['auto', 'manual']).toContain(f.properties.confidence);
    }
  });
});

describe('connector source references', () => {
  let campusFeatures: { properties: { id: string } }[];

  beforeAll(() => {
    const campus = loadJSON(CAMPUS_PATH) as { features: { properties: { id: string } }[] };
    campusFeatures = campus.features;
  });

  it('all connector sourceFeatureIds reference existing campus features', () => {
    const campusIds = new Set(campusFeatures.map((f) => f.properties.id));
    const connectors = loadJSON(CONNECTORS_PATH) as {
      features: ConnectorFeature[];
    };

    for (const feat of connectors.features) {
      for (const sourceId of feat.properties.sourceFeatureIds) {
        expect(campusIds.has(sourceId)).toBe(true);
      }
    }
  });
});
