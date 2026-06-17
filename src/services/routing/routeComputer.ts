import { buildRoutingGraph } from './graphBuilder';
import { findShortestPath } from './pathfinder';
import { WALKING_SPEED_MPS } from './constants';
import { transformWgs84ToEpsg5183 } from '../../utils/coordinateTransform';
import type {
  RouteAccessibilityMode,
  RouteDestination,
  RouteGraph,
  RouteOption,
  RouteOrigin,
  RouteResult,
} from '../../types/routing';

import { cloneGraph, addTempNode, connectTempNodeToArea } from './routeComputerInternal/graphTempOps';
import { buildFloorSegments, finalizeFloorSegments } from './routeComputerInternal/floorSegments';
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

export function computeRoute(input: {
  origin: RouteOrigin;
  destination: RouteDestination;
  accessibilityMode: RouteAccessibilityMode;
}): RouteResult {
  const originSnap = resolveAndSnap(input.origin);
  if (!originSnap.ok) {
    return { ok: false, reason: originSnap.reason };
  }

  const destinationSnap = resolveAndSnap(input.destination);
  if (!destinationSnap.ok) {
    return { ok: false, reason: destinationSnap.reason };
  }

  const graph = cloneGraph(getCachedRoutingGraph());
  const [originX, originY] = transformWgs84ToEpsg5183(...input.origin.coordinates);
  const [destinationX, destinationY] = transformWgs84ToEpsg5183(
    ...input.destination.coordinates,
  );

  const originTemp = addTempNode(
    graph,
    'temp_origin',
    originX,
    originY,
    input.origin.level,
  );
  const destinationTemp = addTempNode(
    graph,
    'temp_destination',
    destinationX,
    destinationY,
    input.destination.level,
  );

  connectTempNodeToArea(graph, originTemp, originX, originY, originTemp.level);
  connectTempNodeToArea(
    graph,
    destinationTemp,
    destinationX,
    destinationY,
    destinationTemp.level,
  );

  const shortest = findShortestPath(
    graph,
    originTemp.id,
    destinationTemp.id,
    input.accessibilityMode,
  );

  if (!shortest) {
    return { ok: false, reason: 'NO_PATH_FOUND' };
  }

  const {
    floorSegments: rawSegments,
    totalDistanceMeters,
    connectorTraversalSeconds,
    usedStairConnector,
  } = buildFloorSegments(graph, shortest.nodeIds);
  const floorSegments = finalizeFloorSegments(
    rawSegments,
    originSnap,
    destinationSnap,
    input.origin.level,
    totalDistanceMeters,
  );

  const estimatedTimeSeconds = totalDistanceMeters / WALKING_SPEED_MPS + connectorTraversalSeconds;
  const usedStairsFallback = input.accessibilityMode === 'elevator_priority' && usedStairConnector;

  const result: RouteResult = {
    ok: true,
    floorSegments,
    totalDistanceMeters,
    estimatedTimeSeconds,
    usedStairsFallback,
    originPoint: { x: originX, y: originY, level: input.origin.level },
    destinationPoint: { x: destinationX, y: destinationY, level: input.destination.level },
    ...(usedStairsFallback
      ? {
          warning: '이 경로는 계단을 포함합니다. 엘리베이터 경로를 찾을 수 없습니다.',
        }
      : {}),
  };

  return result;
}

export function computeRouteOptions(input: {
  origin: RouteOrigin
  destination: RouteDestination
}): RouteOption[] {
  // Snap origin and destination once (mode-independent)
  const baseGraph = getCachedRoutingGraph()
  if (baseGraph.nodes.size === 0) {
    console.warn('[routeComputer] Graph is EMPTY — buildRoutingGraph may have failed')
    return []
  }
  const [originX, originY] = transformWgs84ToEpsg5183(...input.origin.coordinates)
  const [destinationX, destinationY] = transformWgs84ToEpsg5183(
    ...input.destination.coordinates,
  )

  const originSnap = resolveAndSnap(input.origin)
  if (!originSnap.ok) {
    console.warn('[routeComputer] Origin snap failed:', originSnap.reason, {
      level: input.origin.level,
      coordinates: input.origin.coordinates,
    })
    return []
  }

  const destinationSnap = resolveAndSnap(input.destination)
  if (!destinationSnap.ok) {
    console.warn('[routeComputer] Destination snap failed:', destinationSnap.reason, {
      level: input.destination.level,
      coordinates: input.destination.coordinates,
    })
    return []
  }

  const options: RouteOption[] = []
  const modes: RouteAccessibilityMode[] = ['normal', 'elevator_priority']

  for (const mode of modes) {
    try {
      const graph = cloneGraph(baseGraph)

      const originTemp = addTempNode(graph, 'temp_origin', originX, originY, input.origin.level)
      const destinationTemp = addTempNode(
        graph,
        'temp_destination',
        destinationX,
        destinationY,
        input.destination.level,
      )

      connectTempNodeToArea(
        graph,
        originTemp,
        originX,
        originY,
        originTemp.level,
      )
      connectTempNodeToArea(
        graph,
        destinationTemp,
        destinationX,
        destinationY,
        destinationTemp.level,
      )

      const shortest = findShortestPath(graph, originTemp.id, destinationTemp.id, mode)

      if (!shortest) {
        continue
      }

      const {
        floorSegments: rawSegments,
        totalDistanceMeters,
        connectorTraversalSeconds,
        usedStairConnector,
      } = buildFloorSegments(graph, shortest.nodeIds)

      const floorSegments = finalizeFloorSegments(
        rawSegments,
        originSnap,
        destinationSnap,
        input.origin.level,
        totalDistanceMeters,
      )

      const estimatedTimeSeconds =
        totalDistanceMeters / WALKING_SPEED_MPS + connectorTraversalSeconds
      const usedStairsFallback = mode === 'elevator_priority' && usedStairConnector

      const result: RouteResult = {
        ok: true,
        floorSegments,
        totalDistanceMeters,
        estimatedTimeSeconds,
        usedStairsFallback,
        originPoint: { x: originX, y: originY, level: input.origin.level },
        destinationPoint: { x: destinationX, y: destinationY, level: input.destination.level },
        ...(usedStairsFallback
          ? {
              warning: '이 경로는 계단을 포함합니다. 엘리베이터 경로를 찾을 수 없습니다.',
            }
          : {}),
      }

      const isDuplicate = options.some(
        (o) =>
          o.result.ok &&
          Math.abs(o.result.totalDistanceMeters - result.totalDistanceMeters) < 0.1 &&
          o.result.floorSegments.length === result.floorSegments.length,
      )

      if (!isDuplicate) {
        options.push({
          id: mode === 'normal' ? 'shortest' : 'elevator_priority',
          label: mode === 'normal' ? '최단 경로' : '엘리베이터 우선',
          accessibilityMode: mode,
          result,
        })
      }
    } catch (_e) {
      console.warn(`[routeComputer] computeRouteOptions mode ${mode} failed:`, _e)
      continue
    }
  }

  return options
}
