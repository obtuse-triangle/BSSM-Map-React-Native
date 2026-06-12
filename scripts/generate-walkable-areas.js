#!/usr/bin/env node
/**
 * generate-walkable-areas.js
 *
 * Build-time script that reads school-outline.json (building footprints) and
 * campus-wgs84.json (indoor features), projects to EPSG:5183, subtracts obstacle
 * polygons (classroom/room/restroom/facility/structural/unknown) from the outline,
 * and writes routing-walkable-areas.geojson as a FeatureCollection of
 * RoutingWalkableAreaFeature (WGS84).
 *
 * Usage:  node scripts/generate-walkable-areas.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const proj4 = require('proj4');
const polygonClipping = require('polygon-clipping');

// ── CRS definitions (mirrors src/utils/coordinateTransform.ts) ──────
const EPSG_5183 =
  '+proj=tmerc +lat_0=38 +lon_0=129 +k=1 +x_0=200000 +y_0=500000 +ellps=GRS80 +units=m +no_defs';
const EPSG_4326 = '+proj=longlat +datum=WGS84 +no_defs';

// ── Paths ────────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, '..', 'src', 'data');
const OUTLINE_PATH = path.join(DATA_DIR, 'school-outline.json');
const CAMPUS_PATH = path.join(DATA_DIR, 'campus-wgs84.json');
const OUTPUT_PATH = path.join(DATA_DIR, 'routing-walkable-areas.geojson');

// ── Obstacle categories (excluded from walkable area) ───────────────
// stair and elevator are NOT subtracted — they remain as connector candidates.
const OBSTACLE_CATEGORIES = new Set([
  'classroom',
  'room',
  'restroom',
  'facility',
  'structural',
  'unknown',
]);

// ── Coordinate helpers ──────────────────────────────────────────────

/** Project a single [lon, lat] to EPSG:5183 [x, y]. */
function toEpsg5183(point) {
  return proj4(EPSG_4326, EPSG_5183, [point[0], point[1]]);
}

/** Project a single [x, y] to WGS84 [lon, lat]. */
function toWgs84(point) {
  return proj4(EPSG_5183, EPSG_4326, [point[0], point[1]]);
}

/** Transform an entire ring (array of [lon, lat]) to EPSG:5183. */
function ringToEpsg5183(ring) {
  return ring.map(toEpsg5183);
}

/** Transform an entire ring (array of [x, y]) to WGS84. */
function ringToWgs84(ring) {
  return ring.map(toWgs84);
}

// ── Polygon area (planar, EPSG:5183, square metres) ─────────────────

/** Signed area of a single ring via shoelace formula. */
function ringAreaSigned(ring) {
  let area = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += ring[i][0] * ring[j][1] - ring[j][0] * ring[i][1];
  }
  return area / 2;
}

/** Area of a polygon (outer ring minus holes) in square metres. */
function polygonArea(polygon) {
  let area = ringAreaSigned(polygon[0]);
  for (let i = 1; i < polygon.length; i++) {
    area -= Math.abs(ringAreaSigned(polygon[i]));
  }
  return Math.abs(area);
}

// ── Main ─────────────────────────────────────────────────────────────

function main() {
  // 1. Read data files
  const outlineRaw = JSON.parse(fs.readFileSync(OUTLINE_PATH, 'utf8'));
  const campusRaw = JSON.parse(fs.readFileSync(CAMPUS_PATH, 'utf8'));

  console.log('school-outline.json features:', outlineRaw.features.length);
  console.log('campus-wgs84.json features:', campusRaw.features.length);

  // 2. Classify outline features by floor
  const outlineByFloor = new Map(); // floor number → features
  for (const feat of outlineRaw.features) {
    const floor = feat.properties['층수'];
    if (!outlineByFloor.has(floor)) {
      outlineByFloor.set(floor, []);
    }
    outlineByFloor.get(floor).push(feat);
  }
  console.log(
    'Outline floors:',
    [...outlineByFloor.keys()].sort().join(', '),
  );

  // 3. For each floor, compute walkable area
  const floors = [1, 2, 3, 4];
  const allFeatures = [];

  for (const floor of floors) {
    const floorOutlines = outlineByFloor.get(floor) || [];
    const outlinesToUse =
      floorOutlines.length > 0 ? floorOutlines : outlineRaw.features;

    console.log(
      `\nFloor ${floor}: ${floorOutlines.length} floor-specific / ${outlinesToUse.length} total outline features`,
    );

    // 3a. Convert all outline polygons to EPSG:5183
    const outlinePolygons = [];
    for (const feat of outlinesToUse) {
      // Each outline feature is a MultiPolygon
      for (const polygon of feat.geometry.coordinates) {
        // polygon = [outerRing, holeRing1, ...]
        const epsgPoly = polygon.map(ringToEpsg5183);
        outlinePolygons.push(epsgPoly);
      }
    }

    if (outlinePolygons.length === 0) {
      console.log(`  → No outline polygons, skipping`);
      continue;
    }

    // 3b. Merge all outline polygons into one multi-polygon
    let walkableMulti = polygonClipping.union(...outlinePolygons);

    // 3c. Get obstacle features on this floor
    const obstacles = campusRaw.features.filter(
      (f) =>
        f.properties &&
        (f.properties.level === floor) &&
        OBSTACLE_CATEGORIES.has(f.properties.category),
    );
    console.log(
      `  ${obstacles.length} obstacle features`,
    );

    // 3d. Subtract each obstacle
    let subtractedCount = 0;
    for (const obs of obstacles) {
      // Skip Point geometries (e.g. some unknown-category points)
      if (obs.geometry.type === 'Point') continue;

      // Convert obstacle geometry to polygon-clipping MultiPolygon format
      let obsMultiPoly;
      if (obs.geometry.type === 'MultiPolygon') {
        obsMultiPoly = obs.geometry.coordinates.map((poly) =>
          poly.map(ringToEpsg5183),
        );
      } else {
        // Polygon
        obsMultiPoly = [
          obs.geometry.coordinates.map(ringToEpsg5183),
        ];
      }

      // If the obstacle multi-polygon is empty, skip
      if (obsMultiPoly.length === 0) continue;

      const beforeCount = walkableMulti.length;
      walkableMulti = polygonClipping.difference(
        walkableMulti,
        obsMultiPoly,
      );
      if (walkableMulti.length !== beforeCount) {
        subtractedCount++;
      }
    }
    console.log(`  Obstacles subtracted: ${subtractedCount}`);

    // 3e. Filter slivers (< 1 m²), convert back to WGS84
    let areaFeatures = 0;
    for (const polygon of walkableMulti) {
      const area = polygonArea(polygon);
      if (area < 1.0) continue;

      const wgs84Polygon = polygon.map(ringToWgs84);
      areaFeatures++;

      // Round area to 2 decimal places
      const roundedArea = Math.round(area * 100) / 100;

      allFeatures.push({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: wgs84Polygon,
        },
        properties: {
          level: floor,
          areaSquareMeters: roundedArea,
          sourceFeatureIds: obstacles.map(
            (o) => o.properties && o.properties.id,
          ).filter(Boolean),
        },
      });
    }
    console.log(
      `  → ${areaFeatures} walkable areas (after filtering slivers < 1 m²)`,
    );
  }

  // 4. Write output
  const fc = {
    type: 'FeatureCollection',
    features: allFeatures,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(fc, null, 2));
  console.log(
    `\n✅ Wrote ${allFeatures.length} features to ${path.relative(process.cwd(), OUTPUT_PATH)}`,
  );

  // 5. Per-floor summary
  for (const floor of floors) {
    const count = allFeatures.filter(
      (f) => f.properties.level === floor,
    ).length;
    console.log(`  Floor ${floor}: ${count} walkable area(s)`);
  }
}

main();
