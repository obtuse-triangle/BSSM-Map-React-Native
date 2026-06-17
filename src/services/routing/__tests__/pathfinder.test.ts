import { buildRoutingGraph } from '../graphBuilder';
import { findShortestPath } from '../pathfinder';
import { WALKING_SPEED_MPS } from '../constants';
import type { RouteEdge, RouteGraph, RouteNode } from '../../../types/routing';

function walkEdge(from: string, to: string, distanceMeters: number, level: number): RouteEdge {
  return {
    from,
    to,
    distanceMeters,
    timeSeconds: distanceMeters / WALKING_SPEED_MPS,
    effortMetersEquivalent: distanceMeters,
    level,
    accessibilityPenalty: 0,
    edgeType: 'walk',
  };
}

function connectorEdge(
  from: string,
  to: string,
  traversalTimeSeconds: number,
  accessibilityPenalty: number,
): RouteEdge {
  return {
    from,
    to,
    distanceMeters: 0,
    timeSeconds: traversalTimeSeconds,
    effortMetersEquivalent: traversalTimeSeconds,
    level: -1,
    accessibilityPenalty,
    edgeType: 'connector',
  };
}

function createGraph(nodes: RouteNode[], edges: RouteEdge[]): RouteGraph {
  const nodeMap = new Map<string, RouteNode>();
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
    adjacency.set(node.id, []);
  }
  for (const edge of edges) {
    const list = adjacency.get(edge.from);
    if (list && !list.includes(edge.to)) list.push(edge.to);
  }
  return { nodes: nodeMap, edges, adjacency };
}

describe('findShortestPath', () => {
  it('finds the shortest path on a synthetic graph', () => {
    const graph = createGraph(
      [
        { id: 's', x: 0, y: 0, level: 1, nodeType: 'polygon' },
        { id: 'a', x: 1, y: 0, level: 1, nodeType: 'polygon' },
        { id: 'b', x: 2, y: 0, level: 1, nodeType: 'polygon' },
        { id: 't', x: 3, y: 0, level: 1, nodeType: 'polygon' },
      ],
      [
        walkEdge('s', 'a', 1, 1),
        walkEdge('a', 't', 10, 1),
        walkEdge('s', 'b', 2, 1),
        walkEdge('b', 't', 2, 1),
      ],
    );

    const result = findShortestPath(graph, 's', 't', 'normal');
    expect(result).not.toBeNull();
    expect(result?.nodeIds).toEqual(['s', 'b', 't']);
    expect(result?.totalWeight).toBeCloseTo((2 + 2) / 1.2, 2);
  });

  it('returns null for disconnected graphs', () => {
    const graph = createGraph(
      [
        { id: 'a', x: 0, y: 0, level: 1, nodeType: 'polygon' },
        { id: 'b', x: 1, y: 0, level: 1, nodeType: 'polygon' },
        { id: 'c', x: 2, y: 0, level: 1, nodeType: 'polygon' },
      ],
      [walkEdge('a', 'b', 1, 1)],
    );

    expect(findShortestPath(graph, 'a', 'c', 'normal')).toBeNull();
  });

  it('adds stair accessibility penalty in elevator_priority mode', () => {
    const graph = createGraph(
      [
        { id: 's', x: 0, y: 0, level: 1, nodeType: 'polygon' },
        { id: 'stair1', x: 1, y: 0, level: 1, nodeType: 'connector' },
        { id: 'stair2', x: 1, y: 0, level: 2, nodeType: 'connector' },
        { id: 'e1', x: 0, y: 1, level: 1, nodeType: 'connector' },
        { id: 'e2', x: 0, y: 1, level: 2, nodeType: 'connector' },
        { id: 't', x: 2, y: 0, level: 2, nodeType: 'polygon' },
      ],
      [
        walkEdge('s', 'stair1', 1, 1),
        connectorEdge('stair1', 'stair2', 2, 5),
        walkEdge('stair2', 't', 1, 2),
        walkEdge('s', 'e1', 2, 1),
        connectorEdge('e1', 'e2', 2, 0),
        walkEdge('e2', 't', 1, 2),
      ],
    );

    const normal = findShortestPath(graph, 's', 't', 'normal');
    const priority = findShortestPath(graph, 's', 't', 'elevator_priority');

    expect(normal?.nodeIds).toEqual(['s', 'stair1', 'stair2', 't']);
    expect(normal?.totalWeight).toBeCloseTo(1 / 1.2 + 2 + 1 / 1.2, 2);
    expect(priority?.nodeIds).toEqual(['s', 'e1', 'e2', 't']);
    expect(priority?.totalWeight).toBeCloseTo(2 / 1.2 + 2 + 1 / 1.2, 2);
  });

  it('is deterministic for equal-cost alternatives', () => {
    const graph = createGraph(
      [
        { id: 's', x: 0, y: 0, level: 1, nodeType: 'polygon' },
        { id: 'a', x: 1, y: 0, level: 1, nodeType: 'polygon' },
        { id: 'b', x: 1, y: 1, level: 1, nodeType: 'polygon' },
        { id: 't', x: 2, y: 0, level: 1, nodeType: 'polygon' },
      ],
      [
        walkEdge('s', 'a', 1, 1),
        walkEdge('a', 't', 1, 1),
        walkEdge('s', 'b', 1, 1),
        walkEdge('b', 't', 1, 1),
      ],
    );

    const a = findShortestPath(graph, 's', 't', 'normal');
    const b = findShortestPath(graph, 's', 't', 'normal');

    expect(a).toEqual(b);
  });

  it('uses real routing graph for same-floor routing', () => {
    const graph = buildRoutingGraph();
    const edge = graph.edges.find((e) => {
      const from = graph.nodes.get(e.from);
      const to = graph.nodes.get(e.to);
      return e.edgeType === 'walk' && from?.level === 1 && to?.level === 1;
    });

    expect(edge).toBeDefined();
    if (!edge) return;

    const result = findShortestPath(graph, edge.from, edge.to, 'normal');
    expect(result).not.toBeNull();
    expect(result?.nodeIds[0]).toBe(edge.from);
    expect(result?.nodeIds[result.nodeIds.length - 1]).toBe(edge.to);
    for (const nodeId of result?.nodeIds ?? []) {
      expect(graph.nodes.get(nodeId)?.level).toBe(1);
    }
  });

  it('uses real routing graph for cross-floor connector traversal', () => {
    const graph = buildRoutingGraph();
    const connectorEdge = graph.edges.find((e) => e.edgeType === 'connector');

    expect(connectorEdge).toBeDefined();
    if (!connectorEdge) return;

    const result = findShortestPath(
      graph,
      connectorEdge.from,
      connectorEdge.to,
      'normal',
    );

    expect(result).not.toBeNull();
    expect(result?.nodeIds).toEqual([connectorEdge.from, connectorEdge.to]);
    expect(result?.totalWeight).toBe(connectorEdge.timeSeconds);
    expect(graph.nodes.get(connectorEdge.from)?.level).not.toBe(
      graph.nodes.get(connectorEdge.to)?.level,
    );
  });
});
