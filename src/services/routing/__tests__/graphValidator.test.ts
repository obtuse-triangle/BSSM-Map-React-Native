/**
 * graphValidator.test.ts
 *
 * Tests for the routing graph validator.
 */

import { validateGraph } from '../graphValidator';
import { buildRoutingGraph } from '../graphBuilder';
import { WALKING_SPEED_MPS } from '../constants';
import type { RouteGraph, RouteNode, RouteEdge } from '../../../types/routing';

function walkEdge(from: string, to: string, distanceMeters: number, level: number = 1): RouteEdge {
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
  connectorId: string,
): RouteEdge {
  return {
    from,
    to,
    distanceMeters: 0,
    timeSeconds: traversalTimeSeconds,
    effortMetersEquivalent: traversalTimeSeconds,
    level: -1,
    connectorId,
    accessibilityPenalty,
    edgeType: 'connector',
  };
}

function createBaseGraph(): RouteGraph {
  const node: RouteNode = { id: 'n0', x: 0, y: 0, level: 1, nodeType: 'polygon' };
  const node2: RouteNode = { id: 'n1', x: 1, y: 1, level: 1, nodeType: 'polygon' };
  const edge = walkEdge('n0', 'n1', 1.5);

  const nodes = new Map<string, RouteNode>();
  nodes.set(node.id, node);
  nodes.set(node2.id, node2);

  const adjacency = new Map<string, string[]>();
  adjacency.set(node.id, [node2.id]);
  adjacency.set(node2.id, [node.id]);

  return { nodes, edges: [edge], adjacency };
}

describe('validateGraph – real graph', () => {
  let validationResult: ReturnType<typeof validateGraph>;

  beforeAll(() => {
    const graph = buildRoutingGraph();
    validationResult = validateGraph(graph);
  });

  it('reports zero errors for the real built graph', () => {
    expect(validationResult.valid).toBe(true);
    expect(validationResult.errors).toEqual([]);
  });
});

describe('validateGraph – edge node references', () => {
  it('catches a dangling edge source reference', () => {
    const graph = createBaseGraph();
    graph.edges.push(walkEdge('nonexistent-node', 'n0', 1));

    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('nonexistent-node'))).toBe(true);
  });

  it('catches a dangling edge target reference', () => {
    const graph = createBaseGraph();
    graph.edges.push(walkEdge('n0', 'ghost-node', 1));

    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('ghost-node'))).toBe(true);
  });
});

describe('validateGraph – edge weights', () => {
  it('catches a non-positive weight on a walk edge', () => {
    const graph = createBaseGraph();
    const badEdge = walkEdge('n0', 'n1', 0);
    graph.edges.push(badEdge);

    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('non-positive'))).toBe(true);
  });

  it('catches a NaN weight on a connector edge', () => {
    const graph = createBaseGraph();

    const connNode: RouteNode = {
      id: 'conn-stair-0-1',
      x: 0,
      y: 0,
      level: 1,
      nodeType: 'connector',
    };
    graph.nodes.set(connNode.id, connNode);
    graph.adjacency.set(connNode.id, []);

    const badEdge: RouteEdge = {
      ...connectorEdge('conn-stair-0-1', 'n0', 10, 5, 'connector-stair-0'),
      timeSeconds: Number.NaN,
    };
    graph.edges.push(badEdge);

    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('non-positive'))).toBe(true);
  });
});

describe('validateGraph – accessibility penalties', () => {
  it('catches stair connector with non-positive penalty', () => {
    const graph = createBaseGraph();

    const connNode: RouteNode = {
      id: 'conn-stair-bad-1',
      x: 0,
      y: 0,
      level: 1,
      nodeType: 'connector',
    };
    graph.nodes.set(connNode.id, connNode);
    graph.adjacency.set(connNode.id, []);

    graph.edges.push(
      connectorEdge('conn-stair-bad-1', 'n0', 15, 0, 'connector-stair-bad'),
    );

    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('accessibilityPenalty'))).toBe(true);
  });

  it('catches elevator connector with non-zero penalty', () => {
    const graph = createBaseGraph();

    const connNode: RouteNode = {
      id: 'conn-elevator-bad-1',
      x: 0,
      y: 0,
      level: 1,
      nodeType: 'connector',
    };
    graph.nodes.set(connNode.id, connNode);
    graph.adjacency.set(connNode.id, []);

    graph.edges.push(
      connectorEdge('conn-elevator-bad-1', 'n0', 30, 5, 'connector-elevator-bad'),
    );

    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('accessibilityPenalty'))).toBe(true);
  });
});

describe('validateGraph – orphan nodes', () => {
  it('catches a node with no incident edges', () => {
    const graph = createBaseGraph();

    graph.nodes.set('orphan-node', {
      id: 'orphan-node',
      x: 99,
      y: 99,
      level: 1,
      nodeType: 'polygon',
    });
    graph.adjacency.set('orphan-node', []);

    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Orphan'))).toBe(true);
    expect(result.errors.some((e) => e.includes('orphan-node'))).toBe(true);
  });
});

describe('validateGraph – node levels', () => {
  it('catches a polygon node with invalid level', () => {
    const graph = createBaseGraph();

    const n0 = graph.nodes.get('n0');
    if (n0) {
      graph.nodes.set('n0', { ...n0, level: 5 });
    }

    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('invalid level'))).toBe(true);
  });

  it('passes for connector node at any level', () => {
    const graph = createBaseGraph();
    graph.nodes.set('conn-test', {
      id: 'conn-test',
      x: 0,
      y: 0,
      level: 5,
      nodeType: 'connector',
    });
    graph.nodes.set('n-extra', {
      id: 'n-extra',
      x: 0,
      y: 0,
      level: 1,
      nodeType: 'polygon',
    });
    graph.adjacency.set('conn-test', []);
    graph.adjacency.set('n-extra', []);
    graph.edges.push(walkEdge('conn-test', 'n-extra', 1));

    const result = validateGraph(graph);
    expect(result.valid).toBe(true);
  });
});
