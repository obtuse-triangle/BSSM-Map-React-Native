type Position = [number, number];
type Ring = Position[];
type PolygonCoordinates = Ring[];

type FeatureProperties = {
  name: string;
  name_ko: string;
  level: number | string;
  level_id: number | string;
  building_id: number | string;
  category: string;
  interactive: boolean;
  source: string;
};

type GeoJSONFeature = {
  type: 'Feature';
  properties: FeatureProperties;
  geometry: {
    type: 'Polygon';
    coordinates: PolygonCoordinates;
  };
};

type GeoJSONFeatureCollection = {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
};

const EXPECTED_FEATURE_COUNT = 386;
const EXPECTED_LEVEL_DISTRIBUTION: Record<string, number> = {
  '1': 119,
  '2': 110,
  '3': 100,
  '4': 57,
};

const REQUIRED_PROPERTIES: Array<keyof FeatureProperties> = [
  'name',
  'name_ko',
  'level',
  'level_id',
  'building_id',
  'category',
  'interactive',
  'source',
];

const MIN_LON = 128.9027;
const MAX_LON = 128.9042;
const MIN_LAT = 35.1875;
const MAX_LAT = 35.1894;

function fail(message: string): never {
  throw new Error(message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPosition(value: unknown): value is Position {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

function isRing(value: unknown): value is Ring {
  return Array.isArray(value) && value.length >= 4 && value.every(isPosition);
}

function isPolygonCoordinates(value: unknown): value is PolygonCoordinates {
  return Array.isArray(value) && value.length > 0 && value.every(isRing);
}

function validateClosedRing(ring: Ring, featureIndex: number, ringIndex: number): void {
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    fail(`Feature ${featureIndex} ring ${ringIndex} is not closed`);
  }
}

function validateCoordinates(
  coordinates: PolygonCoordinates,
  featureIndex: number,
  bounds: { minLon: number; maxLon: number; minLat: number; maxLat: number },
): void {
  for (let ringIndex = 0; ringIndex < coordinates.length; ringIndex += 1) {
    const ring = coordinates[ringIndex];
    validateClosedRing(ring, featureIndex, ringIndex);

    for (const [lon, lat] of ring) {
      if (lon < bounds.minLon || lon > bounds.maxLon || lat < bounds.minLat || lat > bounds.maxLat) {
        fail(
          `Feature ${featureIndex} has coordinate outside expected bounds: [` +
            `${lon}, ${lat}]`,
        );
      }
    }
  }
}

export function validateCampusGeoJSON(data: unknown): GeoJSONFeatureCollection {
  if (!isObject(data)) {
    fail('GeoJSON root must be an object');
  }

  if (data.type !== 'FeatureCollection') {
    fail(`Expected FeatureCollection, got ${String(data.type)}`);
  }

  if (!Array.isArray(data.features)) {
    fail('GeoJSON features must be an array');
  }

  if (data.features.length !== EXPECTED_FEATURE_COUNT) {
    fail(`Expected ${EXPECTED_FEATURE_COUNT} features, got ${data.features.length}`);
  }

  const levelCounts: Record<string, number> = {};
  let minLon = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  data.features.forEach((feature: unknown, featureIndex: number) => {
    if (!isObject(feature)) {
      fail(`Feature ${featureIndex} must be an object`);
    }

    if (feature.type !== 'Feature') {
      fail(`Feature ${featureIndex} must have type Feature`);
    }

    if (!isObject(feature.properties)) {
      fail(`Feature ${featureIndex} properties must be an object`);
    }

    for (const key of REQUIRED_PROPERTIES) {
      if (!(key in feature.properties)) {
        fail(`Feature ${featureIndex} missing required property ${key}`);
      }
    }

    const properties = feature.properties as Partial<FeatureProperties>;

    if (typeof properties.interactive !== 'boolean') {
      fail(`Feature ${featureIndex} property interactive must be boolean`);
    }

    if (!isObject(feature.geometry)) {
      fail(`Feature ${featureIndex} geometry must be an object`);
    }

    if (feature.geometry.type !== 'Polygon') {
      fail(`Feature ${featureIndex} geometry type must be Polygon`);
    }

    if (!isPolygonCoordinates(feature.geometry.coordinates)) {
      fail(`Feature ${featureIndex} coordinates must be valid polygon rings`);
    }

    validateCoordinates(feature.geometry.coordinates, featureIndex, {
      minLon: MIN_LON,
      maxLon: MAX_LON,
      minLat: MIN_LAT,
      maxLat: MAX_LAT,
    });

    const levelKey = String(properties.level);
    levelCounts[levelKey] = (levelCounts[levelKey] ?? 0) + 1;

    for (const ring of feature.geometry.coordinates) {
      for (const [lon, lat] of ring) {
        minLon = Math.min(minLon, lon);
        maxLon = Math.max(maxLon, lon);
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
      }
    }
  });

  for (const [level, expectedCount] of Object.entries(EXPECTED_LEVEL_DISTRIBUTION)) {
    const actualCount = levelCounts[level] ?? 0;
    if (actualCount !== expectedCount) {
      fail(`Expected ${expectedCount} features for level ${level}, got ${actualCount}`);
    }
  }

  if (minLon < MIN_LON || maxLon > MAX_LON || minLat < MIN_LAT || maxLat > MAX_LAT) {
    fail(
      `Bounds out of range: lon ${minLon}..${maxLon}, lat ${minLat}..${maxLat}`,
    );
  }

  return data as GeoJSONFeatureCollection;
}
