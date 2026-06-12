/**
 * graphValidator.test.ts
 *
 * Tests for the routing graph validator.
 *
 * Covers:
 *   - Real graph: zero errors reported
 *   - Dangling edge reference → validator catches it
 *   - Orphan node → validator catches it
 *   - Wrong accessibility penalty on stair/elevator → validator catches it
 *   - Invalid polygon node level → validator catches it
 */

import { validateGraph } from '../graphValidator';
import { buildRoutingGraph } from '../graphBuilder';
import type { RouteGraph, RouteNode, RouteEdge } from '../../../types/routing';

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Create a minimal valid graph with one node and one edge for use as
 * a base in fixture tests.
 */
function createBaseGraph(): RouteGraph {
  const node: RouteNode = {
    id: 'n0',
    x: 0,
    y: 0,
    level: 1,
    nodeType: 'polygon',
  };
  const edge: RouteEdge = {
    from: 'n0',
    to: 'n1',
    weightMeters: 1.5,
    level: 1,
    accessibilityPenalty: 0,
    edgeType: 'walk',
  };
  const node2: RouteNode = {
    id: 'n1',
    x: 1,
    y: 1,
    level: 1,
    nodeType: 'polygon',
  };

  const nodes = new Map<string, RouteNode>();
  nodes.set(node.id, node);
  nodes.set(node2.id, node2);

  const adjacency = new Map<string, string[]>();
  adjacency.set(node.id, [node2.id]);
  adjacency.set(node2.id, [node.id]);

  return { nodes, edges: [edge], adjacency };
}

// ── Tests ────────────────────────────────────────────────────────────

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
    graph.edges.push({
      from: 'nonexistent-node',
      to: 'n0',
      weightMeters: 1,
      level: 1,
      accessibilityPenalty: 0,
      edgeType: 'walk',
    });

    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('nonexistent-node'))).toBe(
      true,
    );
  });

  it('catches a dangling edge target reference', () => {
    const graph = createBaseGraph();
    graph.edges.push({
      from: 'n0',
      to: 'ghost-node',
      weightMeters: 1,
      level: 1,
      accessibilityPenalty: 0,
      edgeType: 'walk',
    });

    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('ghost-node'))).toBe(true);
  });
});

describe('validateGraph – edge weights', () => {
  it('catches a non-positive weight on a walk edge', () => {
    const graph = createBaseGraph();
    graph.edges.push({
      from: 'n0',
      to: 'n1',
      weightMeters: 0,
      level: 1,
      accessibilityPenalty: 0,
      edgeType: 'walk',
    });

    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('non-positive'))).toBe(true);
  });

  it('catches a NaN weight on a connector edge', () => {
    const graph = createBaseGraph();

    // Add a connector node
    const connNode: RouteNode = {
      id: 'conn-stair-0-1',
      x: 0,
      y: 0,
      level: 1,
      nodeType: 'connector',
    };
    graph.nodes.set(connNode.id, connNode);
    graph.adjacency.set(connNode.id, []);

    graph.edges.push({
      from: 'conn-stair-0-1',
      to: 'n0',
      weightMeters: Number.NaN,
      level: -1,
      connectorId: 'connector-stair-0',
      accessibilityPenalty: 5,
      edgeType: 'connector',
    });

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

    graph.edges.push({
      from: 'conn-stair-bad-1',
      to: 'n0',
      weightMeters: 15,
      level: -1,
      connectorId: 'connector-stair-bad',
      accessibilityPenalty: 0, // should be > 0
      edgeType: 'connector',
    });

    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes('accessibilityPenalty')),
    ).toBe(true);
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

    graph.edges.push({
      from: 'conn-elevator-bad-1',
      to: 'n0',
      weightMeters: 30,
      level: -1,
      connectorId: 'connector-elevator-bad',
      accessibilityPenalty: 5, // should be 0
      edgeType: 'connector',
    });

    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes('accessibilityPenalty')),
    ).toBe(true);
  });
});

describe('validateGraph – orphan nodes', () => {
  it('catches a node with no incident edges', () => {
    const graph = createBaseGraph();

    // Add a node that has no edges
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

    // Replace node n0's level with invalid value
    const n0 = graph.nodes.get('n0');
    if (n0) {
      // create a clone with a bad level
      graph.nodes.set('n0', { ...n0, level: 5 });
    }

    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    // Should mention invalid level
    expect(result.errors.some((e) => e.includes('invalid level'))).toBe(true);
  });

  it('passes for connector node at any level', () => {
    const graph = createBaseGraph();
    // Connector node with level 5 should still pass (the check is only for polygon nodes)
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
    graph.edges.push({
      from: 'conn-test',
      to: 'n-extra',
      weightMeters: 1,
      level: 1,
      accessibilityPenalty: 0,
      edgeType: 'walk',
    });

    const result = validateGraph(graph);
    // Connector at level 5 is OK, but polygon node must be 1-4
    expect(result.valid).toBe(true);
  });
});
