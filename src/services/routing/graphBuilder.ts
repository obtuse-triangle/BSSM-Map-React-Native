/**
 * graphBuilder.ts
 *
 * Builds a deterministic indoor routing graph from committed GeoJSON data.
 *
 * Graph construction steps:
 *   1. Load routing-walkable-areas.geojson (static import)
 *   2. Load routing-connectors.geojson (static import)
 *   3. Project all WGS84 coordinates → EPSG:5183 for planar math
 *   4. Per walkable polygon: add ring vertices + sampled interior grid nodes
 *   5. Per level: connect each node to K nearest neighbours within 3×spacing
 *   6. Per connector: add two connector nodes (fromLevel / toLevel),
 *      connect each to nearest polygon nodes, add cross-floor connector edge
 *
 * All node IDs are deterministic (coordinate-based / index-based).
 */

import walkableAreasData from '../../data/routing-walkable-areas.geojson';
import connectorsData from '../../data/routing-connectors.geojson';
import { transformWgs84ToEpsg5183 } from '../../utils/coordinateTransform';
import type { RouteGraph, RouteNode, RouteEdge } from '../../types/routing';

// ── Constants ────────────────────────────────────────────────────────

const DEFAULT_SPACING = 2.0;
const K_NEAREST = 6;
const MAX_EDGE_DISTANCE_MULTIPLIER = 2;
const CONNECTOR_POLYGON_LINKS = 3;
const BRIDGE_MAX_DISTANCE_M = 20;
const CONNECTOR_POLYGON_MAX_DISTANCE_M = 30;

// ── Internal types ───────────────────────────────────────────────────

interface PolygonData {
  exteriorRing: [number, number][];
  interiorRings: [number, number][][];
}

interface NodeEntry {
  id: string;
  x: number;
  y: number;
}

// ── Point-in-polygon (planar ray casting for EPSG:5183) ─────────────

function pointInRing(x: number, y: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y) {
      const ix = ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (x < ix) inside = !inside;
    }
  }
  return inside;
}

/** True if (x,y) is inside the polygon exterior but outside all interior rings. */
function isInsidePolygon(x: number, y: number, poly: PolygonData): boolean {
  if (!pointInRing(x, y, poly.exteriorRing)) return false;
  for (const hole of poly.interiorRings) {
    if (pointInRing(x, y, hole)) return false;
  }
  return true;
}

/** True if (x,y) is inside at least one polygon from a list. */
function isInsideAnyPolygon(
  x: number,
  y: number,
  polygons: PolygonData[],
): boolean {
  for (const poly of polygons) {
    if (isInsidePolygon(x, y, poly)) return true;
  }
  return false;
}

// ── Planar helpers ──────────────────────────────────────────────────

function euclidean(
  x1: number, y1: number,
  x2: number, y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

function computeBbox(
  ring: [number, number][],
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

// ── Grid sampling ────────────────────────────────────────────────────

/**
 * Sample interior points of a polygon on a regular grid at `spacing` metres.
 * Only points that pass the point-in-polygon test (exterior + holes) are returned.
 * A small inset from the bounding-box edge avoids boundary numerical issues.
 */
function sampleGrid(poly: PolygonData, spacing: number): [number, number][] {
  const bb = computeBbox(poly.exteriorRing);
  const inset = spacing * 0.05;
  const points: [number, number][] = [];

  const startX = bb.minX + inset;
  const endX = bb.maxX - inset;
  const startY = bb.minY + inset;
  const endY = bb.maxY - inset;

  for (let x = startX; x <= endX; x += spacing) {
    for (let y = startY; y <= endY; y += spacing) {
      if (isInsidePolygon(x, y, poly)) {
        points.push([x, y]);
      }
    }
  }

  return points;
}

// ── Edge generation ──────────────────────────────────────────────────

/**
 * Generate walk edges for all polygon nodes on one floor level.
 *
 * Two-phase approach:
 *   1. Primary edges — K nearest neighbours within maxDist.
 *   2. Orphan rescue — any node left with zero edges gets connected to its
 *      nearest neighbour regardless of distance.
 *
 * Performance: uses squared distances for filtering and sorting to avoid
 * expensive sqrt calls — only the final edge weight uses the real distance.
 */
function generateEdgesForLevel(
  nodes: NodeEntry[],
  spacing: number,
  polygons: PolygonData[],
  level: number,
): RouteEdge[] {
  const edges: RouteEdge[] = [];
  const maxDistSq = (spacing * MAX_EDGE_DISTANCE_MULTIPLIER) ** 2;
  const seen = new Set<string>();

  // ── Phase 1: KNN within maxDist ──────────────────────────────
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    const candidates: { idx: number; dSq: number }[] = [];

    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue;
      const dx = nodes[j].x - a.x;
      const dy = nodes[j].y - a.y;
      const dSq = dx * dx + dy * dy;
      if (dSq > 0 && dSq <= maxDistSq) {
        candidates.push({ idx: j, dSq });
      }
    }

    candidates.sort((a, b) => a.dSq - b.dSq);
    const nearest = candidates.slice(0, K_NEAREST);

    for (const c of nearest) {
      const b = nodes[c.idx];
      const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const weight = Math.sqrt(c.dSq);

      edges.push({
        from: a.id,
        to: b.id,
        weightMeters: weight,
        level,
        accessibilityPenalty: 0,
        edgeType: 'walk',
      });
      edges.push({
        from: b.id,
        to: a.id,
        weightMeters: weight,
        level,
        accessibilityPenalty: 0,
        edgeType: 'walk',
      });
    }
  }

  // ── Phase 2: Orphan rescue ───────────────────────────────────
  // Ring-vertex nodes on polygon boundaries may not have any neighbour whose
  // midpoint falls strictly inside a walkable area (ray-casting treats
  // boundary points as "inside").  For orphans we skip the midpoint check
  // and connect directly to the nearest node.
  const orphanEdges = new Set<string>();
  const hasEdge = new Set<string>();
  for (const e of edges) {
    hasEdge.add(e.from);
    hasEdge.add(e.to);
  }

  const orphanRescueMaxDistSq = 10 ** 2;
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    if (hasEdge.has(a.id)) continue;

    let bestIdx = -1;
    let bestDSq = Infinity;
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue;
      const dx = nodes[j].x - a.x;
      const dy = nodes[j].y - a.y;
      const dSq = dx * dx + dy * dy;
      if (dSq > 0 && dSq <= orphanRescueMaxDistSq && dSq < bestDSq) {
        bestDSq = dSq;
        bestIdx = j;
      }
    }

    if (bestIdx === -1) continue;
    const b = nodes[bestIdx];
    const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
    if (orphanEdges.has(key)) continue;
    orphanEdges.add(key);

    const weight = Math.sqrt(bestDSq);
    edges.push({
      from: a.id,
      to: b.id,
      weightMeters: weight,
      level,
      accessibilityPenalty: 0,
      edgeType: 'walk',
    });
    edges.push({
      from: b.id,
      to: a.id,
      weightMeters: weight,
      level,
      accessibilityPenalty: 0,
      edgeType: 'walk',
    });
  }

  return edges;
}

/**
 * Bridge separate walkable polygons on the same level by connecting the
 * closest node pair between polygons, using a minimum-spanning-tree pass so we
 * add the fewest possible cross-polygon links.
 */
function generatePolygonBridgesForLevel(
  polygonNodeGroups: NodeEntry[][],
  level: number,
): RouteEdge[] {
  if (polygonNodeGroups.length <= 1) return [];

  const candidates: {
    from: NodeEntry;
    to: NodeEntry;
    weight: number;
    i: number;
    j: number;
  }[] = [];

  for (let i = 0; i < polygonNodeGroups.length; i++) {
    for (let j = i + 1; j < polygonNodeGroups.length; j++) {
      let bestFrom: NodeEntry | null = null;
      let bestTo: NodeEntry | null = null;
      let bestWeight = Infinity;

      for (const a of polygonNodeGroups[i]) {
        for (const b of polygonNodeGroups[j]) {
          const weight = euclidean(a.x, a.y, b.x, b.y);
          if (weight < bestWeight) {
            bestWeight = weight;
            bestFrom = a;
            bestTo = b;
          }
        }
      }

      if (bestFrom && bestTo && bestWeight <= BRIDGE_MAX_DISTANCE_M) {
        candidates.push({
          from: bestFrom,
          to: bestTo,
          weight: bestWeight,
          i,
          j,
        });
      }
    }
  }

  candidates.sort((a, b) => a.weight - b.weight);

  const parent = polygonNodeGroups.map((_, idx) => idx);
  const find = (idx: number): number => {
    let cur = idx;
    while (parent[cur] !== cur) {
      parent[cur] = parent[parent[cur]];
      cur = parent[cur];
    }
    return cur;
  };
  const union = (a: number, b: number): boolean => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return false;
    parent[rb] = ra;
    return true;
  };

  const bridgeEdges: RouteEdge[] = [];
  const seen = new Set<string>();

  for (const c of candidates) {
    if (!union(c.i, c.j)) continue;

    const key = c.from.id < c.to.id ? `${c.from.id}|${c.to.id}` : `${c.to.id}|${c.from.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    bridgeEdges.push({
      from: c.from.id,
      to: c.to.id,
      weightMeters: c.weight,
      level,
      accessibilityPenalty: 0,
      edgeType: 'walk',
    });
    bridgeEdges.push({
      from: c.to.id,
      to: c.from.id,
      weightMeters: c.weight,
      level,
      accessibilityPenalty: 0,
      edgeType: 'walk',
    });
  }

  return bridgeEdges;
}

/**
 * If walkable polygons still end up fragmented into multiple components after
 * local KNN edges and polygon bridges, add the closest remaining inter-component
 * links until the level becomes connected.
 */
function generateComponentBridgesForLevel(
  nodes: NodeEntry[],
  existingEdges: RouteEdge[],
  level: number,
): RouteEdge[] {
  if (nodes.length <= 1) return [];

  const nodeIds = new Set(nodes.map((n) => n.id));
  const parent = new Map<string, string>();
  for (const node of nodes) parent.set(node.id, node.id);

  const find = (id: string): string => {
    const p = parent.get(id);
    if (!p || p === id) return id;
    const root = find(p);
    parent.set(id, root);
    return root;
  };

  const union = (a: string, b: string): boolean => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return false;
    parent.set(rb, ra);
    return true;
  };

  for (const edge of existingEdges) {
    if (edge.edgeType !== 'walk') continue;
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) continue;
    union(edge.from, edge.to);
  }

  const seen = new Set<string>();
  for (const edge of existingEdges) {
    const key = edge.from < edge.to ? `${edge.from}|${edge.to}` : `${edge.to}|${edge.from}`;
    seen.add(key);
  }

  const candidates: {
    from: NodeEntry;
    to: NodeEntry;
    weight: number;
  }[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (find(nodes[i].id) === find(nodes[j].id)) continue;
      const weight = euclidean(nodes[i].x, nodes[i].y, nodes[j].x, nodes[j].y);
      if (weight > BRIDGE_MAX_DISTANCE_M) continue;
      candidates.push({
        from: nodes[i],
        to: nodes[j],
        weight,
      });
    }
  }

  candidates.sort((a, b) => a.weight - b.weight);

  const bridgeEdges: RouteEdge[] = [];
  for (const c of candidates) {
    if (!union(c.from.id, c.to.id)) continue;

    const key = c.from.id < c.to.id ? `${c.from.id}|${c.to.id}` : `${c.to.id}|${c.from.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    bridgeEdges.push({
      from: c.from.id,
      to: c.to.id,
      weightMeters: c.weight,
      level,
      accessibilityPenalty: 0,
      edgeType: 'walk',
    });
    bridgeEdges.push({
      from: c.to.id,
      to: c.from.id,
      weightMeters: c.weight,
      level,
      accessibilityPenalty: 0,
      edgeType: 'walk',
    });
  }

  return bridgeEdges;
}

// ── Connector helpers ────────────────────────────────────────────────

/** Sort connectors for deterministic iteration order. */
function sortConnectors(features: any[]): any[] {
  return [...features].sort((a, b) => {
    const at = a.properties.connectorType as string;
    const bt = b.properties.connectorType as string;
    if (at !== bt) return at.localeCompare(bt);
    const [af, ato] = a.properties.connectsLevels as [number, number];
    const [bf, bto] = b.properties.connectsLevels as [number, number];
    if (af !== bf) return af - bf;
    if (ato !== bto) return ato - bto;
    const [aLng] = a.geometry.coordinates as [number, number];
    const [bLng] = b.geometry.coordinates as [number, number];
    return aLng - bLng;
  });
}

/**
 * Build a deterministic routing graph from the committed walkable-area
 * and connector GeoJSON data.
 *
 * @param spacing  Grid sampling spacing in metres (default 2.0).
 * @returns A fully populated RouteGraph.
 */
export function buildRoutingGraph(
  spacing: number = DEFAULT_SPACING,
): RouteGraph {
  const rawWalkable = walkableAreasData as any;
  const rawConnectors = connectorsData as any;

  const nodes = new Map<string, RouteNode>();
  const edges: RouteEdge[] = [];

  // ── 1. Group walkable features by level ──────────────────────────
  const featuresByLevel = new Map<number, any[]>();
  for (const f of rawWalkable.features) {
    const lvl = f.properties.level as number;
    if (!featuresByLevel.has(lvl)) featuresByLevel.set(lvl, []);
    featuresByLevel.get(lvl)!.push(f);
  }

  // Per-level working data (needed later for connector → polygon links)
  const polygonDataByLevel = new Map<number, PolygonData[]>();
  const levelNodeEntries = new Map<number, NodeEntry[]>();
  const polygonNodeGroupsByLevel = new Map<number, NodeEntry[][]>();

  // ── 2. Process each floor level ──────────────────────────────────
  for (const [level, features] of featuresByLevel) {
    const polys: PolygonData[] = [];
    const allNodes: NodeEntry[] = [];
    const polygonNodeGroups: NodeEntry[][] = [];
    let ringGroupIndex = 0; // global per-level ring-group counter for determinism

    for (const feat of features) {
      const coords: number[][][] = feat.geometry.coordinates;

      // Project exterior ring
      const exteriorRing: [number, number][] = coords[0].map(
        ([lng, lat]: number[]) => transformWgs84ToEpsg5183(lng, lat),
      );

      // Project interior rings (holes)
      const interiorRings: [number, number][][] = coords
        .slice(1)
        .map((ring: number[][]) =>
          ring.map(([lng, lat]: number[]) => transformWgs84ToEpsg5183(lng, lat)),
        );

      polys.push({ exteriorRing, interiorRings });
      const polygonNodes: NodeEntry[] = [];

      // 2a. Ring vertex nodes
      for (let pi = 0; pi < exteriorRing.length; pi++) {
        const [x, y] = exteriorRing[pi];
        const id = `f${level}-r${ringGroupIndex}-${pi}`;
        if (!nodes.has(id)) {
          nodes.set(id, {
            id,
            x,
            y,
            level,
            nodeType: 'polygon',
          });
          const entry = { id, x, y };
          allNodes.push(entry);
          polygonNodes.push(entry);
        }
      }
      ringGroupIndex++;

      // 2b. Grid interior samples
      const gridPoints = sampleGrid(polys[polys.length - 1], spacing);
      for (const [x, y] of gridPoints) {
        const xf = Number(x.toFixed(2));
        const yf = Number(y.toFixed(2));
        const id = `f${level}-g${xf}-${yf}`;
        if (!nodes.has(id)) {
          nodes.set(id, {
            id,
            x,
            y,
            level,
            nodeType: 'polygon',
          });
          const entry = { id, x, y };
          allNodes.push(entry);
          polygonNodes.push(entry);
        }
      }

      polygonNodeGroups.push(polygonNodes);
    }

    polygonDataByLevel.set(level, polys);
    levelNodeEntries.set(level, allNodes);
    polygonNodeGroupsByLevel.set(level, polygonNodeGroups);

    // 2c. Generate walk edges for this level
    const levelEdges = generateEdgesForLevel(allNodes, spacing, polys, level);
    edges.push(...levelEdges);

    // 2d. Bridge adjacent walkable polygons so disconnected floor fragments
    //      become a single routing component.
    const bridgeEdges = generatePolygonBridgesForLevel(polygonNodeGroups, level);
    edges.push(...bridgeEdges);

    // 2e. Final connectivity pass across any remaining disconnected level-
    //      local components.
    const componentBridgeEdges = generateComponentBridgesForLevel(allNodes, edges, level);
    edges.push(...componentBridgeEdges);
  }

  // ── 3. Connector nodes & edges ───────────────────────────────────
  const sortedConnectors = sortConnectors(rawConnectors.features);

  for (let ci = 0; ci < sortedConnectors.length; ci++) {
    const conn = sortedConnectors[ci];
    const [lng, lat] = conn.geometry.coordinates as [number, number];
    const [x, y] = transformWgs84ToEpsg5183(lng, lat);
    const [fromLevel, toLevel] = conn.properties.connectsLevels as [
      number,
      number,
    ];
    const connType = conn.properties.connectorType as string;
    const connId: string = conn.id ?? `conn-${connType}-${ci}`;

    // Node IDs for the two connector endpoints
    const fromNodeId = `conn-${connType}-${ci}-${fromLevel}`;
    const toNodeId = `conn-${connType}-${ci}-${toLevel}`;

    if (!nodes.has(fromNodeId)) {
      nodes.set(fromNodeId, {
        id: fromNodeId,
        x,
        y,
        level: fromLevel,
        nodeType: 'connector',
      });
    }
    if (!nodes.has(toNodeId)) {
      nodes.set(toNodeId, {
        id: toNodeId,
        x,
        y,
        level: toLevel,
        nodeType: 'connector',
      });
    }

    // 3a. Link connector node → nearest polygon nodes on same floor.
    //     Skip polygon nodes exactly at the connector position (zero distance).
    const linkConnectorToLevel = (connNodeId: string, level: number) => {
      const polyNodes = levelNodeEntries.get(level);
      if (!polyNodes || polyNodes.length === 0) return;

      const withDist = polyNodes
        .map((n) => ({
          id: n.id,
          d: euclidean(x, y, n.x, n.y),
        }))
        .filter((n) => n.d > 0 && n.d <= CONNECTOR_POLYGON_MAX_DISTANCE_M)
        .sort((a, b) => a.d - b.d);

      const nearest = withDist.slice(0, CONNECTOR_POLYGON_LINKS);
      for (const target of nearest) {
        edges.push({
          from: connNodeId,
          to: target.id,
          weightMeters: target.d,
          level,
          accessibilityPenalty: 0,
          edgeType: 'walk',
        });
        edges.push({
          from: target.id,
          to: connNodeId,
          weightMeters: target.d,
          level,
          accessibilityPenalty: 0,
          edgeType: 'walk',
        });
      }
    };

    linkConnectorToLevel(fromNodeId, fromLevel);
    linkConnectorToLevel(toNodeId, toLevel);

    // 3b. Cross-floor connector edge (bidirectional)
    const traversalWeight = conn.properties.traversalTimeSeconds as number;
    const accessibilityPenalty = conn.properties.accessibilityPenalty as number;

    edges.push({
      from: fromNodeId,
      to: toNodeId,
      weightMeters: traversalWeight,
      level: -1,
      connectorId: connId,
      accessibilityPenalty,
      edgeType: 'connector',
    });
    edges.push({
      from: toNodeId,
      to: fromNodeId,
      weightMeters: traversalWeight,
      level: -1,
      connectorId: connId,
      accessibilityPenalty,
      edgeType: 'connector',
    });
  }

  const incidentNodeIds = new Set<string>();
  for (const e of edges) {
    incidentNodeIds.add(e.from);
    incidentNodeIds.add(e.to);
  }
  for (const nodeId of [...nodes.keys()]) {
    if (!incidentNodeIds.has(nodeId)) {
      nodes.delete(nodeId);
    }
  }

  // ── 4. Build adjacency list ──────────────────────────────────────
  const adjacency = new Map<string, string[]>();
  for (const nodeId of nodes.keys()) {
    adjacency.set(nodeId, []);
  }
  for (const e of edges) {
    const list = adjacency.get(e.from);
    if (list && !list.includes(e.to)) {
      list.push(e.to);
    }
  }

  return { nodes, edges, adjacency };
}

/**
 * Build a sub-graph containing only nodes and edges relevant to a single
 * floor level.  Includes connector approach edges (walk) and cross-floor
 * connector edges that have an endpoint on this level.
 *
 * Useful for unit-testing individual floors.
 */
export function buildRoutingGraphForLevel(
  level: number,
  spacing: number = DEFAULT_SPACING,
): { nodes: RouteNode[]; edges: RouteEdge[] } {
  const graph = buildRoutingGraph(spacing);
  const levelNodes: RouteNode[] = [];
  const edgeSet = new Set<string>();
  const levelEdges: RouteEdge[] = [];

  for (const node of graph.nodes.values()) {
    if (node.level === level) {
      levelNodes.push(node);
    }
  }

  for (const edge of graph.edges) {
    const fn = graph.nodes.get(edge.from);
    const tn = graph.nodes.get(edge.to);
    if (fn?.level === level || tn?.level === level) {
      const key = `${edge.from}|${edge.to}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        levelEdges.push(edge);
      }
    }
  }

  return { nodes: levelNodes, edges: levelEdges };
}
