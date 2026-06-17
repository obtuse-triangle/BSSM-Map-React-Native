import type {
  RouteEdge,
  RouteGraph,
  RouteNode,
} from '../../../types/routing';

export type GraphWithTemps = RouteGraph;

export function cloneGraph(graph: RouteGraph): GraphWithTemps {
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

export function euclidean(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

export function addBidirectionalWalkEdge(
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

export function addTempNode(
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

/** How many nearest walkable nodes a temp origin/destination links into. */
export const TEMP_NODE_LINKS = 5;

export function connectTempNodeToArea(
  graph: RouteGraph,
  tempNode: RouteNode,
  x: number,
  y: number,
  level: number,
): void {
  // Link the temp node only to its few NEAREST walkable nodes — not to every
  // node within a wide radius. Connecting to far nodes gave Dijkstra straight
  // "shortcut" edges that (a) made the route visibly start at a corridor node
  // metres past the room instead of the node right in front of it, and (b) cut
  // across walls. A small nearest-neighbour set forces the path to enter the
  // graph at the closest point and then follow real corridor edges.
  const candidates: { node: RouteNode; dist: number }[] = [];
  for (const node of graph.nodes.values()) {
    if (node.level !== level) continue;
    if (node.nodeType === 'temp_origin' || node.nodeType === 'temp_destination') continue;
    if (node.nodeType === 'connector') continue;
    candidates.push({ node, dist: euclidean(x, y, node.x, node.y) });
  }
  candidates.sort((a, b) => a.dist - b.dist);

  for (const { node, dist } of candidates.slice(0, TEMP_NODE_LINKS)) {
    addBidirectionalWalkEdge(graph, tempNode, node, level, dist);
  }
}
