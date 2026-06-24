#!/usr/bin/env node
/**
 * scripts/viz-level2.js
 *
 * Generates GeoJSON files in tmp/viz/ for visual inspection of Level 2
 * fragmentation.  Load the outputs into QGIS, geojson.io, or any web map.
 *
 *   node scripts/viz-level2.js
 *
 * Outputs (WGS84, EPSG:4326):
 *   tmp/viz/level2-campus-features.geojson       - all Level 2 campus features (colored by category)
 *   tmp/viz/level2-walkable-areas.geojson        - regenerated walkable areas (17 polygons)
 *   tmp/viz/level2-obstacles-only.geojson        - subtracted obstacle features only
 *   tmp/viz/level2-corridors-only.geojson        - corridor category features only
 *   tmp/viz/level2-walkable-tiny-fragments.geojson - only fragments < 100 m²
 *   tmp/viz/level2-walkable-big-pieces.geojson   - only fragments ≥ 100 m²
 */
'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'src', 'data');
const OUT_DIR = path.join(__dirname, '..', 'tmp', 'viz');

const CAMPUS_PATH = path.join(DATA_DIR, 'campus-wgs84.json');
const WALKABLE_PATH = path.join(DATA_DIR, 'routing-walkable-areas.geojson');

const OBSTACLE_CATEGORIES = new Set([
  'classroom', 'room', 'restroom', 'facility', 'structural', 'unknown',
]);

function writeGeoJSON(filename, features) {
  const fc = { type: 'FeatureCollection', features };
  const p = path.join(OUT_DIR, filename);
  fs.writeFileSync(p, JSON.stringify(fc, null, 2));
  console.log(`  ${filename} — ${features.length} features`);
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const campus = JSON.parse(fs.readFileSync(CAMPUS_PATH, 'utf8'));
  const walkable = JSON.parse(fs.readFileSync(WALKABLE_PATH, 'utf8'));

  const lv2Campus = campus.features.filter(f => f.properties && f.properties.level === 2);
  const lv2Walkable = walkable.features.filter(f => f.properties && f.properties.level === 2);

  console.log(`Level 2: ${lv2Campus.length} campus features, ${lv2Walkable.length} walkable polygons`);

  // 1. All Level 2 campus features
  writeGeoJSON('level2-campus-features.geojson',
    lv2Campus.map(f => ({
      ...f,
      properties: {
        ...f.properties,
        // color hint layer for QGIS categorized renderer
        _vizCategory: f.properties.category,
        _vizLabel: `${f.properties.id} · ${f.properties.name_ko || f.properties.name || ''}`,
      },
    })));

  // 2. Walkable areas
  writeGeoJSON('level2-walkable-areas.geojson', lv2Walkable);

  // 3. Obstacles only
  writeGeoJSON('level2-obstacles-only.geojson',
    lv2Campus.filter(f => OBSTACLE_CATEGORIES.has(f.properties.category)));

  // 4. Corridors only (these are NOT subtracted — should be walkable)
  writeGeoJSON('level2-corridors-only.geojson',
    lv2Campus.filter(f => f.properties.category === 'corridor'));

  // 5. Tiny fragments
  writeGeoJSON('level2-walkable-tiny-fragments.geojson',
    lv2Walkable.filter(f => f.properties.areaSquareMeters < 100));

  // 6. Big pieces
  writeGeoJSON('level2-walkable-big-pieces.geojson',
    lv2Walkable.filter(f => f.properties.areaSquareMeters >= 100));

  console.log(`\nWrote 6 files to ${path.relative(process.cwd(), OUT_DIR)}/`);
  console.log('\nViewing options:');
  console.log('  • QGIS: Layer → Add Layer → Add Vector Layer → pick .geojson');
  console.log('  • Web: drag files onto https://geojson.io  or  https://geojson.io');
  console.log('  • Compare: load obstacles + corridors + walkable-tiny-fragments together');
}

main();
