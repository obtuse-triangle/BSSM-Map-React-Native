import { buildRoutingGraph } from './graphBuilder';
import { findShortestPath } from './pathfinder';
import { computeRouteOptionSet } from './routeOptions';
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
import { cloneGraph, addTempNode, connectTempNodeToArea } from './routeComputerInternal/graphTempOps';
import { resolveAndSnap } from './routeComputerInternal/snapResolver';

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

/**
 * Single-route entry point.
 *
 * Delegates to the multi-option engine and returns the option matching the
 * requested accessibility mode (or the top-ranked option). Falls back to a
 * bare-bones Dijkstra run if the option engine produces nothing.
 */
export function computeRoute(input: {
  origin: RouteOrigin;
  destination: RouteDestination;
  accessibilityMode: RouteAccessibilityMode;
}): RouteResult {
  const options = computeRouteOptions({ origin: input.origin, destination: input.destination });
  if (options.length === 0) {
    return computeRouteLegacy(input);
  }

  const matchingMode = options.find((o) => o.accessibilityMode === input.accessibilityMode);
  if (!matchingMode) {
    return computeRouteLegacy(input);
  }
  return matchingMode.result;
}

/**
 * Bare-bones Dijkstra fallback — used only when the multi-option engine
 * yields nothing (e.g. graph too sparse for Yen to find alternatives).
 * Returns a single shortest-path RouteResult with effort and connector stats.
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

  const shortest = findShortestPath(
    graph,
    originTemp.id,
    destinationTemp.id,
    input.accessibilityMode,
  );
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

/**
 * Compute a diverse set of route options between origin and destination.
 *
 * Delegates to `computeRouteOptionSet` which runs the Yen-based multi-profile
 * pipeline (dedupe → diversity filter → Pareto → balanced rank).
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

// ── Single-path metric helper (used by computeRouteLegacy) ──────────

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
    const node = graph.nodes.get(id) as RouteNode | undefined;
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

  return {
    floorSegments: segments.filter((s) => s.nodeIds.length > 0),
    totalDistanceMeters,
    estimatedTimeSeconds,
    effortMeters,
    connectorStats,
    usedStairConnector,
  };
}
