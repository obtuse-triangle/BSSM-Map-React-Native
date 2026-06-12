#!/usr/bin/env node
/**
 * validate-routing-data.js
 *
 * Validates both committed GeoJSON data files (routing-walkable-areas.geojson
 * and routing-connectors.geojson) and prints per-floor summaries.
 *
 * Exits 0 on success, 1 with descriptive error on failure.
 *
 * Usage:  node scripts/validate-routing-data.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'src', 'data');
const WALKABLE_PATH = path.join(DATA_DIR, 'routing-walkable-areas.geojson');
const CONNECTORS_PATH = path.join(DATA_DIR, 'routing-connectors.geojson');

let exitCode = 0;

function error(msg) {
  console.error('  ❌ ' + msg);
  exitCode = 1;
}

function check(condition, msg) {
  if (!condition) {
    error(msg);
  }
}

// ── Validate walkable areas ─────────────────────────────────────────

function validateWalkableAreas() {
  console.log('\n=== routing-walkable-areas.geojson ===');

  if (!fs.existsSync(WALKABLE_PATH)) {
    error('File not found: ' + WALKABLE_PATH);
    return;
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(WALKABLE_PATH, 'utf8'));
  } catch (e) {
    error('Invalid JSON: ' + e.message);
    return;
  }

  // Validate FeatureCollection
  check(data.type === 'FeatureCollection', 'type must be FeatureCollection');
  check(Array.isArray(data.features), 'features must be an array');

  const features = data.features;
  console.log(`  Total features: ${features.length}`);

  // Per-floor counts
  const floorCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const floorsWithIssues = new Set();

  for (const feat of features) {
    // Validate Feature structure
    if (feat.type !== 'Feature') {
      error('Feature missing type:Feature');
      continue;
    }

    const props = feat.properties || {};
    const level = props.level;

    // Validate geometry
    if (!feat.geometry || feat.geometry.type !== 'Polygon') {
      error(`Feature level=${level}: geometry must be Polygon`);
      continue;
    }

    const coords = feat.geometry.coordinates;
    if (
      !Array.isArray(coords) ||
      coords.length === 0 ||
      !Array.isArray(coords[0])
    ) {
      error(`Feature level=${level}: invalid Polygon coordinates`);
      continue;
    }

    // Validate properties
    if (typeof level !== 'number' || level < 1 || level > 4) {
      error(`Feature has invalid level: ${level}`);
      floorsWithIssues.add(level);
    } else {
      floorCounts[level] = (floorCounts[level] || 0) + 1;
    }

    if (typeof props.areaSquareMeters !== 'number' || props.areaSquareMeters <= 0) {
      error(`Feature level=${level}: areaSquareMeters must be positive number, got ${props.areaSquareMeters}`);
    }

    if (
      !Array.isArray(props.sourceFeatureIds) ||
      props.sourceFeatureIds.length === 0
    ) {
      error(`Feature level=${level}: sourceFeatureIds must be non-empty array`);
    }
  }

  // Check each floor has at least one feature
  for (let floor = 1; floor <= 4; floor++) {
    if (floorCounts[floor] > 0) {
      console.log(`  Floor ${floor}: ${floorCounts[floor]} walkable area(s) ✅`);
    } else {
      error(`Floor ${floor}: no walkable areas`);
    }
  }
}

// ── Validate connectors ─────────────────────────────────────────────

function validateConnectors() {
  console.log('\n=== routing-connectors.geojson ===');

  if (!fs.existsSync(CONNECTORS_PATH)) {
    error('File not found: ' + CONNECTORS_PATH);
    return;
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(CONNECTORS_PATH, 'utf8'));
  } catch (e) {
    error('Invalid JSON: ' + e.message);
    return;
  }

  check(data.type === 'FeatureCollection', 'type must be FeatureCollection');
  check(Array.isArray(data.features), 'features must be an array');

  const features = data.features;
  console.log(`  Total connectors: ${features.length}`);

  let stairCount = 0;
  let elevatorCount = 0;

  for (const feat of features) {
    if (feat.type !== 'Feature') {
      error('Connector missing type:Feature');
      continue;
    }

    const props = feat.properties || {};
    const connectorType = props.connectorType;

    // Validate connector type
    if (connectorType !== 'stair' && connectorType !== 'elevator') {
      error(`Connector has invalid connectorType: ${connectorType}`);
      continue;
    }

    if (connectorType === 'stair') stairCount++;
    else elevatorCount++;

    // Validate geometry
    if (!feat.geometry || feat.geometry.type !== 'Point') {
      error(`Connector ${feat.id || '?'}: geometry must be Point`);
      continue;
    }

    const coords = feat.geometry.coordinates;
    if (
      !Array.isArray(coords) ||
      coords.length < 2 ||
      typeof coords[0] !== 'number'
    ) {
      error(`Connector ${feat.id || '?'}: invalid Point coordinates`);
      continue;
    }

    // Validate connectsLevels
    const connectsLevels = props.connectsLevels;
    if (!Array.isArray(connectsLevels) || connectsLevels.length !== 2) {
      error(
        `Connector ${feat.id || '?'}: connectsLevels must be a [number, number] tuple`,
      );
      continue;
    }

    const [from, to] = connectsLevels;
    if (
      typeof from !== 'number' ||
      typeof to !== 'number' ||
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      from < 1 ||
      from > 4 ||
      to < 1 ||
      to > 4
    ) {
      error(
        `Connector ${feat.id || '?'}: connectsLevels [${from}, ${to}] out of range [1-4]`,
      );
    }

    // Validate traversal time
    if (
      typeof props.traversalTimeSeconds !== 'number' ||
      props.traversalTimeSeconds <= 0
    ) {
      error(
        `Connector ${feat.id || '?'}: invalid traversalTimeSeconds`,
      );
    }

    // Validate accessibilityPenalty
    if (typeof props.accessibilityPenalty !== 'number') {
      error(
        `Connector ${feat.id || '?'}: invalid accessibilityPenalty`,
      );
    }

    // Validate sourceFeatureIds
    if (
      !Array.isArray(props.sourceFeatureIds) ||
      props.sourceFeatureIds.length === 0
    ) {
      error(
        `Connector ${feat.id || '?'}: sourceFeatureIds must be non-empty array`,
      );
    }

    // Validate confidence
    if (props.confidence !== 'auto' && props.confidence !== 'manual') {
      error(
        `Connector ${feat.id || '?'}: confidence must be 'auto' or 'manual'`,
      );
    }
  }

  console.log(`  Stair connectors: ${stairCount}`);
  console.log(`  Elevator connectors: ${elevatorCount}`);
}

// ── Main ─────────────────────────────────────────────────────────────

function main() {
  console.log('=== Routing Data Validation ===');

  validateWalkableAreas();
  validateConnectors();

  console.log(''); // blank line

  if (exitCode === 0) {
    console.log('✅ All validation checks passed.');
  } else {
    console.error('❌ Some validation checks failed.');
  }

  process.exit(exitCode);
}

main();
