const mockBuildRoutingGraph = jest.fn();
const mockSnapToGraph = jest.fn();
const mockTransformWgs84ToEpsg5183 = jest.fn((lon: number, lat: number) => [lon, lat] as [number, number]);

jest.mock('../graphBuilder', () => ({
  buildRoutingGraph: (...args: unknown[]) => mockBuildRoutingGraph(...args),
}));

jest.mock('../coordinateSnap', () => ({
  snapToGraph: (...args: unknown[]) => mockSnapToGraph(...args),
}));

jest.mock('../../../utils/coordinateTransform', () => ({
  transformWgs84ToEpsg5183: (...args: unknown[]) => mockTransformWgs84ToEpsg5183(...args),
}));

import type { RouteEdge, RouteGraph, RouteNode } from '../../../types/routing';
import { computeRoute } from '../routeComputer';

function createGraph(nodes: RouteNode[], edges: RouteEdge[]): RouteGraph {
  const nodeMap = new Map<string, RouteNode>();
  const adjacency = new Map<string, string[]>();

  for (const node of nodes) {
    nodeMap.set(node.id, node);
    adjacency.set(node.id, []);
  }

  for (const edge of edges) {
    const list = adjacency.get(edge.from);
    if (list && !list.includes(edge.to)) {
      list.push(edge.to);
    }
  }

  return { nodes: nodeMap, edges, adjacency };
}

function node(id: string, x: number, y: number, level: number, nodeType: RouteNode['nodeType']): RouteNode {
  return { id, x, y, level, nodeType };
}

function walk(from: string, to: string, weightMeters: number, level: number): RouteEdge {
  return {
    from,
    to,
    weightMeters,
    level,
    accessibilityPenalty: 0,
    edgeType: 'walk',
  };
}

function connector(
  from: string,
  to: string,
  weightMeters: number,
  connectorId: string,
  accessibilityPenalty: number,
): RouteEdge {
  return {
    from,
    to,
    weightMeters,
    level: -1,
    connectorId,
    accessibilityPenalty,
    edgeType: 'connector',
  };
}

describe('computeRoute', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTransformWgs84ToEpsg5183.mockImplementation((lon: number, lat: number) => [lon, lat]);
  });

  it('returns one segment for a same-floor route', () => {
    const graph = createGraph(
      [
        node('a', 0, 0, 1, 'polygon'),
        node('b', 10, 0, 1, 'polygon'),
      ],
      [walk('a', 'b', 10, 1), walk('b', 'a', 10, 1)],
    );

    mockBuildRoutingGraph.mockReturnValue(graph);
    mockSnapToGraph.mockImplementation((lon: number, _lat: number, level: number) => {
      if (lon === 0 && level === 1) return { ok: true, nodeId: 'a', x: 0, y: 0 };
      if (lon === 10 && level === 1) return { ok: true, nodeId: 'b', x: 10, y: 0 };
      return { ok: false, reason: 'SNAP_OUT_OF_RANGE' };
    });

    const result = computeRoute({
      origin: { type: 'selected_place', featureId: 'room-a', coordinates: [0, 0], level: 1 },
      destination: { featureId: 'room-b', coordinates: [10, 0], level: 1 },
      accessibilityMode: 'normal',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.floorSegments).toHaveLength(1);
    expect(result.floorSegments[0].level).toBe(1);
    expect(result.floorSegments[0].connectorTransition).toBeUndefined();
    expect(result.usedStairsFallback).toBe(false);
  });

  it('returns multiple segments and a connector transition for cross-floor routes', () => {
    const graph = createGraph(
      [
        node('o', 0, 0, 1, 'polygon'),
        node('stair-1', 2, 0, 1, 'connector'),
        node('stair-2', 2, 0, 2, 'connector'),
        node('d', 5, 0, 2, 'polygon'),
      ],
      [
        walk('o', 'stair-1', 2, 1),
        walk('stair-1', 'o', 2, 1),
        connector('stair-1', 'stair-2', 15, 'stair-connector', 5),
        connector('stair-2', 'stair-1', 15, 'stair-connector', 5),
        walk('stair-2', 'd', 3, 2),
        walk('d', 'stair-2', 3, 2),
      ],
    );

    mockBuildRoutingGraph.mockReturnValue(graph);
    mockSnapToGraph.mockImplementation((lon: number, _lat: number, level: number) => {
      if (lon === 0 && level === 1) return { ok: true, nodeId: 'o', x: 0, y: 0 };
      if (lon === 5 && level === 2) return { ok: true, nodeId: 'd', x: 5, y: 0 };
      return { ok: false, reason: 'SNAP_OUT_OF_RANGE' };
    });

    const result = computeRoute({
      origin: { type: 'user_location', coordinates: [0, 0], level: 1, accuracy: 10 },
      destination: { featureId: 'room-d', coordinates: [5, 0], level: 2 },
      accessibilityMode: 'normal',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.floorSegments.length).toBeGreaterThanOrEqual(2);
    expect(result.floorSegments[0].connectorTransition).toEqual({
      connectorId: 'stair-connector',
      fromLevel: 1,
      toLevel: 2,
    });
    expect(result.usedStairsFallback).toBe(false);
    expect(result.totalDistanceMeters).toBeCloseTo(5);
    expect(result.estimatedTimeSeconds).toBeCloseTo(5 / 1.2 + 15);
  });

  it('prefers elevator paths when accessibility mode is elevator_priority', () => {
    const graph = createGraph(
      [
        node('o', 0, 0, 1, 'polygon'),
        node('s1', 1, 0, 1, 'connector'),
        node('s2', 1, 0, 2, 'connector'),
        node('e1', 2, 0, 1, 'connector'),
        node('e2', 2, 0, 2, 'connector'),
        node('d', 4, 0, 2, 'polygon'),
      ],
      [
        walk('o', 's1', 1, 1),
        walk('s1', 'o', 1, 1),
        connector('s1', 's2', 5, 'stair-1', 5),
        connector('s2', 's1', 5, 'stair-1', 5),
        walk('s2', 'd', 1, 2),
        walk('d', 's2', 1, 2),
        walk('o', 'e1', 2, 1),
        walk('e1', 'o', 2, 1),
        connector('e1', 'e2', 5, 'elevator-1', 0),
        connector('e2', 'e1', 5, 'elevator-1', 0),
        walk('e2', 'd', 2, 2),
        walk('d', 'e2', 2, 2),
      ],
    );

    mockBuildRoutingGraph.mockReturnValue(graph);
    mockSnapToGraph.mockImplementation((lon: number, _lat: number, level: number) => {
      if (lon === 0 && level === 1) return { ok: true, nodeId: 'o', x: 0, y: 0 };
      if (lon === 4 && level === 2) return { ok: true, nodeId: 'd', x: 4, y: 0 };
      return { ok: false, reason: 'SNAP_OUT_OF_RANGE' };
    });

    const result = computeRoute({
      origin: { type: 'selected_place', featureId: 'room-a', coordinates: [0, 0], level: 1 },
      destination: { featureId: 'room-b', coordinates: [4, 0], level: 2 },
      accessibilityMode: 'elevator_priority',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.floorSegments.some((segment) => segment.connectorTransition?.connectorId === 'elevator-1')).toBe(true);
    expect(result.usedStairsFallback).toBe(false);
    expect(result.warning).toBeUndefined();
  });

  it('uses stairs with a fallback warning when no elevator path exists', () => {
    const graph = createGraph(
      [
        node('o', 0, 0, 1, 'polygon'),
        node('s1', 1, 0, 1, 'connector'),
        node('s2', 1, 0, 2, 'connector'),
        node('d', 2, 0, 2, 'polygon'),
      ],
      [
        walk('o', 's1', 1, 1),
        walk('s1', 'o', 1, 1),
        connector('s1', 's2', 15, 'stair-1', 5),
        connector('s2', 's1', 15, 'stair-1', 5),
        walk('s2', 'd', 1, 2),
        walk('d', 's2', 1, 2),
      ],
    );

    mockBuildRoutingGraph.mockReturnValue(graph);
    mockSnapToGraph.mockImplementation((lon: number, _lat: number, level: number) => {
      if (lon === 0 && level === 1) return { ok: true, nodeId: 'o', x: 0, y: 0 };
      if (lon === 2 && level === 2) return { ok: true, nodeId: 'd', x: 2, y: 0 };
      return { ok: false, reason: 'SNAP_OUT_OF_RANGE' };
    });

    const result = computeRoute({
      origin: { type: 'user_location', coordinates: [0, 0], level: 1, accuracy: 10 },
      destination: { featureId: 'room-d', coordinates: [2, 0], level: 2 },
      accessibilityMode: 'elevator_priority',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.usedStairsFallback).toBe(true);
    expect(result.warning).toBe('이 경로는 계단을 포함합니다. 엘리베이터 경로를 찾을 수 없습니다.');
  });

  it('returns NO_PATH_FOUND when the graph is disconnected', () => {
    const graph = createGraph(
      [
        node('o', 0, 0, 1, 'polygon'),
        node('d', 20, 0, 2, 'polygon'),
      ],
      [],
    );

    mockBuildRoutingGraph.mockReturnValue(graph);
    mockSnapToGraph.mockImplementation((lon: number, _lat: number, level: number) => {
      if (lon === 0 && level === 1) return { ok: true, nodeId: 'o', x: 0, y: 0 };
      if (lon === 20 && level === 2) return { ok: true, nodeId: 'd', x: 20, y: 0 };
      return { ok: false, reason: 'SNAP_OUT_OF_RANGE' };
    });

    const result = computeRoute({
      origin: { type: 'selected_place', featureId: 'room-a', coordinates: [0, 0], level: 1 },
      destination: { featureId: 'room-b', coordinates: [20, 0], level: 2 },
      accessibilityMode: 'normal',
    });

    expect(result).toEqual({ ok: false, reason: 'NO_PATH_FOUND' });
  });

  it('returns SNAP_OUT_OF_RANGE when the origin snap fails', () => {
    const graph = createGraph([node('d', 20, 0, 2, 'polygon')], []);

    mockBuildRoutingGraph.mockReturnValue(graph);
    mockSnapToGraph.mockImplementation((lon: number, _lat: number, level: number) => {
      if (lon === 20 && level === 2) return { ok: true, nodeId: 'd', x: 20, y: 0 };
      return { ok: false, reason: 'SNAP_OUT_OF_RANGE' };
    });

    const result = computeRoute({
      origin: { type: 'user_location', coordinates: [0, 0], level: 1, accuracy: 10 },
      destination: { featureId: 'room-b', coordinates: [20, 0], level: 2 },
      accessibilityMode: 'normal',
    });

    expect(result).toEqual({ ok: false, reason: 'SNAP_OUT_OF_RANGE' });
  });
});
