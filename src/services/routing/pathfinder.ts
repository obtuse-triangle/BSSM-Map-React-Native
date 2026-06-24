import type { RouteAccessibilityMode, RouteGraph, RouteEdge, RouteProfile } from '../../types/routing';
import { WALKING_SPEED_MPS } from './constants';

interface QueueItem {
  nodeId: string;
  priority: number;
}

class MinHeap<T extends { priority: number; nodeId: string }> {
  private items: T[] = [];

  size(): number {
    return this.items.length;
  }

  push(item: T): void {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): T | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0 && last) {
      this.items[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }

  private less(a: T, b: T): boolean {
    if (a.priority !== b.priority) return a.priority < b.priority;
    return a.nodeId < b.nodeId;
  }

  private bubbleUp(index: number): void {
    let i = index;
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.less(this.items[i], this.items[parent])) {
        [this.items[i], this.items[parent]] = [this.items[parent], this.items[i]];
        i = parent;
      } else {
        break;
      }
    }
  }

  private bubbleDown(index: number): void {
    let i = index;
    const length = this.items.length;

    while (true) {
      let smallest = i;
      const left = i * 2 + 1;
      const right = i * 2 + 2;

      if (left < length && this.less(this.items[left], this.items[smallest])) {
        smallest = left;
      }
      if (right < length && this.less(this.items[right], this.items[smallest])) {
        smallest = right;
      }
      if (smallest === i) break;
      [this.items[i], this.items[smallest]] = [this.items[smallest], this.items[i]];
      i = smallest;
    }
  }
}

// ── Edge cost functions ─────────────────────────────────────────────

/**
 * Legacy cost function — preserved for the original `findShortestPath`
 * so behaviour of existing single-route callers does not change.
 *
 * Walk edges: distanceMeters/1.2 (seconds). Connector edges: timeSeconds
 * (which is the traversal time for connector edges).
 * Optionally adds accessibilityPenalty for `elevator_priority` mode.
 */
function legacyEdgeCost(edge: RouteEdge, accessibilityMode: RouteAccessibilityMode): number {
  const baseSeconds =
    edge.edgeType === 'walk'
      ? edge.distanceMeters / WALKING_SPEED_MPS
      : edge.timeSeconds;
  if (accessibilityMode === 'elevator_priority') {
    return baseSeconds + edge.accessibilityPenalty;
  }
  return baseSeconds;
}

/**
 * Profile-based cost function for the multi-option engine.
 *
 *   fastest  → optimise timeSeconds
 *   shortest → optimise distanceMeters (connectors contribute 0)
 *   easiest  → optimise effortMetersEquivalent
 *
 * Accessibility penalty is NEVER folded into these semantic weights.
 */
export function profileEdgeCost(edge: RouteEdge, profile: RouteProfile): number {
  switch (profile) {
    case 'fastest':
      return edge.timeSeconds;
    case 'shortest':
      return edge.distanceMeters;
    case 'easiest':
      return edge.effortMetersEquivalent;
  }
}

function buildOutgoingEdges(
  graph: RouteGraph,
  tempEdges?: RouteEdge[],
): Map<string, RouteEdge[]> {
  const outgoing = new Map<string, RouteEdge[]>();
  for (const nodeId of graph.nodes.keys()) {
    outgoing.set(nodeId, []);
  }
  for (const edge of graph.edges) {
    const list = outgoing.get(edge.from);
    if (list) list.push(edge);
  }
  if (tempEdges) {
    for (const edge of tempEdges) {
      let list = outgoing.get(edge.from);
      if (!list) {
        list = [];
        outgoing.set(edge.from, list);
      }
      list.push(edge);
    }
  }
  return outgoing;
}

// ── Core Dijkstra (cost-function-injected) ─────────────────────────

/**
 * Single-source single-target Dijkstra with a caller-supplied cost function.
 *
 * Returns the node path and total cost, or null if unreachable. Used both
 * directly (single-route pathfinding) and as the subroutine inside Yen's
 * algorithm.
 *
 * Supports edge banning (`bannedFrom`, `bannedTo`) and node banning
 * (`bannedNodes`) which are required by Yen's spur-path computation.
 */
export function dijkstra(
  graph: RouteGraph,
  startNodeId: string,
  endNodeId: string,
  costFn: (edge: RouteEdge) => number,
  opts?: {
    bannedFrom?: Set<string>;
    bannedTo?: Set<string>;
    bannedNodes?: Set<string>;
    outgoing?: Map<string, RouteEdge[]>;
  },
): { nodeIds: string[]; totalWeight: number } | null {
  if (!graph.nodes.has(startNodeId) || !graph.nodes.has(endNodeId)) {
    return null;
  }
  if (startNodeId === endNodeId) {
    return { nodeIds: [startNodeId], totalWeight: 0 };
  }

  const outgoing = opts?.outgoing ?? buildOutgoingEdges(graph);
  const distances = new Map<string, number>();
  const previous = new Map<string, string>();
  const visited = new Set<string>();
  const queue = new MinHeap<QueueItem>();

  distances.set(startNodeId, 0);
  queue.push({ nodeId: startNodeId, priority: 0 });

  while (queue.size() > 0) {
    const current = queue.pop();
    if (!current) break;
    if (visited.has(current.nodeId)) continue;
    visited.add(current.nodeId);

    if (current.nodeId === endNodeId) break;

    const currentDistance = distances.get(current.nodeId);
    if (currentDistance === undefined) continue;

    const edges = outgoing.get(current.nodeId) ?? [];
    for (const edge of edges) {
      const next = edge.to;
      if (visited.has(next)) continue;
      if (opts?.bannedNodes?.has(next)) continue;
      if (opts?.bannedFrom?.has(`${edge.from}|${edge.to}`)) continue;
      if (opts?.bannedTo?.has(`${edge.from}|${edge.to}`)) continue;

      const candidate = currentDistance + costFn(edge);
      const existing = distances.get(next);
      if (
        existing === undefined ||
        candidate < existing ||
        (candidate === existing && current.nodeId < (previous.get(next) ?? ''))
      ) {
        distances.set(next, candidate);
        previous.set(next, current.nodeId);
        queue.push({ nodeId: next, priority: candidate });
      }
    }
  }

  const totalWeight = distances.get(endNodeId);
  if (totalWeight === undefined) return null;

  const nodeIds: string[] = [];
  let cursor: string | undefined = endNodeId;
  while (cursor) {
    nodeIds.push(cursor);
    if (cursor === startNodeId) break;
    cursor = previous.get(cursor);
  }

  if (nodeIds[nodeIds.length - 1] !== startNodeId) {
    return null;
  }

  nodeIds.reverse();
  return { nodeIds, totalWeight };
}

// ── Legacy single-path entrypoint (preserved) ───────────────────────

/**
 * Original single shortest-path finder. Preserved for callers that only
 * need one route and rely on the original accessibility-mode semantics.
 */
export function findShortestPath(
  graph: RouteGraph,
  startNodeId: string,
  endNodeId: string,
  accessibilityMode: RouteAccessibilityMode,
  tempEdges?: RouteEdge[],
): { nodeIds: string[]; totalWeight: number } | null {
  const outgoing = buildOutgoingEdges(graph, tempEdges);
  return dijkstra(graph, startNodeId, endNodeId, (e) => legacyEdgeCost(e, accessibilityMode), {
    outgoing,
  });
}

// ── Yen's K-Shortest Paths ──────────────────────────────────────────

/**
 * Result of a Yen's k-shortest run. `cost` is the sum of the cost function
 * along the path (NOT a user-facing metric — depends on the profile chosen).
 */
export interface YenPath {
  nodeIds: string[];
  cost: number;
}

/**
 * Yen's algorithm for loopless k-shortest paths.
 *
 * For each of k iterations:
 *   1. Determine the (k-1)-th shortest path A[k-1].
 *   2. For each node i on A[k-1] (except the last):
 *        - Spur node = A[k-1][i], root path = A[k-1][0..i]
 *        - Remove root-path edges that would recreate previously found paths
 *          (edge ban keyed by `from|to`), and ban root-path nodes from the
 *          spur path.
 *        - Compute spur path from spur node to target via Dijkstra.
 *        - Total path = root path + spur path. Candidate cost = root cost +
 *          spur cost. Push into the candidate pool B.
 *   3. Pick the lowest-cost candidate from B as A[k]; move from B to A.
 *
 * Returns up to `k` paths sorted by ascending cost. If the graph cannot yield
 * that many distinct loopless paths, fewer are returned.
 *
 * Determinism: candidates with equal cost are tie-broken by lexicographic
 * node-id concatenation so that output order is stable across runs.
 *
 * @param graph        routing graph
 * @param startNodeId  source node
 * @param endNodeId    target node
 * @param costFn       edge-cost function (profile-driven)
 * @param k            number of paths requested
 */
export function findKShortestPaths(
  graph: RouteGraph,
  startNodeId: string,
  endNodeId: string,
  costFn: (edge: RouteEdge) => number,
  k: number,
): YenPath[] {
  if (k <= 0) return [];
  if (!graph.nodes.has(startNodeId) || !graph.nodes.has(endNodeId)) return [];
  if (startNodeId === endNodeId) return [{ nodeIds: [startNodeId], cost: 0 }];

  const outgoing = buildOutgoingEdges(graph);

  // A: confirmed shortest paths (in ascending cost order)
  const A: YenPath[] = [];
  // B: candidate pool
  // We keep B as an array and re-sort whenever needed — k is small (≤ ~10).
  const B: YenPath[] = [];
  const seenSignatures = new Set<string>();

  const signature = (nodeIds: string[]): string => nodeIds.join('→');

  // Initial shortest path
  const first = dijkstra(graph, startNodeId, endNodeId, costFn, { outgoing });
  if (!first) return [];
  A.push({ nodeIds: first.nodeIds, cost: first.totalWeight });
  seenSignatures.add(signature(first.nodeIds));

  while (A.length < k) {
    const prevPath = A[A.length - 1];
    let addedAnyCandidate = false;

    // For each spur node along the previous path (except the terminal).
    for (let i = 0; i < prevPath.nodeIds.length - 1; i++) {
      const spurNodeId = prevPath.nodeIds[i];
      const rootPath = prevPath.nodeIds.slice(0, i + 1);

      // Root-path cost along the same cost function.
      let rootCost = 0;
      for (let r = 0; r < rootPath.length - 1; r++) {
        const re = outgoing.get(rootPath[r])?.find((e) => e.to === rootPath[r + 1]);
        if (!re) {
          rootCost = Infinity;
          break;
        }
        rootCost += costFn(re);
      }
      if (rootCost === Infinity) continue;

      // Edge bans: for every previously found path that shares `rootPath`,
      // remove the edge (rootPath[i] → that path's next node).
      const bannedFrom = new Set<string>();
      const bannedNodes = new Set<string>(rootPath.slice(0, -1));

      for (const a of A) {
        if (a.nodeIds.length < rootPath.length + 1) continue;
        let shares = true;
        for (let r = 0; r < rootPath.length; r++) {
          if (a.nodeIds[r] !== rootPath[r]) {
            shares = false;
            break;
          }
        }
        if (!shares) continue;
        const from = rootPath[i];
        const to = a.nodeIds[rootPath.length];
        bannedFrom.add(`${from}|${to}`);
      }

      const spur = dijkstra(graph, spurNodeId, endNodeId, costFn, {
        outgoing,
        bannedFrom,
        bannedNodes,
      });
      if (!spur) continue;

      const fullPath = [...rootPath.slice(0, -1), ...spur.nodeIds];
      const fullSig = signature(fullPath);
      if (seenSignatures.has(fullSig)) continue;

      B.push({ nodeIds: fullPath, cost: rootCost + spur.totalWeight });
      seenSignatures.add(fullSig);
      addedAnyCandidate = true;
    }

    if (B.length === 0) break;

    // Pick the lowest-cost candidate. Tie-break by path signature for
    // deterministic ordering across runs.
    B.sort((a, b) => {
      if (a.cost !== b.cost) return a.cost - b.cost;
      return signature(a.nodeIds) < signature(b.nodeIds) ? -1 : 1;
    });

    const next = B.shift()!;
    A.push(next);
    // Re-add a sentinel so we don't immediately re-pick duplicates; the
    // signature check above already guards against identical loops, but we
    // keep this no-op to document the invariant.
    if (!addedAnyCandidate && B.length === 0) break;
  }

  return A;
}

/**
 * Find paths that pass through a specific connector edge.
 *
 * Splits the route into two halves: origin → connectorFromNode and
 * connectorToNode → destination. Each half is solved by Dijkstra. If both
 * halves are reachable, the result is stitched together with the connector
 * edge in between. Returns a single path (the cheapest one through the
 * connector under the given cost function), or null if either side is
 * unreachable.
 *
 * Unlike Yen's algorithm — which can only enumerate paths that share at
 * least one edge with the root shortest path — this function guarantees
 * that a path through the specified connector is considered. Used to
 * surface alternatives that Yen's root-path bias would miss (e.g. a 1→4
 * elevator path when the all-stairs path is the shortest).
 */
export function findPathThroughConnector(
  graph: RouteGraph,
  startNodeId: string,
  endNodeId: string,
  costFn: (edge: RouteEdge) => number,
  connectorEdge: RouteEdge,
): YenPath | null {
  const from = dijkstra(graph, startNodeId, connectorEdge.from, costFn);
  const to = dijkstra(graph, connectorEdge.to, endNodeId, costFn);
  if (!from || !to) return null;
  return {
    nodeIds: [...from.nodeIds, ...to.nodeIds],
    cost: from.totalWeight + costFn(connectorEdge) + to.totalWeight,
  };
}
