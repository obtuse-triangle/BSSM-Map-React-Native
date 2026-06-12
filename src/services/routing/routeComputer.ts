import { buildRoutingGraph } from './graphBuilder';
import { snapToGraph } from './coordinateSnap';
import { findShortestPath } from './pathfinder';
import { transformWgs84ToEpsg5183 } from '../../utils/coordinateTransform';
import type {
  RouteAccessibilityMode,
  RouteDestination,
  RouteEdge,
  RouteGraph,
  RouteNode,
  RouteOrigin,
  RouteResult,
  RouteFloorSegment,
} from '../../types/routing';

const WALKING_SPEED_MPS = 1.4;

type GraphWithTemps = RouteGraph;

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

function connectTempNodeToSnap(
  graph: RouteGraph,
  tempNode: RouteNode,
  snappedNodeId: string,
  tempX: number,
  tempY: number,
): void {
  const snappedNode = graph.nodes.get(snappedNodeId);
  if (!snappedNode) return;

  const snappedDistance = euclidean(tempX, tempY, snappedNode.x, snappedNode.y);
  addBidirectionalWalkEdge(graph, tempNode, snappedNode, snappedNode.level, snappedDistance);

  const neighbours = graph.adjacency.get(snappedNodeId) ?? [];
  const sameFloorNeighbours = neighbours
    .map((id) => graph.nodes.get(id))
    .filter((node): node is RouteNode => {
      if (!node) return false;
      return (
        node.level === snappedNode.level &&
        node.nodeType !== 'temp_origin' &&
        node.nodeType !== 'temp_destination'
      );
    });

  for (const neighbour of sameFloorNeighbours) {
    const neighbourDistance = euclidean(tempX, tempY, neighbour.x, neighbour.y);
    addBidirectionalWalkEdge(graph, tempNode, neighbour, snappedNode.level, neighbourDistance);
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
      currentSegment = null;
    }
  }

  return { floorSegments: segments, totalDistanceMeters, connectorTraversalSeconds, usedStairConnector };
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

  const graph = cloneGraph(buildRoutingGraph());
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

  connectTempNodeToSnap(graph, originTemp, originSnap.nodeId, originX, originY);
  connectTempNodeToSnap(
    graph,
    destinationTemp,
    destinationSnap.nodeId,
    destinationX,
    destinationY,
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

  const { floorSegments, totalDistanceMeters, connectorTraversalSeconds, usedStairConnector } =
    buildFloorSegments(graph, shortest.nodeIds);

  const estimatedTimeSeconds = totalDistanceMeters / WALKING_SPEED_MPS + connectorTraversalSeconds;
  const usedStairsFallback = input.accessibilityMode === 'elevator_priority' && usedStairConnector;

  const result: RouteResult = {
    ok: true,
    floorSegments,
    totalDistanceMeters,
    estimatedTimeSeconds,
    usedStairsFallback,
    ...(usedStairsFallback
      ? {
          warning: '이 경로는 계단을 포함합니다. 엘리베이터 경로를 찾을 수 없습니다.',
        }
      : {}),
  };

  return result;
}
