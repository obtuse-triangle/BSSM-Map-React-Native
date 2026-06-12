import type { RouteAccessibilityMode, RouteGraph, RouteEdge } from '../../types/routing';

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

function edgeCost(edge: RouteEdge, accessibilityMode: RouteAccessibilityMode): number {
  if (accessibilityMode === 'elevator_priority') {
    return edge.weightMeters + edge.accessibilityPenalty;
  }
  return edge.weightMeters;
}

function buildOutgoingEdges(graph: RouteGraph): Map<string, RouteEdge[]> {
  const outgoing = new Map<string, RouteEdge[]>();
  for (const nodeId of graph.nodes.keys()) {
    outgoing.set(nodeId, []);
  }
  for (const edge of graph.edges) {
    const list = outgoing.get(edge.from);
    if (list) list.push(edge);
  }
  return outgoing;
}

export function findShortestPath(
  graph: RouteGraph,
  startNodeId: string,
  endNodeId: string,
  accessibilityMode: RouteAccessibilityMode,
): { nodeIds: string[]; totalWeight: number } | null {
  if (!graph.nodes.has(startNodeId) || !graph.nodes.has(endNodeId)) {
    return null;
  }

  if (startNodeId === endNodeId) {
    return { nodeIds: [startNodeId], totalWeight: 0 };
  }

  const outgoing = buildOutgoingEdges(graph);
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

      const candidate = currentDistance + edgeCost(edge, accessibilityMode);
      const existing = distances.get(next);
      if (existing === undefined || candidate < existing || (candidate === existing && current.nodeId < (previous.get(next) ?? ''))) {
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
