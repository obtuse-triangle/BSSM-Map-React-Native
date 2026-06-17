import { buildRoutingGraph } from './graphBuilder';
import { snapToGraph } from './coordinateSnap';
import { findShortestPath } from './pathfinder';
import { computeRouteOptionSet } from './routeOptions';
import { WALKING_SPEED_MPS } from './constants';
import { computeConnectorEffortMeters, effortCoefficients } from './effortModel';
import { transformWgs84ToEpsg5183 } from '../../utils/coordinateTransform';
import type {
  RouteAccessibilityMode,
  RouteConnectorStats,
  RouteDestination,
  RouteEdge,
  RouteFloorSegment,
  RouteGraph,
  RouteNode,
  RouteOption,
  RouteOrigin,
  RouteResult,
} from '../../types/routing';

let _routingGraphCache: RouteGraph | null = null;

function getCachedRoutingGraph(): RouteGraph {
  if (process.env.NODE_ENV === 'test') {
    return buildRoutingGraph();
  }
  if (!_routingGraphCache) {
    _routingGraphCache = buildRoutingGraph();
  }
  return _routingGraphCache;
}

function cloneGraph(graph: RouteGraph): RouteGraph {
  const nodes = new Map<string, RouteNode>();
  for (const [id, node] of graph.nodes) {
    nodes.set(id, { ...node });
  }

  const edges = graph.edges.map((edge) => ({ ...edge }));

  const adjacency = new Map<string, string[]>();
  for (const [id, neighbours] of graph.adjacency) {
    adjacency.set(id, [...neighbours]);
  }

  return { nodes, edges, adjacency };
}

function euclidean(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Add a bidirectional walk edge between two nodes using the new three-channel
 * weight model. The distance is the planar (EPSG:5183) distance between the
 * node endpoints; time = distance / walk-speed; effort = distance for flat
 * walking.
 */
function addBidirectionalWalkEdge(
  graph: RouteGraph,
  from: RouteNode,
  to: RouteNode,
  level: number,
  distanceMeters: number,
): void {
  const timeSeconds = distanceMeters / WALKING_SPEED_MPS;
  const effortMetersEquivalent = distanceMeters;

  const forward: RouteEdge = {
    from: from.id,
    to: to.id,
    distanceMeters,
    timeSeconds,
    effortMetersEquivalent,
    level,
    accessibilityPenalty: 0,
    edgeType: 'walk',
  };
  const backward: RouteEdge = {
    from: to.id,
    to: from.id,
    distanceMeters,
    timeSeconds,
    effortMetersEquivalent,
    level,
    accessibilityPenalty: 0,
    edgeType: 'walk',
  };

  graph.edges.push(forward, backward);
  const forwardAdj = graph.adjacency.get(from.id) ?? [];
  if (!graph.adjacency.has(from.id)) graph.adjacency.set(from.id, forwardAdj);
  if (!forwardAdj.includes(to.id)) forwardAdj.push(to.id);
  const backwardAdj = graph.adjacency.get(to.id) ?? [];
  if (!graph.adjacency.has(to.id)) graph.adjacency.set(to.id, backwardAdj);
  if (!backwardAdj.includes(from.id)) backwardAdj.push(from.id);
}

function addTempNode(
  graph: RouteGraph,
  prefix: 'temp_origin' | 'temp_destination',
  x: number,
  y: number,
  level: number,
): RouteNode {
  const id = `${prefix}-${level}-${graph.nodes.size}`;
  const node: RouteNode = { id, x, y, level, nodeType: prefix };
  graph.nodes.set(id, node);
  graph.adjacency.set(id, []);
  return node;
}

/** How many nearest walkable nodes a temp origin/destination links into. */
const TEMP_NODE_LINKS = 5;

function connectTempNodeToArea(
  graph: RouteGraph,
  tempNode: RouteNode,
  x: number,
  y: number,
  level: number,
): void {
  // Link the temp node only to its few NEAREST walkable nodes — not to every
  // node within a wide radius. Connecting to far nodes gave Dijkstra straight
  // "shortcut" edges that (a) made the route visibly start at a corridor node
  // metres past the room instead of the one right in front of it, and (b) cut
  // across walls. A small nearest-neighbour set forces the path to enter the
  // graph at the closest point and then follow real corridor edges.
  const candidates: { node: RouteNode; dist: number }[] = [];
  for (const node of graph.nodes.values()) {
    if (node.level !== level) continue;
    if (node.nodeType === 'temp_origin' || node.nodeType === 'temp_destination') continue;
    if (node.nodeType === 'connector') continue;
    candidates.push({ node, dist: euclidean(x, y, node.x, node.y) });
  }
  candidates.sort((a, b) => a.dist - b.dist);

  for (const { node, dist } of candidates.slice(0, TEMP_NODE_LINKS)) {
    addBidirectionalWalkEdge(graph, tempNode, node, level, dist);
  }
}

function resolveAndSnap(
  input: RouteOrigin | RouteDestination,
): { ok: true; nodeId: string; x: number; y: number } | { ok: false; reason: string } {
  const [lon, lat] = input.coordinates;
  const accuracy = 'type' in input && input.type === 'user_location' ? input.accuracy : undefined;
  return snapToGraph(lon, lat, input.level, accuracy);
}

/**
 * Single-route legacy entry point.
 *
 * Implemented on top of the new multi-option engine: we compute the option
 * set and return the top-ranked option. This keeps the RouteResult shape
 * consistent across the single-route and multi-option code paths (effort
 * metrics, connector stats, etc.) without maintaining two parallel metric
 * accumulators.
 *
 * Callers that only need "a route" can keep using this; callers that want
 * alternatives should call `computeRouteOptions` directly.
 */
export function computeRoute(input: {
  origin: RouteOrigin;
  destination: RouteDestination;
  accessibilityMode: RouteAccessibilityMode;
}): RouteResult {
  const options = computeRouteOptions({ origin: input.origin, destination: input.destination });
  if (options.length === 0) {
    // Fall back to a raw Dijkstra run if the option engine produced nothing —
    // this preserves the original error/no-path behaviour.
    return computeRouteLegacy(input);
  }

  // Pick the option that matches the requested accessibility mode when
  // possible; otherwise return the top-ranked (balanced) option.
  const matchingMode = options.find(
    (o) => o.accessibilityMode === input.accessibilityMode,
  );
  if (!matchingMode) {
    return computeRouteLegacy(input);
  }
  return matchingMode.result;
}

/**
 * Bare-bones Dijkstra fallback — used only when the multi-option engine
 * yields nothing (e.g. graph too sparse for Yen to find alternatives).
 * Returns a single shortest-path RouteResult with the new effort fields.
 */
function computeRouteLegacy(input: {
  origin: RouteOrigin;
  destination: RouteDestination;
  accessibilityMode: RouteAccessibilityMode;
}): RouteResult {
  const originSnap = resolveAndSnap(input.origin);
  if (!originSnap.ok) return { ok: false, reason: originSnap.reason };

  const destinationSnap = resolveAndSnap(input.destination);
  if (!destinationSnap.ok) return { ok: false, reason: destinationSnap.reason };

  const graph = cloneGraph(getCachedRoutingGraph());
  const [originX, originY] = transformWgs84ToEpsg5183(...input.origin.coordinates);
  const [destinationX, destinationY] = transformWgs84ToEpsg5183(...input.destination.coordinates);

  const originTemp = addTempNode(graph, 'temp_origin', originX, originY, input.origin.level);
  const destinationTemp = addTempNode(
    graph,
    'temp_destination',
    destinationX,
    destinationY,
    input.destination.level,
  );

  connectTempNodeToArea(graph, originTemp, originX, originY, originTemp.level);
  connectTempNodeToArea(graph, destinationTemp, destinationX, destinationY, destinationTemp.level);

  const shortest = findShortestPath(graph, originTemp.id, destinationTemp.id, input.accessibilityMode);
  if (!shortest) return { ok: false, reason: 'NO_PATH_FOUND' };

  const metrics = buildSinglePathMetrics(graph, shortest.nodeIds);

  const usedStairsFallback =
    input.accessibilityMode === 'elevator_priority' && metrics.usedStairConnector;

  return {
    ok: true,
    floorSegments: metrics.floorSegments,
    totalDistanceMeters: metrics.totalDistanceMeters,
    estimatedTimeSeconds: metrics.estimatedTimeSeconds,
    effortMeters: metrics.effortMeters,
    effortScore: metrics.effortMeters / 100,
    connectorStats: metrics.connectorStats,
    usedStairsFallback,
    originPoint: { x: originX, y: originY, level: input.origin.level },
    destinationPoint: { x: destinationX, y: destinationY, level: input.destination.level },
    ...(usedStairsFallback
      ? { warning: '이 경로는 계단을 포함합니다. 엘리베이터 경로를 찾을 수 없습니다.' }
      : {}),
  };
}

// ── Multi-option engine entrypoint ─────────────────────────────────

/**
 * Compute a diverse set of route options between origin and destination.
 *
 * Internally installs temp_origin / temp_destination nodes into a cloned
 * graph, then delegates to `computeRouteOptionSet` which runs the Yen-based
 * multi-profile pipeline (dedupe → diversity filter → Pareto → balanced rank).
 */
export function computeRouteOptions(input: {
  origin: RouteOrigin;
  destination: RouteDestination;
}): RouteOption[] {
  const baseGraph = getCachedRoutingGraph();
  if (baseGraph.nodes.size === 0) {
    console.warn('[routeComputer] Graph is EMPTY — buildRoutingGraph may have failed');
    return [];
  }
  console.log(
    '[routeComputer] Graph stats:',
    baseGraph.nodes.size,
    'nodes,',
    baseGraph.edges.length,
    'edges',
  );

  const originSnap = resolveAndSnap(input.origin);
  if (!originSnap.ok) {
    console.warn('[routeComputer] Origin snap failed:', originSnap.reason, {
      level: input.origin.level,
      coordinates: input.origin.coordinates,
    });
    return [];
  }

  const destinationSnap = resolveAndSnap(input.destination);
  if (!destinationSnap.ok) {
    console.warn('[routeComputer] Destination snap failed:', destinationSnap.reason, {
      level: input.destination.level,
      coordinates: input.destination.coordinates,
    });
    return [];
  }

  const [originX, originY] = transformWgs84ToEpsg5183(...input.origin.coordinates);
  const [destinationX, destinationY] = transformWgs84ToEpsg5183(...input.destination.coordinates);

  const originSnappedNode = baseGraph.nodes.get(originSnap.nodeId);
  const destinationSnappedNode = baseGraph.nodes.get(destinationSnap.nodeId);
  console.log(
    '[routeComputer] Snap OK — origin:',
    originSnap.nodeId,
    'dest:',
    destinationSnap.nodeId,
    'originDistanceM:',
    originSnappedNode ? euclidean(originX, originY, originSnappedNode.x, originSnappedNode.y) : 'unknown',
    'destDistanceM:',
    destinationSnappedNode
      ? euclidean(destinationX, destinationY, destinationSnappedNode.x, destinationSnappedNode.y)
      : 'unknown',
  );

  // Clone the graph so temp nodes/edges installed for this request don't leak
  // into subsequent requests (the cached graph is shared).
  const graph = cloneGraph(baseGraph);

  const originTemp = addTempNode(graph, 'temp_origin', originX, originY, input.origin.level);
  const destinationTemp = addTempNode(
    graph,
    'temp_destination',
    destinationX,
    destinationY,
    input.destination.level,
  );

  connectTempNodeToArea(graph, originTemp, originX, originY, originTemp.level);
  connectTempNodeToArea(graph, destinationTemp, destinationX, destinationY, destinationTemp.level);

  try {
    return computeRouteOptionSet(
      graph,
      originTemp.id,
      destinationTemp.id,
      { x: originX, y: originY, level: input.origin.level },
      { x: destinationX, y: destinationY, level: input.destination.level },
    );
  } catch (e) {
    console.warn('[routeComputer] computeRouteOptionSet failed:', e);
    return [];
  }
}

// ── Single-path metric helper (used by the legacy fallback) ─────────

function buildSinglePathMetrics(
  graph: RouteGraph,
  nodeIds: string[],
): {
  floorSegments: RouteFloorSegment[];
  totalDistanceMeters: number;
  estimatedTimeSeconds: number;
  effortMeters: number;
  connectorStats: RouteConnectorStats;
  usedStairConnector: boolean;
} {
  const outgoing = new Map<string, RouteEdge[]>();
  for (const edge of graph.edges) {
    let list = outgoing.get(edge.from);
    if (!list) {
      list = [];
      outgoing.set(edge.from, list);
    }
    list.push(edge);
  }

  let totalDistanceMeters = 0;
  let estimatedTimeSeconds = 0;
  let effortMeters = 0;
  let usedStairConnector = false;
  const connectorStats: RouteConnectorStats = {
    stairAscentFloors: 0,
    stairDescentFloors: 0,
    elevatorRideCount: 0,
    floorChangeCount: 0,
  };

  const segments: RouteFloorSegment[] = [];
  let current: RouteFloorSegment | null = null;

  for (let i = 0; i < nodeIds.length; i++) {
    const id = nodeIds[i];
    const node = graph.nodes.get(id);
    if (!node) continue;

    const isTemp =
      node.nodeType === 'temp_origin' || node.nodeType === 'temp_destination';

    if (!isTemp) {
      if (!current || current.level !== node.level) {
        current = { level: node.level, nodeIds: [id], distanceMeters: 0 };
        segments.push(current);
      } else {
        current.nodeIds.push(id);
      }
    }

    if (i === nodeIds.length - 1) break;

    const nextId = nodeIds[i + 1];
    const edge = outgoing.get(id)?.find((e) => e.to === nextId);
    if (!edge) continue;

    if (edge.edgeType === 'walk') {
      totalDistanceMeters += edge.distanceMeters;
      estimatedTimeSeconds += edge.timeSeconds;
      effortMeters += edge.effortMetersEquivalent;
      if (current && !isTemp) current.distanceMeters += edge.distanceMeters;
    } else {
      estimatedTimeSeconds += edge.timeSeconds;
      effortMeters += edge.effortMetersEquivalent;
      if (edge.accessibilityPenalty > 0) usedStairConnector = true;

      const meta = edge.connectorMeta;
      if (meta) {
        const [fromLevel, toLevel] = meta.connectsLevels;
        const floorDelta = Math.abs(toLevel - fromLevel);
        connectorStats.floorChangeCount += floorDelta;
        if (meta.connectorType === 'stair') {
          connectorStats.stairAscentFloors += Math.max(0, toLevel - fromLevel);
          connectorStats.stairDescentFloors += Math.max(0, fromLevel - toLevel);
        } else {
          connectorStats.elevatorRideCount += 1;
        }
      }

      if (current && edge.connectorId) {
        const fromNode = graph.nodes.get(id);
        const toNode = graph.nodes.get(nextId);
        if (fromNode && toNode) {
          current.connectorTransition = {
            connectorId: edge.connectorId,
            fromLevel: fromNode.level,
            toLevel: toNode.level,
          };
        }
      }
    }
  }

  const floorSegments = segments.filter((s) => s.nodeIds.length > 0);
  void computeConnectorEffortMeters;
  void effortCoefficients;

  return {
    floorSegments,
    totalDistanceMeters,
    estimatedTimeSeconds,
    effortMeters,
    connectorStats,
    usedStairConnector,
  };
}
