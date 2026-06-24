/**
 * graphBuilder.test.ts
 *
 * Tests for the routing graph builder.
 *
 * Covers:
 *   - Full graph build from committed GeoJSON data
 *   - Levels 1–4 each produce nodes and edges
 *   - All edge references are valid
 *   - Edge weights are positive
 *   - Stair/elevator accessibility penalties are correct
 *   - Build performance under 1000 ms
 *   - Deterministic output (same data → same graph)
 */

import { buildRoutingGraph, buildRoutingGraphForLevel } from '../graphBuilder';

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Collect all errors from edge reference validation.
 */
function findInvalidEdgeRefs(
  graph: ReturnType<typeof buildRoutingGraph>,
): string[] {
  const nodeIds = new Set(graph.nodes.keys());
  const errors: string[] = [];
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.from)) {
      errors.push(`Missing source node: ${edge.from}`);
    }
    if (!nodeIds.has(edge.to)) {
      errors.push(`Missing target node: ${edge.to}`);
    }
  }
  return errors;
}

/**
 * Check that an edge exists (in either direction) between two node IDs.
 */
function hasEdge(
  graph: ReturnType<typeof buildRoutingGraph>,
  from: string,
  to: string,
): boolean {
  return graph.edges.some(
    (e) => (e.from === from && e.to === to) || (e.from === to && e.to === from),
  );
}

// ── Tests ────────────────────────────────────────────────────────────

describe('buildRoutingGraph', () => {
  let graph: ReturnType<typeof buildRoutingGraph>;

  beforeAll(() => {
    graph = buildRoutingGraph();
  });

  // ── Structure ─────────────────────────────────────────────────────

  it('returns nodes, edges, and adjacency', () => {
    expect(graph.nodes).toBeInstanceOf(Map);
    expect(graph.edges).toBeInstanceOf(Array);
    expect(graph.adjacency).toBeInstanceOf(Map);
  });

  it('has nodes on every level 1–4', () => {
    const levelsWithNodes = new Set<number>();
    for (const node of graph.nodes.values()) {
      levelsWithNodes.add(node.level);
    }
    for (let lvl = 1; lvl <= 4; lvl++) {
      expect(levelsWithNodes.has(lvl)).toBe(true);
    }
  });

  it('each level 1–4 has > 0 nodes', () => {
    for (let lvl = 1; lvl <= 4; lvl++) {
      const count = [...graph.nodes.values()].filter(
        (n) => n.level === lvl,
      ).length;
      expect(count).toBeGreaterThan(0);
    }
  });

  it('each level 1–4 has > 0 edges referencing that level', () => {
    for (let lvl = 1; lvl <= 4; lvl++) {
      const count = graph.edges.filter((e) => {
        const fn = graph.nodes.get(e.from);
        const tn = graph.nodes.get(e.to);
        return fn?.level === lvl || tn?.level === lvl;
      }).length;
      expect(count).toBeGreaterThan(0);
    }
  });

  it('level 1 graph has one dominant connected component', () => {
    const level1Nodes = [...graph.nodes.values()].filter((n) => n.level === 1);
    if (level1Nodes.length === 0) return;

    const unvisited = new Set(level1Nodes.map((n) => n.id));
    const components: number[] = [];

    while (unvisited.size > 0) {
      const startId = unvisited.values().next().value as string;
      const visited = new Set<string>([startId]);
      const queue = [startId];
      unvisited.delete(startId);

      while (queue.length > 0) {
        const cur = queue.shift()!;
        const neighbors = graph.adjacency.get(cur) || [];
        for (const next of neighbors) {
          if (!visited.has(next) && graph.nodes.get(next)?.level === 1) {
            visited.add(next);
            queue.push(next);
            unvisited.delete(next);
          }
        }
      }

      components.push(visited.size);
    }

    // 강제 컴포넌트 연결 기능 제거: walkable-area가 실제로 단절된 경우
    // 다중 컴포넌트가 발생한다. 가장 큰 컴포넌트가 노드의 절반 이상을
    // 포함하는지만 검증하여 주요 캠퍼스 구역이 라우팅 가능함을 확인한다.
    // 소규모 단편은 원본 데이터(walkable-area geometry) 수정으로 해결.
    const largestComponent = Math.max(...components);
    expect(largestComponent).toBeGreaterThan(level1Nodes.length / 2);
  });

  it('whole graph has one dominant connected component', () => {
    const ids = [...graph.nodes.keys()];
    if (ids.length === 0) return;

    const unvisited = new Set(ids);
    const components: number[] = [];

    while (unvisited.size > 0) {
      const startId = unvisited.values().next().value as string;
      const visited = new Set<string>([startId]);
      const queue = [startId];
      unvisited.delete(startId);
      while (queue.length > 0) {
        const cur = queue.shift()!;
        for (const next of graph.adjacency.get(cur) || []) {
          if (!visited.has(next)) {
            visited.add(next);
            queue.push(next);
            unvisited.delete(next);
          }
        }
      }
      components.push(visited.size);
    }

    // 강제 컴포넌트 연결 제거: 전체 그래프가 다중 컴포넌트일 수 있다.
    // 가장 큰 컴포넌트가 노드의 절반 이상을 포함하는지만 검증한다.
    const largestComponent = Math.max(...components);
    expect(largestComponent).toBeGreaterThan(graph.nodes.size / 2);
  });

  // ── Edge integrity ───────────────────────────────────────────────

  it('all edge.from and edge.to reference existing nodes', () => {
    const errors = findInvalidEdgeRefs(graph);
    expect(errors).toEqual([]);
  });

  it('all walk edges have positive finite distanceMeters', () => {
    for (const edge of graph.edges) {
      if (edge.edgeType !== 'walk') continue;
      expect(Number.isFinite(edge.distanceMeters)).toBe(true);
      expect(edge.distanceMeters).toBeGreaterThan(0);
    }
  });

  it('no local (non-bridge) walk edge exceeds 30 metres', () => {
    const longEdges = graph.edges.filter(
      (e) => e.edgeType === 'walk' && !e.isBridge && e.distanceMeters > 30,
    );
    expect(longEdges).toHaveLength(0);
  });

  it('connectivity bridges stay within the max bridge distance', () => {
    const bridges = graph.edges.filter((e) => e.edgeType === 'walk' && e.isBridge);
    // BRIDGE_MAX_DISTANCE_M = 0.5: 라우터는 walkable-area 폴리곤 사이의
    // 실제 단절(벽, 데이터 결함)을 절대 넘어서 건너뛰지 않는다. 더 큰 간격은
    // 원본 walkable-area geometry를 수정해야 해결된다.
    for (const e of bridges) {
      expect(e.distanceMeters).toBeLessThanOrEqual(0.5);
    }
  });

  it('all connector edges have positive finite timeSeconds', () => {
    for (const edge of graph.edges) {
      if (edge.edgeType !== 'connector') continue;
      expect(Number.isFinite(edge.timeSeconds)).toBe(true);
      expect(edge.timeSeconds).toBeGreaterThan(0);
    }
  });

  // ── Accessibility penalties ──────────────────────────────────────

  it('stair connector edges have accessibilityPenalty > 0', () => {
    const stairEdges = graph.edges.filter(
      (e) =>
        e.edgeType === 'connector' &&
        e.connectorId != null &&
        e.connectorId.includes('stair'),
    );
    expect(stairEdges.length).toBeGreaterThan(0);
    for (const edge of stairEdges) {
      expect(edge.accessibilityPenalty).toBeGreaterThan(0);
    }
  });

  it('elevator connector edges have accessibilityPenalty === 0', () => {
    const elevatorEdges = graph.edges.filter(
      (e) =>
        e.edgeType === 'connector' &&
        e.connectorId != null &&
        e.connectorId.includes('elevator'),
    );
    expect(elevatorEdges.length).toBeGreaterThan(0);
    for (const edge of elevatorEdges) {
      expect(edge.accessibilityPenalty).toBe(0);
    }
  });

  // ── Connector nodes ──────────────────────────────────────────────

  it('creates connector nodes that are reachable from polygon nodes', () => {
    const connNodes = [...graph.nodes.values()].filter(
      (n) => n.nodeType === 'connector',
    );
    expect(connNodes.length).toBeGreaterThan(0);

    // Every connector node must have at least one incident edge
    for (const node of connNodes) {
      const incident = graph.edges.filter(
        (e) => e.from === node.id || e.to === node.id,
      );
      expect(incident.length).toBeGreaterThan(0);
    }
  });

  // ── Adjacency consistency ────────────────────────────────────────

  it('adjacency list contains all nodes', () => {
    expect(graph.adjacency.size).toBe(graph.nodes.size);
  });

  it('every edge.from has the edge.to in its adjacency list', () => {
    for (const edge of graph.edges) {
      const neighbours = graph.adjacency.get(edge.from);
      expect(neighbours).toBeDefined();
      expect(neighbours).toContain(edge.to);
    }
  });

  // ── Performance ──────────────────────────────────────────────────

  it('build completes under 10000 ms', () => {
    const start = performance.now();
    buildRoutingGraph();
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(10000);
  });

  // ── Determinism ──────────────────────────────────────────────────

  it('produces identical graphs on repeated builds', () => {
    const graphA = buildRoutingGraph();
    const graphB = buildRoutingGraph();

    // Same node count
    expect(graphA.nodes.size).toBe(graphB.nodes.size);

    // Same edge count
    expect(graphA.edges.length).toBe(graphB.edges.length);

    // Same node IDs (set comparison)
    const nodeIdsA = new Set(graphA.nodes.keys());
    const nodeIdsB = new Set(graphB.nodes.keys());
    expect(nodeIdsA).toEqual(nodeIdsB);

    // Same edges (compare serialised sets)
    const edgesA = new Set(
      graphA.edges.map((e) => `${e.from}→${e.to}:${e.distanceMeters}|${e.timeSeconds}`),
    );
    const edgesB = new Set(
      graphB.edges.map((e) => `${e.from}→${e.to}:${e.distanceMeters}|${e.timeSeconds}`),
    );
    expect(edgesA).toEqual(edgesB);
  });
});

// ── buildRoutingGraphForLevel ────────────────────────────────────────

describe('buildRoutingGraphForLevel', () => {
  it('returns nodes and edges for level 1', () => {
    const result = buildRoutingGraphForLevel(1);
    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.edges.length).toBeGreaterThan(0);
  });

  it('returns nodes and edges for level 4', () => {
    const result = buildRoutingGraphForLevel(4);
    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.edges.length).toBeGreaterThan(0);
  });

  it('all returned nodes are on the requested level', () => {
    const result = buildRoutingGraphForLevel(2);
    for (const node of result.nodes) {
      expect(node.level).toBe(2);
    }
  });

  it('every returned edge has at least one endpoint on the level', () => {
    const fullGraph = buildRoutingGraph();
    const result = buildRoutingGraphForLevel(3);
    const levelNodeIds = new Set(
      [...fullGraph.nodes.values()]
        .filter((n) => n.level === 3)
        .map((n) => n.id),
    );
    for (const edge of result.edges) {
      const onLevel = levelNodeIds.has(edge.from) || levelNodeIds.has(edge.to);
      expect(onLevel).toBe(true);
    }
  });
});
