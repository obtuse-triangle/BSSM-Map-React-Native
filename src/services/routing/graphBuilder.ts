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
 * Edge weight model (three independent semantic channels):
 *   - distanceMeters: physical horizontal distance (0 for pure connectors)
 *   - timeSeconds: walk → distance/speed, connector → traversalTimeSeconds
 *   - effortMetersEquivalent: walk → distance; connector → derived from floors
 *
 * All node IDs are deterministic (coordinate-based / index-based).
 */

import walkableAreasData from '../../data/routing-walkable-areas.geojson';
import connectorsData from '../../data/routing-connectors.geojson';
import { transformWgs84ToEpsg5183 } from '../../utils/coordinateTransform';
import { WALKING_SPEED_MPS } from './constants';
import { effortCoefficients, computeConnectorEffortMeters } from './effortModel';
import type { RouteGraph, RouteNode, RouteEdge } from '../../types/routing';
import {
  type PolygonData,
  type NodeEntry,
  euclidean,
  sampleGrid,
} from './graphBuilderInternal/polygonGeometry';
import {
  generateEdgesForLevel,
  generatePolygonBridgesForLevel,
  generateComponentBridgesForLevel,
} from './graphBuilderInternal/edgeGeneration';
import { sortConnectors } from './graphBuilderInternal/connectorOps';

// ── Constants ────────────────────────────────────────────────────────

const DEFAULT_SPACING = 2.0;
const CONNECTOR_POLYGON_LINKS = 5;
const CONNECTOR_POLYGON_MAX_DISTANCE_M = 30;

// ── Edge weight helpers ──────────────────────────────────────────────

function walkEdgeWeights(distanceMeters: number) {
  return {
    distanceMeters,
    timeSeconds: distanceMeters / WALKING_SPEED_MPS,
    effortMetersEquivalent: distanceMeters,
  };
}

function connectorEdgeWeights(
  traversalTimeSeconds: number,
  connectorType: 'stair' | 'elevator',
  connectsLevels: [number, number],
) {
  return {
    distanceMeters: 0,
    timeSeconds: traversalTimeSeconds,
    effortMetersEquivalent: computeConnectorEffortMeters(
      connectorType,
      connectsLevels,
      effortCoefficients,
    ),
  };
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
    const bridgeEdges = generatePolygonBridgesForLevel(polygonNodeGroups, level, polys);
    edges.push(...bridgeEdges);

    // 2e. Final connectivity guarantee: if anything is still fragmented after
    //      polygon bridges, force-connect the remaining components so every
    //      node on this level is routable.
    const componentBridgeEdges = generateComponentBridgesForLevel(
      allNodes,
      [...levelEdges, ...bridgeEdges],
      level,
      polys,
    );
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
          x: n.x,
          y: n.y,
          d: euclidean(x, y, n.x, n.y),
        }))
        .filter((n) => n.d > 0 && n.d <= CONNECTOR_POLYGON_MAX_DISTANCE_M)
        .sort((a, b) => a.d - b.d);

      const nearest = withDist.slice(0, CONNECTOR_POLYGON_LINKS);
      for (const target of nearest) {
        const w = walkEdgeWeights(target.d);
        edges.push({
          from: connNodeId,
          to: target.id,
          distanceMeters: w.distanceMeters,
          timeSeconds: w.timeSeconds,
          effortMetersEquivalent: w.effortMetersEquivalent,
          level,
          accessibilityPenalty: 0,
          edgeType: 'walk',
        });
        edges.push({
          from: target.id,
          to: connNodeId,
          distanceMeters: w.distanceMeters,
          timeSeconds: w.timeSeconds,
          effortMetersEquivalent: w.effortMetersEquivalent,
          level,
          accessibilityPenalty: 0,
          edgeType: 'walk',
        });
      }
    };

    linkConnectorToLevel(fromNodeId, fromLevel);
    linkConnectorToLevel(toNodeId, toLevel);

    // 3b. Cross-floor connector edge (bidirectional)
    const traversalTimeSeconds = conn.properties.traversalTimeSeconds as number;
    const accessibilityPenalty = conn.properties.accessibilityPenalty as number;
    const connectsLevels: [number, number] = [fromLevel, toLevel];
    const cw = connectorEdgeWeights(
      traversalTimeSeconds,
      connType as 'stair' | 'elevator',
      connectsLevels,
    );

    edges.push({
      from: fromNodeId,
      to: toNodeId,
      distanceMeters: cw.distanceMeters,
      timeSeconds: cw.timeSeconds,
      effortMetersEquivalent: cw.effortMetersEquivalent,
      level: -1,
      connectorId: connId,
      accessibilityPenalty,
      edgeType: 'connector',
      connectorMeta: {
        connectorType: connType as 'stair' | 'elevator',
        connectsLevels,
      },
    });
    edges.push({
      from: toNodeId,
      to: fromNodeId,
      distanceMeters: cw.distanceMeters,
      timeSeconds: cw.timeSeconds,
      effortMetersEquivalent: cw.effortMetersEquivalent,
      level: -1,
      connectorId: connId,
      accessibilityPenalty,
      edgeType: 'connector',
      connectorMeta: {
        connectorType: connType as 'stair' | 'elevator',
        connectsLevels,
      },
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
