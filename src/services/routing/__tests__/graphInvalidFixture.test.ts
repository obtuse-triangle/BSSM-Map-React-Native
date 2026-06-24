/**
 * graphInvalidFixture.test.ts
 *
 * Captures evidence that the graphValidator correctly flags several
 * well-known invalid graph states.  Used by the evidence-capture script.
 */

import { validateGraph } from '../graphValidator';
import { buildRoutingGraph } from '../graphBuilder';
import type { RouteGraph, RouteNode, RouteEdge } from '../../../types/routing';

function makeFixtures(): { name: string; graph: RouteGraph; expectErrors: boolean }[] {
  const fixtures: { name: string; graph: RouteGraph; expectErrors: boolean }[] = [];

  // Fixture 1: dangling edge reference
  {
    const nodes = new Map<string, RouteNode>();
    nodes.set('n0', { id: 'n0', x: 0, y: 0, level: 1, nodeType: 'polygon' });
    nodes.set('n1', { id: 'n1', x: 1, y: 1, level: 1, nodeType: 'polygon' });
    const edges: RouteEdge[] = [
      { from: 'n0', to: 'ghost', distanceMeters: 1, timeSeconds: 0.8, effortMetersEquivalent: 1, level: 1, accessibilityPenalty: 0, edgeType: 'walk' },
    ];
    const adj = new Map<string, string[]>();
    adj.set('n0', ['ghost']);
    adj.set('n1', []);
    fixtures.push({ name: 'dangling edge reference', graph: { nodes, edges, adjacency: adj }, expectErrors: true });
  }

  // Fixture 2: orphan node
  {
    const nodes = new Map<string, RouteNode>();
    nodes.set('n0', { id: 'n0', x: 0, y: 0, level: 1, nodeType: 'polygon' });
    nodes.set('orphan', { id: 'orphan', x: 99, y: 99, level: 2, nodeType: 'polygon' });
    const edges: RouteEdge[] = [
      { from: 'n0', to: 'n0', distanceMeters: 1, timeSeconds: 0.8, effortMetersEquivalent: 1, level: 1, accessibilityPenalty: 0, edgeType: 'walk' },
    ];
    const adj = new Map<string, string[]>();
    adj.set('n0', ['n0']);
    adj.set('orphan', []);
    fixtures.push({ name: 'orphan node', graph: { nodes, edges, adjacency: adj }, expectErrors: true });
  }

  // Fixture 3: stair with zero accessibility penalty
  {
    const nodes = new Map<string, RouteNode>();
    nodes.set('n0', { id: 'n0', x: 0, y: 0, level: 1, nodeType: 'polygon' });
    nodes.set('c0', { id: 'c0', x: 5, y: 5, level: 1, nodeType: 'connector' });
    nodes.set('c1', { id: 'c1', x: 5, y: 5, level: 2, nodeType: 'connector' });
    const edges: RouteEdge[] = [
      { from: 'n0', to: 'c0', distanceMeters: 7, timeSeconds: 5.8, effortMetersEquivalent: 7, level: 1, accessibilityPenalty: 0, edgeType: 'walk' },
      { from: 'c0', to: 'n0', distanceMeters: 7, timeSeconds: 5.8, effortMetersEquivalent: 7, level: 1, accessibilityPenalty: 0, edgeType: 'walk' },
      { from: 'c0', to: 'c1', distanceMeters: 0, timeSeconds: 15, effortMetersEquivalent: 15, level: -1, connectorId: 'connector-stair-bad', accessibilityPenalty: 0, edgeType: 'connector' },
    ];
    const adj = new Map<string, string[]>();
    adj.set('n0', ['c0']);
    adj.set('c0', ['n0', 'c1']);
    adj.set('c1', ['c0']);
    fixtures.push({ name: 'stair with zero penalty', graph: { nodes, edges, adjacency: adj }, expectErrors: true });
  }

  // Fixture 4: polygon node at invalid level
  {
    const nodes = new Map<string, RouteNode>();
    nodes.set('n0', { id: 'n0', x: 0, y: 0, level: 5, nodeType: 'polygon' });
    nodes.set('n1', { id: 'n1', x: 1, y: 1, level: 1, nodeType: 'polygon' });
    const edges: RouteEdge[] = [
      { from: 'n0', to: 'n1', distanceMeters: 1, timeSeconds: 0.8, effortMetersEquivalent: 1, level: 5, accessibilityPenalty: 0, edgeType: 'walk' },
      { from: 'n1', to: 'n0', distanceMeters: 1, timeSeconds: 0.8, effortMetersEquivalent: 1, level: 1, accessibilityPenalty: 0, edgeType: 'walk' },
    ];
    const adj = new Map<string, string[]>();
    adj.set('n0', ['n1']);
    adj.set('n1', ['n0']);
    fixtures.push({ name: 'polygon node at invalid level', graph: { nodes, edges, adjacency: adj }, expectErrors: true });
  }

  return fixtures;
}

describe('graph invalid fixture capture', () => {
  const fixtures = makeFixtures();

  it.each(fixtures)('[$expectErrors ? ERROR : OK] $name', ({ name, graph, expectErrors }) => {
    const result = validateGraph(graph);
    console.log(`  Errors: ${JSON.stringify(result.errors)}`);
    if (expectErrors) {
      expect(result.valid).toBe(false);
    } else {
      expect(result.valid).toBe(true);
    }
  });
});

describe('real graph validation', () => {
  it('validates real graph with zero errors', () => {
    const graph = buildRoutingGraph();
    const result = validateGraph(graph);
    console.log(`  Nodes: ${graph.nodes.size}, Edges: ${graph.edges.length}`);
    console.log(`  Errors: ${JSON.stringify(result.errors)}`);
    expect(result.valid).toBe(true);
  });
});
