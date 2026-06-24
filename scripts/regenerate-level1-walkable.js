#!/usr/bin/env node
/**
 * regenerate-level1-walkable.js
 *
 * Bug fix: scripts/generate-walkable-areas.js filters outline features by
 *   feat.properties['층수'] === floor
 * which excludes the main building (본관) from Level 1 walkable area because
 * the main building's outline has 층수 === 3 (it's a 3-story building), not 1.
 *
 * This script regenerates ONLY Level 1 polygons in
 * src/data/routing-walkable-areas.geojson while preserving Level 2/3/4
 * features (which the user manually edited in QGIS).
 *
 * Differences from generate-walkable-areas.js:
 *  - For Level 1, uses ALL 18 outline features (the entire school footprint),
 *    not just the 16 features with 층수 === 1.
 *  - Uses a more lenient sliver filter (0.5 m²) to keep small but valid
 *    walkable polygons (e.g. corridors between close obstacles).
 *  - Reads the existing routing file and merges new L1 with preserved L2/3/4.
 *
 * Usage:  node scripts/regenerate-level1-walkable.js
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
const OBSTACLE_CATEGORIES = new Set([
  'classroom',
  'room',
  'restroom',
  'facility',
  'structural',
  'unknown',
]);

// Level we are regenerating. Other levels are preserved verbatim.
const REGEN_LEVEL = 1;

// Sliver filter: original script used 1.0 m². We relax to 0.5 m² so that
// small but valid walkable pockets (e.g. narrow corridors) are kept.
const SLIVER_THRESHOLD_M2 = 0.5;

// ── Coordinate helpers ──────────────────────────────────────────────

function toEpsg5183(point) {
  return proj4(EPSG_4326, EPSG_5183, [point[0], point[1]]);
}

function toWgs84(point) {
  return proj4(EPSG_5183, EPSG_4326, [point[0], point[1]]);
}

function ringToEpsg5183(ring) {
  return ring.map(toEpsg5183);
}

function ringToWgs84(ring) {
  return ring.map(toWgs84);
}

// ── Polygon area (planar, EPSG:5183, square metres) ─────────────────

function ringAreaSigned(ring) {
  let area = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += ring[i][0] * ring[j][1] - ring[j][0] * ring[i][1];
  }
  return area / 2;
}

function polygonArea(polygon) {
  let area = ringAreaSigned(polygon[0]);
  for (let i = 1; i < polygon.length; i++) {
    area -= Math.abs(ringAreaSigned(polygon[i]));
  }
  return Math.abs(area);
}

// ── Outline polygon collection for a given floor ────────────────────

/**
 * Return the EPSG:5183 outline polygons to use as the starting union for
 * walkable area generation at the given level.
 *
 * For Level 1 we use the entire school footprint (all 18 outline features).
 * This is the fix: the main building (층수 === 3) is included so its ground
 * floor shows up in Level 1 walkable area. The fallback already kicks in
 * for levels 2 and 4 (no floor-specific outlines), so the same "use all
 * features" approach matches what the original script does on those levels.
 */
function collectOutlinePolygons(outlineRaw, floor) {
  const outlinesToUse = outlineRaw.features; // Level 1: use the full footprint
  console.log(
    `  Using ${outlinesToUse.length} outline features (all floors combined)`,
  );

  const outlinePolygons = [];
  for (const feat of outlinesToUse) {
    for (const polygon of feat.geometry.coordinates) {
      const epsgPoly = polygon.map(ringToEpsg5183);
      outlinePolygons.push(epsgPoly);
    }
  }
  return outlinePolygons;
}

// ── Main ─────────────────────────────────────────────────────────────

function main() {
  // 1. Read inputs
  const outlineRaw = JSON.parse(fs.readFileSync(OUTLINE_PATH, 'utf8'));
  const campusRaw = JSON.parse(fs.readFileSync(CAMPUS_PATH, 'utf8'));
  const existing = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));

  console.log(`school-outline.json features: ${outlineRaw.features.length}`);
  console.log(`campus-wgs84.json features: ${campusRaw.features.length}`);
  console.log(
    `Existing routing-walkable-areas.geojson features: ${existing.features.length}`,
  );

  // 2. Sanity check: confirm the bug condition
  const floor1Outlines = outlineRaw.features.filter(
    (f) => f.properties['층수'] === 1,
  );
  const floor3Outlines = outlineRaw.features.filter(
    (f) => f.properties['층수'] === 3,
  );
  console.log(
    `  Outline floor distribution: 층수=1 → ${floor1Outlines.length}, 층수=3 → ${floor3Outlines.length}`,
  );
  if (floor3Outlines.length === 0) {
    console.error(
      'FATAL: No 층수=3 outlines found in school-outline.json. The main building',
    );
    console.error(
      '       cannot be the source of this bug. Refusing to overwrite file.',
    );
    process.exit(1);
  }

  // 3. Collect outline polygons for Level 1 (using all 18 features)
  const outlinePolygons = collectOutlinePolygons(outlineRaw, REGEN_LEVEL);
  if (outlinePolygons.length === 0) {
    console.error('FATAL: No outline polygons to use. Aborting.');
    process.exit(1);
  }

  // 4. Union all outline polygons into one multi-polygon
  let walkableMulti = polygonClipping.union(...outlinePolygons);
  console.log(`  Union produced ${walkableMulti.length} polygon(s)`);

  // 5. Collect L1 obstacles
  const obstacles = campusRaw.features.filter(
    (f) =>
      f.properties &&
      f.properties.level === REGEN_LEVEL &&
      OBSTACLE_CATEGORIES.has(f.properties.category),
  );
  console.log(`  L1 obstacle features: ${obstacles.length}`);

  // 6. Subtract each obstacle
  let subtractedCount = 0;
  for (const obs of obstacles) {
    if (obs.geometry.type === 'Point') continue;

    let obsMultiPoly;
    if (obs.geometry.type === 'MultiPolygon') {
      obsMultiPoly = obs.geometry.coordinates.map((poly) =>
        poly.map(ringToEpsg5183),
      );
    } else {
      // Polygon
      obsMultiPoly = [obs.geometry.coordinates.map(ringToEpsg5183)];
    }

    if (obsMultiPoly.length === 0) continue;

    const beforeCount = walkableMulti.length;
    walkableMulti = polygonClipping.difference(walkableMulti, obsMultiPoly);
    if (walkableMulti.length !== beforeCount) {
      subtractedCount++;
    }
  }
  console.log(`  Obstacles that actually changed the polygon: ${subtractedCount}`);

  // 7. Filter slivers, convert to WGS84, build new L1 features
  const newLevel1Features = [];
  let droppedSlivers = 0;
  for (const polygon of walkableMulti) {
    const area = polygonArea(polygon);
    if (area < SLIVER_THRESHOLD_M2) {
      droppedSlivers++;
      continue;
    }
    const wgs84Polygon = polygon.map(ringToWgs84);
    const roundedArea = Math.round(area * 100) / 100;
    newLevel1Features.push({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: wgs84Polygon,
      },
      properties: {
        level: REGEN_LEVEL,
        areaSquareMeters: roundedArea,
        sourceFeatureIds: obstacles
          .map((o) => o.properties && o.properties.id)
          .filter(Boolean),
      },
    });
  }
  console.log(
    `  New L1 walkable areas: ${newLevel1Features.length} (dropped ${droppedSlivers} slivers < ${SLIVER_THRESHOLD_M2} m²)`,
  );
  const l1TotalArea = newLevel1Features.reduce(
    (acc, f) => acc + f.properties.areaSquareMeters,
    0,
  );
  console.log(
    `  New L1 total area: ${Math.round(l1TotalArea * 100) / 100} m²`,
  );

  // 8. Preserve all features with level != REGEN_LEVEL (L2, L3, L4 user-edited)
  const preservedFeatures = existing.features.filter(
    (f) => !(f.properties && f.properties.level === REGEN_LEVEL),
  );
  console.log(
    `  Preserved features (level != ${REGEN_LEVEL}): ${preservedFeatures.length}`,
  );
  const preservedByLevel = new Map();
  for (const f of preservedFeatures) {
    const lv = f.properties.level;
    preservedByLevel.set(lv, (preservedByLevel.get(lv) || 0) + 1);
  }
  for (const [lv, n] of [...preservedByLevel.entries()].sort()) {
    console.log(`    level=${lv}: ${n} features (unchanged)`);
  }

  // 9. Sanity: confirm no preserved feature was modified
  const originalPreserved = existing.features.filter(
    (f) => !(f.properties && f.properties.level === REGEN_LEVEL),
  );
  if (originalPreserved.length !== preservedFeatures.length) {
    console.error('FATAL: Preservation count mismatch. Aborting.');
    process.exit(1);
  }
  for (let i = 0; i < originalPreserved.length; i++) {
    if (JSON.stringify(originalPreserved[i]) !== JSON.stringify(preservedFeatures[i])) {
      console.error(
        `FATAL: Preserved feature #${i} was modified. Aborting.`,
      );
      process.exit(1);
    }
  }

  // 10. Build final FeatureCollection
  const finalFeatures = [...newLevel1Features, ...preservedFeatures];
  const fc = { type: 'FeatureCollection', features: finalFeatures };

  // 11. Write output
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(fc, null, 2));
  console.log(
    `\nWrote ${finalFeatures.length} features to ${path.relative(process.cwd(), OUTPUT_PATH)}`,
  );

  // 12. Per-floor summary
  for (const floor of [1, 2, 3, 4]) {
    const feats = finalFeatures.filter(
      (f) => f.properties && f.properties.level === floor,
    );
    const sum = feats.reduce(
      (acc, f) => acc + (f.properties.areaSquareMeters || 0),
      0,
    );
    console.log(
      `  Floor ${floor}: ${feats.length} walkable area(s), total ${Math.round(sum * 100) / 100} m²`,
    );
  }
}

main();
