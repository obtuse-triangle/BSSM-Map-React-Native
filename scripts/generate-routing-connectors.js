#!/usr/bin/env node
/**
 * generate-routing-connectors.js
 *
 * Build-time script that reads campus-wgs84.json, extracts stair and elevator
 * features, groups them by proximity across floors, and generates
 * RoutingConnectorFeature GeoJSON (WGS84).
 *
 * Usage:  node scripts/generate-routing-connectors.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const proj4 = require('proj4');

// ── CRS definitions ──────────────────────────────────────────────────
const EPSG_5183 =
  '+proj=tmerc +lat_0=38 +lon_0=129 +k=1 +x_0=200000 +y_0=500000 +ellps=GRS80 +units=m +no_defs';
const EPSG_4326 = '+proj=longlat +datum=WGS84 +no_defs';

// ── Paths ────────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, '..', 'src', 'data');
const CAMPUS_PATH = path.join(DATA_DIR, 'campus-wgs84.json');
const OUTPUT_PATH = path.join(DATA_DIR, 'routing-connectors.geojson');

// ── Proximity threshold (metres, EPSG:5183 planar) ──────────────────
// Stairs/elevators within this distance across floors are considered
// the same physical shaft.
const PROXIMITY_THRESHOLD = 15;

// ── Coordinate helpers ──────────────────────────────────────────────

function toEpsg5183(point) {
  return proj4(EPSG_4326, EPSG_5183, [point[0], point[1]]);
}

function toWgs84(point) {
  return proj4(EPSG_5183, EPSG_4326, [point[0], point[1]]);
}

/** Compute centroid of a polygon ring (first ring if MultiPolygon). */
function computeCentroidEpsg5183(feature) {
  let coords;
  if (feature.geometry.type === 'MultiPolygon') {
    // Use the first polygon's outer ring
    coords = feature.geometry.coordinates[0][0];
  } else {
    // Polygon — outer ring
    coords = feature.geometry.coordinates[0];
  }

  // Compute centroid in WGS84, then project to EPSG:5183 once
  let cx = 0;
  let cy = 0;
  const n = coords.length;
  for (let i = 0; i < n; i++) {
    cx += coords[i][0];
    cy += coords[i][1];
  }
  cx /= n;
  cy /= n;

  const [x, y] = toEpsg5183([cx, cy]);
  return { x, y, wgs84Lon: cx, wgs84Lat: cy };
}

/** Euclidean distance between two points in EPSG:5183 planar space. */
function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// ── Feature grouping ────────────────────────────────────────────────

/**
 * Group features across floors by proximity.
 * Returns array of groups, where each group is a map: level → featureInfo.
 */
function groupByProximity(features) {
  // Index features by level
  const byLevel = new Map(); // level → [{ id, centroid, feature }]
  for (const feat of features) {
    const level = feat.properties.level;
    if (!byLevel.has(level)) {
      byLevel.set(level, []);
    }
    const centroid = computeCentroidEpsg5183(feat);
    byLevel.get(level).push({
      id: feat.properties.id,
      feature: feat,
      centroid,
    });
  }

  // Groups: each group is { levels: Map<level, info> }
  const groups = [];
  const usedIds = new Set();

  // Sort levels ascending
  const sortedLevels = [...byLevel.keys()].sort((a, b) => a - b);

  for (const level of sortedLevels) {
    const items = byLevel.get(level);
    for (const item of items) {
      if (usedIds.has(item.id)) continue;

      // Try to add this item to an existing group
      let addedToGroup = false;
      for (const group of groups) {
        // Check if any existing level in this group has a matching feature nearby
        for (const [groupLevel, groupInfo] of group.levels) {
          if (Math.abs(groupLevel - level) > 1) continue; // only adjacent or same
          const dist = distance(item.centroid, groupInfo.centroid);
          if (dist <= PROXIMITY_THRESHOLD) {
            group.levels.set(level, item);
            usedIds.add(item.id);
            // Update bounds
            if (level < group.minLevel) group.minLevel = level;
            if (level > group.maxLevel) group.maxLevel = level;
            addedToGroup = true;
            break;
          }
        }
        if (addedToGroup) break;
      }

      if (!addedToGroup) {
        // Start a new group
        const newGroup = {
          levels: new Map([[level, item]]),
          minLevel: level,
          maxLevel: level,
        };
        groups.push(newGroup);
        usedIds.add(item.id);
      }
    }
  }

  // Merge groups that have overlapping level ranges and similar positions
  // (Handle the case where a group was split across floors)
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const g1 = groups[i];
        const g2 = groups[j];

        // Check if they share similar positions (any level pair within threshold)
        let shouldMerge = false;
        for (const [l1, info1] of g1.levels) {
          for (const [l2, info2] of g2.levels) {
            if (Math.abs(l1 - l2) > 1) continue;
            const dist = distance(info1.centroid, info2.centroid);
            if (dist <= PROXIMITY_THRESHOLD) {
              shouldMerge = true;
              break;
            }
          }
          if (shouldMerge) break;
        }

        if (shouldMerge) {
          // Merge g2 into g1
          for (const [l, info] of g2.levels) {
            g1.levels.set(l, info);
          }
          g1.minLevel = Math.min(g1.minLevel, g2.minLevel);
          g1.maxLevel = Math.max(g1.maxLevel, g2.maxLevel);
          groups.splice(j, 1);
          merged = true;
          break;
        }
      }
      if (merged) break;
    }
  }

  return groups;
}

// ── Main ─────────────────────────────────────────────────────────────

function main() {
  const campusRaw = JSON.parse(fs.readFileSync(CAMPUS_PATH, 'utf8'));

  // 1. Extract stair features
  const stairFeatures = campusRaw.features.filter(
    (f) => f.properties && f.properties.category === 'stair',
  );
  // 2. Extract elevator features
  const elevatorFeatures = campusRaw.features.filter(
    (f) => f.properties && f.properties.category === 'elevator',
  );

  console.log(`Stair features: ${stairFeatures.length}`);
  console.log(`Elevator features: ${elevatorFeatures.length}`);

  // 3. Group stairs by proximity across floors
  const stairGroups = groupByProximity(stairFeatures);
  console.log(`Stair groups: ${stairGroups.length}`);

  // 4. Group elevators by proximity across floors
  const elevatorGroups = groupByProximity(elevatorFeatures);
  console.log(`Elevator groups: ${elevatorGroups.length}`);

  // 5. Generate connector features
  const connectorFeatures = [];

  // 5a. Stair connectors: adjacent floor pairs within each group
  for (const group of stairGroups) {
    const sortedLevels = [...group.levels.keys()].sort((a, b) => a - b);

    // Create connectors for each adjacent pair
    for (let i = 0; i < sortedLevels.length - 1; i++) {
      const fromLevel = sortedLevels[i];
      const toLevel = sortedLevels[i + 1];

      // Use the centroid from the lower floor as the connector position
      const fromInfo = group.levels.get(fromLevel);
      const centroidWgs84 = [fromInfo.centroid.wgs84Lon, fromInfo.centroid.wgs84Lat];

      const sourceIds = [];
      // Include both levels' feature IDs
      for (const level of sortedLevels) {
        const info = group.levels.get(level);
        if (info) sourceIds.push(info.id);
      }

      const connectorId = `connector-stair-${fromLevel}-${toLevel}-${sourceIds[0]}`;

      connectorFeatures.push({
        type: 'Feature',
        id: connectorId,
        geometry: {
          type: 'Point',
          coordinates: centroidWgs84,
        },
        properties: {
          connectorType: 'stair',
          connectsLevels: [fromLevel, toLevel],
          traversalTimeSeconds: 15,
          accessibilityPenalty: 5,
          sourceFeatureIds: sourceIds,
          confidence: 'auto',
        },
      });
    }

    console.log(
      `  Stair group: levels [${sortedLevels.join(', ')}] → ${
        sortedLevels.length - 1
      } connector(s)`,
    );
  }

  // 5b. Elevator connectors: full range for each group
  for (const group of elevatorGroups) {
    const sortedLevels = [...group.levels.keys()].sort((a, b) => a - b);
    const fromLevel = group.minLevel;
    const toLevel = group.maxLevel;

    // Use centroid from lowest available level
    const fromInfo = group.levels.get(sortedLevels[0]);
    const centroidWgs84 = [fromInfo.centroid.wgs84Lon, fromInfo.centroid.wgs84Lat];

    const sourceIds = [];
    for (const level of sortedLevels) {
      const info = group.levels.get(level);
      if (info) sourceIds.push(info.id);
    }

    const connectorId = `connector-elevator-${fromLevel}-${toLevel}-${sourceIds[0]}`;

    connectorFeatures.push({
      type: 'Feature',
      id: connectorId,
      geometry: {
        type: 'Point',
        coordinates: centroidWgs84,
      },
      properties: {
        connectorType: 'elevator',
        connectsLevels: [fromLevel, toLevel],
        traversalTimeSeconds:
          toLevel - fromLevel === 1 ? 35 : toLevel - fromLevel === 2 ? 45 : 55,
        accessibilityPenalty: 0,
        sourceFeatureIds: sourceIds,
        confidence: 'auto',
      },
    });

    console.log(
      `  Elevator group: levels [${sortedLevels.join(', ')}] → 1 connector spanning [${fromLevel},${toLevel}]`,
    );
  }

  // 6. Write output
  const fc = {
    type: 'FeatureCollection',
    features: connectorFeatures,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(fc, null, 2));
  console.log(
    `\n✅ Wrote ${connectorFeatures.length} connectors to ${path.relative(process.cwd(), OUTPUT_PATH)}`,
  );

  // Summary
  const stairConnectors = connectorFeatures.filter(
    (f) => f.properties.connectorType === 'stair',
  ).length;
  const elevatorConnectors = connectorFeatures.filter(
    (f) => f.properties.connectorType === 'elevator',
  ).length;
  console.log(`  Stair connectors: ${stairConnectors}`);
  console.log(`  Elevator connectors: ${elevatorConnectors}`);
}

main();
