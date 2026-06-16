import { buildRoutingGraph } from './graphBuilder';
import { snapToGraph } from './coordinateSnap';
import { findShortestPath } from './pathfinder';
import { WALKING_SPEED_MPS } from './constants';
import { transformWgs84ToEpsg5183 } from '../../utils/coordinateTransform';
import type {
  RouteAccessibilityMode,
  RouteDestination,
  RouteEdge,
  RouteGraph,
  RouteNode,
  RouteOption,
  RouteOrigin,
  RouteResult,
  RouteFloorSegment,
} from '../../types/routing';

type GraphWithTemps = RouteGraph;

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

function cloneGraph(graph: RouteGraph): GraphWithTemps {
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

function addBidirectionalWalkEdge(
  graph: RouteGraph,
  from: RouteNode,
  to: RouteNode,
  level: number,
  weightMeters: number,
): void {
  const forward: RouteEdge = {
    from: from.id,
    to: to.id,
    weightMeters,
    level,
    accessibilityPenalty: 0,
    edgeType: 'walk',
  };
  const backward: RouteEdge = {
    from: to.id,
    to: from.id,
    weightMeters,
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

function edgeLookup(graph: RouteGraph): Map<string, RouteEdge> {
  const lookup = new Map<string, RouteEdge>();
  for (const edge of graph.edges) {
    lookup.set(`${edge.from}→${edge.to}`, edge);
  }
  return lookup;
}

function buildFloorSegments(
  graph: RouteGraph,
  nodeIds: string[],
): { floorSegments: RouteFloorSegment[]; totalDistanceMeters: number; connectorTraversalSeconds: number; usedStairConnector: boolean } {
  const lookup = edgeLookup(graph);
  const segments: RouteFloorSegment[] = [];
  let totalDistanceMeters = 0;
  let connectorTraversalSeconds = 0;
  let usedStairConnector = false;

  let currentSegment: RouteFloorSegment | null = null;

  for (let i = 0; i < nodeIds.length; i++) {
    const currentNodeId = nodeIds[i];
    const currentNode = graph.nodes.get(currentNodeId);
    if (!currentNode) continue;

    if (!currentSegment || currentSegment.level !== currentNode.level) {
      currentSegment = {
        level: currentNode.level,
        nodeIds: [currentNodeId],
        distanceMeters: 0,
      };
      segments.push(currentSegment);
    } else {
      currentSegment.nodeIds.push(currentNodeId);
    }

    if (i === nodeIds.length - 1) continue;

    const nextNodeId = nodeIds[i + 1];
    const nextNode = graph.nodes.get(nextNodeId);
    if (!nextNode) continue;

    const edge = lookup.get(`${currentNodeId}→${nextNodeId}`);
    if (!edge) continue;

    if (edge.edgeType === 'walk') {
      totalDistanceMeters += edge.weightMeters;
      currentSegment.distanceMeters += edge.weightMeters;
    } else {
      connectorTraversalSeconds += edge.weightMeters;
      if (edge.accessibilityPenalty > 0) usedStairConnector = true;
      currentSegment.connectorTransition = {
        connectorId: edge.connectorId ?? 'unknown-connector',
        fromLevel: currentNode.level,
        toLevel: nextNode.level,
      };
    }
  }

  return { floorSegments: segments, totalDistanceMeters, connectorTraversalSeconds, usedStairConnector };
}

function stripTempNodes(
  segments: RouteFloorSegment[],
): RouteFloorSegment[] {
  return segments
    .map((seg) => ({
      ...seg,
      nodeIds: seg.nodeIds.filter(
        (id) => !id.startsWith('temp_origin') && !id.startsWith('temp_destination'),
      ),
    }))
    .filter((seg) => seg.nodeIds.length > 0);
}

function finalizeFloorSegments(
  rawSegments: RouteFloorSegment[],
  originSnap: { nodeId: string },
  destinationSnap: { nodeId: string },
  fallbackLevel: number,
  totalDistanceMeters: number,
): RouteFloorSegment[] {
  const floorSegments = stripTempNodes(rawSegments);

  if (floorSegments.length === 0) {
    floorSegments.push({
      level: fallbackLevel,
      nodeIds: [originSnap.nodeId, destinationSnap.nodeId],
      distanceMeters: totalDistanceMeters,
    });
  }

  for (const seg of floorSegments) {
    if (seg.nodeIds.length === 1) {
      if (!seg.nodeIds.includes(originSnap.nodeId)) seg.nodeIds.push(originSnap.nodeId);
      else if (!seg.nodeIds.includes(destinationSnap.nodeId)) seg.nodeIds.push(destinationSnap.nodeId);
      if (seg.nodeIds.length === 1) seg.nodeIds.push(seg.nodeIds[0]);
    }
  }

  return floorSegments;
}

function resolveAndSnap(
  input: RouteOrigin | RouteDestination,
): { ok: true; nodeId: string; x: number; y: number } | { ok: false; reason: string } {
  const [lon, lat] = input.coordinates;
  const accuracy = 'type' in input && input.type === 'user_location' ? input.accuracy : undefined;
  return snapToGraph(lon, lat, input.level, accuracy);
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
  console.log('[routeComputer] Graph stats:', baseGraph.nodes.size, 'nodes,', baseGraph.edges.length, 'edges')

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

  const originSnappedNode = baseGraph.nodes.get(originSnap.nodeId)
  const destinationSnappedNode = baseGraph.nodes.get(destinationSnap.nodeId)
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
  )

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
