import type { RouteEdge } from '../../../types/routing';
import { WALKING_SPEED_MPS } from '../constants';
import {
  type NodeEntry,
  type PolygonData,
  euclidean,
  segmentInsidePolygons,
} from './polygonGeometry';

const K_NEAREST = 6;
const MAX_EDGE_DISTANCE_MULTIPLIER = 2;
const BRIDGE_MAX_DISTANCE_M = 20;

/**
 * Generate walk edges for all polygon nodes on one floor level.
 *
 * Two-phase approach:
 *   1. Primary edges — K nearest neighbours within maxDist.
 *   2. Orphan rescue — any node left with zero edges gets connected to its
 *      nearest neighbour regardless of distance.
 *
 * Performance: uses squared distances for filtering and sorting to avoid
 * expensive sqrt calls — only the final edge weight uses the real distance.
 */
export function generateEdgesForLevel(
  nodes: NodeEntry[],
  spacing: number,
  polygons: PolygonData[],
  level: number,
): RouteEdge[] {
  const edges: RouteEdge[] = [];
  const maxDistSq = (spacing * MAX_EDGE_DISTANCE_MULTIPLIER) ** 2;
  const seen = new Set<string>();

  // ── Phase 1: KNN within maxDist ──────────────────────────────
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    const candidates: { idx: number; dSq: number }[] = [];

    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue;
      const dx = nodes[j].x - a.x;
      const dy = nodes[j].y - a.y;
      const dSq = dx * dx + dy * dy;
      if (dSq > 0 && dSq <= maxDistSq) {
        candidates.push({ idx: j, dSq });
      }
    }

    candidates.sort((a, b) => a.dSq - b.dSq);
    const nearest = candidates.slice(0, K_NEAREST);

    for (const c of nearest) {
      const b = nodes[c.idx];
      const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const weight = Math.sqrt(c.dSq);

      edges.push({
        from: a.id,
        to: b.id,
distanceMeters: weight,
        timeSeconds: weight / WALKING_SPEED_MPS,
        effortMetersEquivalent: weight,
        level,
        accessibilityPenalty: 0,
        edgeType: 'walk',
      });
      edges.push({
        from: b.id,
        to: a.id,
distanceMeters: weight,
        timeSeconds: weight / WALKING_SPEED_MPS,
        effortMetersEquivalent: weight,
        level,
        accessibilityPenalty: 0,
        edgeType: 'walk',
      });
    }
  }

  // ── Phase 2: Orphan rescue ───────────────────────────────────
  // Ring-vertex nodes on polygon boundaries may not have any neighbour whose
  // midpoint falls strictly inside a walkable area (ray-casting treats
  // boundary points as "inside").  For orphans we skip the midpoint check
  // and connect directly to the nearest node.
  const orphanEdges = new Set<string>();
  const hasEdge = new Set<string>();
  for (const e of edges) {
    hasEdge.add(e.from);
    hasEdge.add(e.to);
  }

  const orphanRescueMaxDistSq = 10 ** 2;
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    if (hasEdge.has(a.id)) continue;

    let bestIdx = -1;
    let bestDSq = Infinity;
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue;
      const dx = nodes[j].x - a.x;
      const dy = nodes[j].y - a.y;
      const dSq = dx * dx + dy * dy;
      if (dSq > 0 && dSq <= orphanRescueMaxDistSq && dSq < bestDSq) {
        bestDSq = dSq;
        bestIdx = j;
      }
    }

    if (bestIdx === -1) continue;
    const b = nodes[bestIdx];
    const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
    if (orphanEdges.has(key)) continue;
    orphanEdges.add(key);

    const weight = Math.sqrt(bestDSq);
    edges.push({
      from: a.id,
      to: b.id,
      distanceMeters: weight,
      timeSeconds: weight / WALKING_SPEED_MPS,
      effortMetersEquivalent: weight,
      level,
      accessibilityPenalty: 0,
      edgeType: 'walk',
    });
    edges.push({
      from: b.id,
      to: a.id,
      distanceMeters: weight,
      timeSeconds: weight / WALKING_SPEED_MPS,
      effortMetersEquivalent: weight,
      level,
      accessibilityPenalty: 0,
      edgeType: 'walk',
    });
  }

  return edges;
}

/**
 * Bridge separate walkable polygons on the same level by connecting the
 * closest node pair between polygons, using a minimum-spanning-tree pass so we
 * add the fewest possible cross-polygon links.
 */
export function generatePolygonBridgesForLevel(
  polygonNodeGroups: NodeEntry[][],
  level: number,
  polygons: PolygonData[],
): RouteEdge[] {
  if (polygonNodeGroups.length <= 1) return [];

  // Per-group bounding box so we can skip polygon pairs that are too far apart
  // to ever produce a bridge under BRIDGE_MAX_DISTANCE_M.
  const bboxes = polygonNodeGroups.map((group) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of group) {
      if (n.x < minX) minX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.x > maxX) maxX = n.x;
      if (n.y > maxY) maxY = n.y;
    }
    return { minX, minY, maxX, maxY };
  });

  const bboxGap = (a: typeof bboxes[number], b: typeof bboxes[number]): number => {
    const dx = Math.max(0, Math.max(a.minX - b.maxX, b.minX - a.maxX));
    const dy = Math.max(0, Math.max(a.minY - b.maxY, b.minY - a.maxY));
    return Math.sqrt(dx * dx + dy * dy);
  };

  const candidates: {
    from: NodeEntry;
    to: NodeEntry;
    weight: number;
    i: number;
    j: number;
  }[] = [];

  // Keep the K closest node pairs (by distance only) before doing any expensive
  // polygon containment checks — segment tests are the dominant build cost, so
  // we run them on a handful of candidates instead of every node pair.
  const VALIDATE_CANDIDATES = 8;

  for (let i = 0; i < polygonNodeGroups.length; i++) {
    for (let j = i + 1; j < polygonNodeGroups.length; j++) {
      if (bboxGap(bboxes[i], bboxes[j]) > BRIDGE_MAX_DISTANCE_M) continue;

      // Phase 1 — cheap: collect the closest pairs by raw distance.
      const closest: { from: NodeEntry; to: NodeEntry; weight: number }[] = [];
      let worstKept = Infinity;
      for (const a of polygonNodeGroups[i]) {
        for (const b of polygonNodeGroups[j]) {
          const weight = euclidean(a.x, a.y, b.x, b.y);
          if (weight > BRIDGE_MAX_DISTANCE_M) continue;
          if (closest.length >= VALIDATE_CANDIDATES && weight >= worstKept) continue;
          closest.push({ from: a, to: b, weight });
          if (closest.length > VALIDATE_CANDIDATES) {
            closest.sort((p, q) => p.weight - q.weight);
            closest.length = VALIDATE_CANDIDATES;
            worstKept = closest[closest.length - 1].weight;
          }
        }
      }
      closest.sort((p, q) => p.weight - q.weight);

      // Phase 2 — expensive: validate in ascending distance, take first valid.
      for (const c of closest) {
        if (segmentInsidePolygons(c.from.x, c.from.y, c.to.x, c.to.y, polygons)) {
          candidates.push({ from: c.from, to: c.to, weight: c.weight, i, j });
          break;
        }
      }
    }
  }

  candidates.sort((a, b) => a.weight - b.weight);

  const parent = polygonNodeGroups.map((_, idx) => idx);
  const find = (idx: number): number => {
    let cur = idx;
    while (parent[cur] !== cur) {
      parent[cur] = parent[parent[cur]];
      cur = parent[cur];
    }
    return cur;
  };
  const union = (a: number, b: number): boolean => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return false;
    parent[rb] = ra;
    return true;
  };

  const bridgeEdges: RouteEdge[] = [];
  const seen = new Set<string>();

  for (const c of candidates) {
    if (!union(c.i, c.j)) continue;

    const key = c.from.id < c.to.id ? `${c.from.id}|${c.to.id}` : `${c.to.id}|${c.from.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    bridgeEdges.push({
      from: c.from.id,
      to: c.to.id,
      distanceMeters: c.weight,
      timeSeconds: c.weight / WALKING_SPEED_MPS,
      effortMetersEquivalent: c.weight,
      level,
      accessibilityPenalty: 0,
      edgeType: 'walk',
    });
    bridgeEdges.push({
      from: c.to.id,
      to: c.from.id,
      distanceMeters: c.weight,
      timeSeconds: c.weight / WALKING_SPEED_MPS,
      effortMetersEquivalent: c.weight,
      level,
      accessibilityPenalty: 0,
      edgeType: 'walk',
    });
  }

  return bridgeEdges;
}

/**
 * Guarantee that every node on a level ends up in a single connected component.
 *
 * After local KNN edges and polygon bridges the level may still be fragmented
 * (e.g. a ring whose closest neighbour's midpoint lands on a wall and so failed
 * the polygon-bridge segment test). A disconnected fragment is unroutable, which
 * is strictly worse than a bridge that clips a corner — so this pass ALWAYS
 * connects every component.
 *
 * Strategy: seed components from existing walk edges, then for each pair of
 * components pick the closest node pair, preferring a pair whose connecting
 * segment stays inside the walkable polygons. Kruskal-union the component graph
 * (which is complete, so connectivity is guaranteed) preferring segment-valid,
 * shorter links first.
 */
export function generateComponentBridgesForLevel(
  nodes: NodeEntry[],
  existingEdges: RouteEdge[],
  level: number,
  polygons: PolygonData[],
): RouteEdge[] {
  if (nodes.length <= 1) return [];

  const parent = new Map<string, string>();
  for (const node of nodes) parent.set(node.id, node.id);
  const nodeIds = new Set(parent.keys());

  const find = (id: string): string => {
    let r = id;
    while (parent.get(r) !== r) {
      parent.set(r, parent.get(parent.get(r)!)!);
      r = parent.get(r)!;
    }
    return r;
  };

  const union = (a: string, b: string): boolean => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return false;
    parent.set(rb, ra);
    return true;
  };

  // Seed components from existing same-level walk edges.
  for (const edge of existingEdges) {
    if (edge.edgeType !== 'walk') continue;
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) continue;
    union(edge.from, edge.to);
  }

  // Group nodes by current component root.
  const groups = new Map<string, NodeEntry[]>();
  for (const node of nodes) {
    const root = find(node.id);
    let g = groups.get(root);
    if (!g) {
      g = [];
      groups.set(root, g);
    }
    g.push(node);
  }
  if (groups.size <= 1) return [];

  const roots = [...groups.keys()];

  // For every pair of components, choose the closest connecting node pair,
  // preferring one whose segment stays inside the walkable polygons. Segment
  // tests dominate cost, so first find the K closest pairs by raw distance and
  // only run containment checks on those; if none is valid, fall back to the
  // overall closest pair (connectivity always wins over wall-clipping).
  type Candidate = { from: NodeEntry; to: NodeEntry; weight: number; valid: boolean };
  const VALIDATE_CANDIDATES = 8;
  const candidates: Candidate[] = [];
  for (let i = 0; i < roots.length; i++) {
    for (let j = i + 1; j < roots.length; j++) {
      const A = groups.get(roots[i])!;
      const B = groups.get(roots[j])!;

      const closest: { from: NodeEntry; to: NodeEntry; weight: number }[] = [];
      let worstKept = Infinity;
      for (const a of A) {
        for (const b of B) {
          const weight = euclidean(a.x, a.y, b.x, b.y);
          if (closest.length >= VALIDATE_CANDIDATES && weight >= worstKept) continue;
          closest.push({ from: a, to: b, weight });
          if (closest.length > VALIDATE_CANDIDATES) {
            closest.sort((p, q) => p.weight - q.weight);
            closest.length = VALIDATE_CANDIDATES;
            worstKept = closest[closest.length - 1].weight;
          }
        }
      }
      if (closest.length === 0) continue;
      closest.sort((p, q) => p.weight - q.weight);

      let chosen: Candidate | null = null;
      for (const c of closest) {
        if (segmentInsidePolygons(c.from.x, c.from.y, c.to.x, c.to.y, polygons)) {
          chosen = { from: c.from, to: c.to, weight: c.weight, valid: true };
          break;
        }
      }
      if (!chosen) {
        const c = closest[0];
        chosen = { from: c.from, to: c.to, weight: c.weight, valid: false };
      }
      candidates.push(chosen);
    }
  }

  // Prefer segment-valid links, then shorter ones (Kruskal over the complete
  // component graph → always reaches a single component).
  candidates.sort((a, b) => {
    if (a.valid !== b.valid) return a.valid ? -1 : 1;
    return a.weight - b.weight;
  });

  const bridgeEdges: RouteEdge[] = [];
  const seen = new Set<string>();
  let fallbackCount = 0;
  for (const c of candidates) {
    if (!union(c.from.id, c.to.id)) continue;

    const key = c.from.id < c.to.id ? `${c.from.id}|${c.to.id}` : `${c.to.id}|${c.from.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!c.valid) fallbackCount++;

    bridgeEdges.push({
      from: c.from.id,
      to: c.to.id,
      distanceMeters: c.weight,
      timeSeconds: c.weight / WALKING_SPEED_MPS,
      effortMetersEquivalent: c.weight,
      level,
      accessibilityPenalty: 0,
      edgeType: 'walk',
      isBridge: true,
    });
    bridgeEdges.push({
      from: c.to.id,
      to: c.from.id,
      distanceMeters: c.weight,
      timeSeconds: c.weight / WALKING_SPEED_MPS,
      effortMetersEquivalent: c.weight,
      level,
      accessibilityPenalty: 0,
      edgeType: 'walk',
      isBridge: true,
    });
  }

  if (bridgeEdges.length > 0) {
    console.log(
      `[graphBuilder] level ${level}: bridged ${groups.size} components ` +
        `(${fallbackCount} fallback links crossing non-walkable space)`,
    );
  }

  return bridgeEdges;
}
