import type {
  RouteEdge,
  RouteFloorSegment,
  RouteGraph,
} from '../../../types/routing';

export function edgeLookup(graph: RouteGraph): Map<string, RouteEdge> {
  const lookup = new Map<string, RouteEdge>();
  for (const edge of graph.edges) {
    lookup.set(`${edge.from}→${edge.to}`, edge);
  }
  return lookup;
}

export function buildFloorSegments(
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
      totalDistanceMeters += edge.distanceMeters;
      currentSegment.distanceMeters += edge.distanceMeters;
    } else {
      connectorTraversalSeconds += edge.timeSeconds;
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

export function stripTempNodes(
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

export function finalizeFloorSegments(
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
