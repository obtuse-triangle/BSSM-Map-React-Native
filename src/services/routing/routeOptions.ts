/**
 * routeOptions.ts
 *
 * Multi-option route generation engine.
 *
 * Pipeline:
 *   1. Run Yen's k-shortest paths separately for 3 profiles
 *      (fastest / shortest / easiest) → candidate pool.
 *   2. Deduplicate candidates by node+connector signature.
 *   3. Diversity filter — reject candidates that overlap >85 % with a
 *      better-ranked candidate AND differ by <30 s / <20 effort-metres.
 *   4. Pareto non-dominated subset (distance, time, effort).
 *   5. Balanced rank score (lower = better). Default UI order.
 *   6. Assign labels/badges by winning attribute.
 *
 * Designed to produce 2–4 meaningful alternatives, not k near-duplicates.
 */

import { findKShortestPaths, findPathThroughConnector, profileEdgeCost } from './pathfinder';
import { computeConnectorEffortMeters, effortCoefficients } from './effortModel';
import type {
  RouteAccessibilityMode,
  RouteEdge,
  RouteGraph,
  RouteNode,
  RouteOption,
  RouteProfile,
  RouteResult,
  RouteConnectorStats,
  RouteFloorSegment,
} from '../../types/routing';

// ── Tunables ────────────────────────────────────────────────────────

/** K-shortest count per profile. 3 yields up to 9 candidates which is
 *  enough for a meaningful set after dedup/diversity filter. */
const K_PER_PROFILE = 3;

/** Min candidate overlap (shared edge distance / min route distance) for a
 *  candidate to be considered "too similar" to a kept route. */
const DIVERSITY_OVERLAP_THRESHOLD = 0.85;
const DIVERSITY_TIME_DELTA_SECONDS = 30;
const DIVERSITY_EFFORT_DELTA_METERS = 20;

/** Min/max number of options to surface. The pipeline will trim to this
 *  range after Pareto + ranking. */
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 5;

// ── Balanced-rank weights (from Oracle design) ─────────────────────

const BALANCED_WEIGHT_TIME = 0.20;
const BALANCED_WEIGHT_DISTANCE = 0.20;
const BALANCED_WEIGHT_EFFORT = 0.60;

const ELEVATOR_PRIORITY_WEIGHT_TIME = 0.10;
const ELEVATOR_PRIORITY_WEIGHT_DISTANCE = 0.10;
const ELEVATOR_PRIORITY_WEIGHT_EFFORT = 0.80;

/** Stair effort multiplier under elevator_priority mode — makes Yen seek
 *  elevator alternatives even when the walk to the elevator is longer. */
const ELEVATOR_PRIORITY_STAIR_PENALTY = 3;

// ── Types ───────────────────────────────────────────────────────────

/** Internal enriched candidate before it becomes a RouteOption. */
interface Candidate {
  nodeIds: string[];
  profile: RouteProfile;
  totalDistanceMeters: number;
  estimatedTimeSeconds: number;
  effortMeters: number;
  connectorStats: RouteConnectorStats;
  /** Signature for dedupe: ordered node IDs joined with traversed connector IDs. */
  signature: string;
  /** Set of `from|to` keys for fast overlap computation. */
  edgeKeys: Set<string>;
  /** Floor-segment breakdown (carried forward for RouteResult). */
  floorSegments: RouteFloorSegment[];
  usedStairConnector: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────

function buildOutgoingLookup(graph: RouteGraph): Map<string, RouteEdge[]> {
  const map = new Map<string, RouteEdge[]>();
  for (const edge of graph.edges) {
    let list = map.get(edge.from);
    if (!list) {
      list = [];
      map.set(edge.from, list);
    }
    list.push(edge);
  }
  return map;
}

function edgeKeyOf(from: string, to: string): string {
  return `${from}|${to}`;
}

function makeProfileCost(
  profile: RouteProfile,
  accessibilityMode: RouteAccessibilityMode,
): (edge: RouteEdge) => number {
  if (profile === 'easiest' && accessibilityMode === 'elevator_priority') {
    return (edge) => {
      if (edge.edgeType === 'connector' && edge.connectorMeta?.connectorType === 'stair') {
        return edge.effortMetersEquivalent * ELEVATOR_PRIORITY_STAIR_PENALTY;
      }
      return edge.effortMetersEquivalent;
    };
  }
  return (edge) => profileEdgeCost(edge, profile);
}

/**
 * Build floor segments from a node path, accumulating distance/time/effort
 * and connector stats in a single pass. Temp_* nodes are stripped after
 * the accumulation so they don't pollute the segment list.
 */
function buildMetricsFromPath(
  graph: RouteGraph,
  outgoing: Map<string, RouteEdge[]>,
  nodeIds: string[],
): {
  floorSegments: RouteFloorSegment[];
  totalDistanceMeters: number;
  estimatedTimeSeconds: number;
  effortMeters: number;
  connectorStats: RouteConnectorStats;
  edgeKeys: Set<string>;
  usedStairConnector: boolean;
} {
  let totalDistanceMeters = 0;
  let estimatedTimeSeconds = 0;
  let effortMeters = 0;
  const connectorStats: RouteConnectorStats = {
    stairAscentFloors: 0,
    stairDescentFloors: 0,
    elevatorRideCount: 0,
    floorChangeCount: 0,
  };
  const edgeKeys = new Set<string>();
  let usedStairConnector = false;

  // Raw segments keyed by level — connector edges sit on level -1, so we
  // collapse them into the preceding level's segment (matching legacy
  // behaviour where a connector ends a floor segment).
  const segments: RouteFloorSegment[] = [];
  let current: RouteFloorSegment | null = null;

  for (let i = 0; i < nodeIds.length; i++) {
    const id = nodeIds[i];
    const node = graph.nodes.get(id);
    if (!node) continue;

    const isTemp =
      node.nodeType === 'temp_origin' || node.nodeType === 'temp_destination';

    // Skip temp nodes entirely for segment bookkeeping (distance is still
    // accumulated through their edges below).
    if (!isTemp) {
      if (!current || current.level !== node.level) {
        current = {
          level: node.level,
          nodeIds: [id],
          distanceMeters: 0,
        };
        segments.push(current);
      } else {
        current.nodeIds.push(id);
      }
    }

    if (i === nodeIds.length - 1) break;

    const nextId = nodeIds[i + 1];
    const edge = outgoing.get(id)?.find((e) => e.to === nextId);
    if (!edge) continue;

    edgeKeys.add(edgeKeyOf(id, nextId));

    if (edge.edgeType === 'walk') {
      totalDistanceMeters += edge.distanceMeters;
      estimatedTimeSeconds += edge.timeSeconds;
      effortMeters += edge.effortMetersEquivalent;
      if (current && !isTemp) {
        current.distanceMeters += edge.distanceMeters;
      }
    } else {
      // connector edge
      estimatedTimeSeconds += edge.timeSeconds;
      effortMeters += edge.effortMetersEquivalent;
      if (edge.accessibilityPenalty > 0) usedStairConnector = true;

      // Stats
      const meta = edge.connectorMeta;
      if (meta) {
        const [fromLevel, toLevel] = meta.connectsLevels;
        const floorDelta = Math.abs(toLevel - fromLevel);
        connectorStats.floorChangeCount += floorDelta;
        if (meta.connectorType === 'stair') {
          connectorStats.stairAscentFloors += Math.max(0, toLevel - fromLevel);
          connectorStats.stairDescentFloors += Math.max(0, fromLevel - toLevel);
        } else {
          connectorStats.elevatorRideCount += 1;
        }
      }

      // Connector terminates the current floor segment with a transition.
      if (current && edge.connectorId) {
        const fromNode = graph.nodes.get(id);
        const toNode = graph.nodes.get(nextId);
        if (fromNode && toNode) {
          current.connectorTransition = {
            connectorId: edge.connectorId,
            fromLevel: fromNode.level,
            toLevel: toNode.level,
          };
        }
      }
    }
  }

  // Strip temp-only segments.
  const floorSegments = segments.filter((s) => s.nodeIds.length > 0);

  return {
    floorSegments,
    totalDistanceMeters,
    estimatedTimeSeconds,
    effortMeters,
    connectorStats,
    edgeKeys,
    usedStairConnector,
  };
}

function candidateSignature(
  nodeIds: string[],
  graph: RouteGraph,
  outgoing: Map<string, RouteEdge[]>,
): string {
  // Concatenate node IDs with any connector IDs traversed, so two paths that
  // share node sequence but use different connectors still differ.
  const parts: string[] = [];
  for (let i = 0; i < nodeIds.length - 1; i++) {
    parts.push(nodeIds[i]);
    const edge = outgoing.get(nodeIds[i])?.find((e) => e.to === nodeIds[i + 1]);
    if (edge?.connectorId) parts.push(`#${edge.connectorId}`);
  }
  parts.push(nodeIds[nodeIds.length - 1]);
  void graph;
  return parts.join('→');
}

// ── Diversity filter ────────────────────────────────────────────────

/**
 * Shared-edge distance between two candidates (undirected edge match).
 * Returns metres of edge distance shared between the two.
 */
function sharedEdgeDistance(a: Candidate, b: Candidate, edgeDist: Map<string, number>): number {
  let shared = 0;
  // Walk edges only contribute physical distance.
  for (const key of a.edgeKeys) {
    if (b.edgeKeys.has(key)) {
      shared += edgeDist.get(key) ?? 0;
    }
  }
  // Also count reversed-direction shared edges (bidirectional graph).
  for (const key of a.edgeKeys) {
    const [from, to] = key.split('|');
    const rev = `${to}|${from}`;
    if (b.edgeKeys.has(rev)) {
      shared += edgeDist.get(key) ?? 0;
    }
  }
  return shared;
}

/**
 * Reject candidate `b` if it overlaps too much with a better-ranked route
 * AND differs by negligible time/effort. Returns true to REJECT.
 */
function shouldRejectAsDuplicate(
  kept: Candidate[],
  b: Candidate,
  edgeDist: Map<string, number>,
): boolean {
  for (const a of kept) {
    const minDist = Math.min(a.totalDistanceMeters, b.totalDistanceMeters);
    if (minDist <= 0) continue;
    const shared = sharedEdgeDistance(a, b, edgeDist);
    const overlap = shared / minDist;
    if (
      overlap > DIVERSITY_OVERLAP_THRESHOLD &&
      Math.abs(a.estimatedTimeSeconds - b.estimatedTimeSeconds) < DIVERSITY_TIME_DELTA_SECONDS &&
      Math.abs(a.effortMeters - b.effortMeters) < DIVERSITY_EFFORT_DELTA_METERS
    ) {
      return true;
    }
  }
  return false;
}

// ── Pareto front ────────────────────────────────────────────────────

/**
 * Keep only candidates that are NOT dominated by another candidate.
 * A dominates B if A is ≤ B on all three axes and < B on at least one.
 */
function paretoNonDominated(cands: Candidate[]): Candidate[] {
  const kept: Candidate[] = [];
  for (let i = 0; i < cands.length; i++) {
    const b = cands[i];
    let dominated = false;
    for (let j = 0; j < cands.length; j++) {
      if (i === j) continue;
      const a = cands[j];
      const noWorse =
        a.totalDistanceMeters <= b.totalDistanceMeters &&
        a.estimatedTimeSeconds <= b.estimatedTimeSeconds &&
        a.effortMeters <= b.effortMeters;
      const strictlyBetter =
        a.totalDistanceMeters < b.totalDistanceMeters ||
        a.estimatedTimeSeconds < b.estimatedTimeSeconds ||
        a.effortMeters < b.effortMeters;
      if (noWorse && strictlyBetter) {
        dominated = true;
        break;
      }
    }
    if (!dominated) kept.push(b);
  }
  return kept;
}

// ── Balanced rank + labels ──────────────────────────────────────────

function balancedScore(
  c: Candidate,
  best: { time: number; dist: number; effort: number },
  accessibilityMode: RouteAccessibilityMode = 'normal',
): number {
  const t = c.estimatedTimeSeconds / Math.max(best.time, 1);
  const d = c.totalDistanceMeters / Math.max(best.dist, 1);
  const e = c.effortMeters / Math.max(best.effort, 1);
  if (accessibilityMode === 'elevator_priority') {
    return (
      ELEVATOR_PRIORITY_WEIGHT_TIME * t +
      ELEVATOR_PRIORITY_WEIGHT_DISTANCE * d +
      ELEVATOR_PRIORITY_WEIGHT_EFFORT * e
    );
  }
  return BALANCED_WEIGHT_TIME * t + BALANCED_WEIGHT_DISTANCE * d + BALANCED_WEIGHT_EFFORT * e;
}

/**
 * Determine the user-facing label + badge for a candidate based on which
 * attribute it wins (or near-wins) compared to its peers.
 */
function labelForCandidate(
  c: Candidate,
  best: { time: number; dist: number; effort: number },
): { label: string; badge: string } {
  const stairFloors =
    c.connectorStats.stairAscentFloors + c.connectorStats.stairDescentFloors;
  const hasStairs = stairFloors > 0;
  const isFastest = c.estimatedTimeSeconds === best.time;
  const isShortest = c.totalDistanceMeters === best.dist;
  const isEasiest = c.effortMeters === best.effort;

  if (isFastest) return { label: '가장 빠름', badge: '빠름' };
  if (isShortest) return { label: '가장 가까움', badge: '가까움' };
  if (isEasiest && !hasStairs) return { label: '가장 편함', badge: '편함' };
  if (c.connectorStats.elevatorRideCount > 0) {
    return { label: '엘리베이터 경로', badge: '엘리베이터' };
  }
  if (hasStairs) return { label: '계단 경로', badge: '계단' };
  return { label: '추천 경로', badge: '추천' };
}

// ── Public entrypoint ───────────────────────────────────────────────

/**
 * Compute diverse route options between two already-installed temp nodes.
 *
 * Caller is responsible for:
 *   - Snapping origin/destination to the graph
 *   - Installing temp_origin / temp_destination nodes + their connector edges
 *   - Passing the augmented graph (the caller-owned clone)
 *
 * @param graph            augmented routing graph (with temp nodes installed)
 * @param originTempId     temp_origin node ID
 * @param destTempId       temp_destination node ID
 * @param originPoint      EPSG:5183 origin coordinate for RouteResult rendering
 * @param destPoint        EPSG:5183 destination coordinate for RouteResult rendering
 * @param accessibilityMode 'elevator_priority' biases ranking toward elevator
 *                         routes and inflates stair cost in the easiest profile
 */
export function computeRouteOptionSet(
  graph: RouteGraph,
  originTempId: string,
  destTempId: string,
  originPoint: { x: number; y: number; level: number },
  destPoint: { x: number; y: number; level: number },
  accessibilityMode: RouteAccessibilityMode = 'normal',
): RouteOption[] {
  const outgoing = buildOutgoingLookup(graph);

  // Pre-compute physical distance per edge key for diversity filtering.
  const edgeDist = new Map<string, number>();
  for (const edge of graph.edges) {
    edgeDist.set(edgeKeyOf(edge.from, edge.to), edge.distanceMeters);
  }

  // ── 1. Gather candidates from 3 profiles ──────────────────────
  const profiles: RouteProfile[] = ['fastest', 'shortest', 'easiest'];
  const rawCandidates: Candidate[] = [];

  for (const profile of profiles) {
    const costFn = makeProfileCost(profile, accessibilityMode);
    const yenPaths = findKShortestPaths(graph, originTempId, destTempId, costFn, K_PER_PROFILE);
    for (const path of yenPaths) {
      const metrics = buildMetricsFromPath(graph, outgoing, path.nodeIds);
      if (metrics.totalDistanceMeters === 0 && metrics.connectorStats.floorChangeCount === 0) {
        const originNode = graph.nodes.get(originTempId);
        const destNode = graph.nodes.get(destTempId);
        if (originNode && destNode && originNode.level === destNode.level) {
          const hasRealNode = path.nodeIds.some(
            (id) =>
              graph.nodes.get(id)?.nodeType === 'polygon' ||
              graph.nodes.get(id)?.nodeType === 'connector',
          );
          if (!hasRealNode) continue;
        } else {
          continue;
        }
      }
      rawCandidates.push({
        nodeIds: path.nodeIds,
        profile,
        ...metrics,
        signature: candidateSignature(path.nodeIds, graph, outgoing),
      });
    }
  }

  // ── 1b. Connector-variant pass ─────────────────────────────────
  // Yen's algorithm can only enumerate paths that share edges with the root
  // shortest path. A 1→4 elevator path is unreachable from a root that is
  // the all-stairs shortest path, even though the elevator is in the graph.
  // For each connector edge, run a 2-segment Dijkstra to surface a path
  // through that connector and feed it into the candidate pool.
  const connectorCostFn = makeProfileCost('easiest', accessibilityMode);
  for (const edge of graph.edges) {
    if (edge.edgeType !== 'connector') continue;
    const path = findPathThroughConnector(
      graph,
      originTempId,
      destTempId,
      connectorCostFn,
      edge,
    );
    if (!path) continue;
    const metrics = buildMetricsFromPath(graph, outgoing, path.nodeIds);
    if (
      metrics.totalDistanceMeters === 0 &&
      metrics.connectorStats.floorChangeCount === 0
    ) {
      continue;
    }
    rawCandidates.push({
      nodeIds: path.nodeIds,
      profile: 'easiest',
      ...metrics,
      signature: candidateSignature(path.nodeIds, graph, outgoing),
    });
  }

  if (rawCandidates.length === 0) return [];

  // ── 2. Dedupe by signature ────────────────────────────────────
  const bySignature = new Map<string, Candidate>();
  for (const c of rawCandidates) {
    const existing = bySignature.get(c.signature);
    if (!existing || c.estimatedTimeSeconds < existing.estimatedTimeSeconds) {
      bySignature.set(c.signature, c);
    }
  }
  let deduped = [...bySignature.values()];

  // ── 3. Diversity filter ───────────────────────────────────────
  // Sort by estimated time first (cheap proxy for "better") so the kept set
  // favours faster routes when near-duplicates collide.
  deduped.sort((a, b) => a.estimatedTimeSeconds - b.estimatedTimeSeconds);
  const diverse: Candidate[] = [];
  for (const c of deduped) {
    if (!shouldRejectAsDuplicate(diverse, c, edgeDist)) {
      diverse.push(c);
    }
  }

  // If diversity filtering collapsed the set too aggressively, fall back to
  // the deduped set so the user still sees choices.
  if (diverse.length < MIN_OPTIONS && deduped.length > diverse.length) {
    diverse.length = 0;
    diverse.push(...deduped);
  }

  // ── 4. Pareto front ───────────────────────────────────────────
  const pareto = paretoNonDominated(diverse);
  const pool = pareto.length >= MIN_OPTIONS ? pareto : diverse;

  // ── 5. Balanced rank ──────────────────────────────────────────
  const best = {
    time: Math.min(...pool.map((c) => c.estimatedTimeSeconds)),
    dist: Math.min(...pool.map((c) => c.totalDistanceMeters)),
    effort: Math.min(...pool.map((c) => c.effortMeters)),
  };

  const scored = pool
    .map((c) => ({ c, score: balancedScore(c, best, accessibilityMode) }))
    .sort((a, b) => a.score - b.score);

  // Guarantee the lowest-effort candidate is always in the trimmed list so
  // the "편함" tab and elevator_priority users can always tap the easiest route.
  const trimmedBase = scored.slice(0, MAX_OPTIONS);
  const easiestCandidate = pool.reduce((min, c) =>
    c.effortMeters < min.effortMeters ? c : min,
  );
  const hasEasiest = trimmedBase.some(
    ({ c }) => c.signature === easiestCandidate.signature,
  );
  const trimmed = hasEasiest
    ? trimmedBase
    : [scored.find(({ c }) => c.signature === easiestCandidate.signature)!, ...trimmedBase.slice(0, MAX_OPTIONS - 1)]
        .filter(Boolean);

  // ── 6. Build RouteOption list ─────────────────────────────────
  const options: RouteOption[] = trimmed.map(({ c, score }, idx) => {
    const { label, badge } = labelForCandidate(c, best);
    const usedStairsFallback = c.profile === ('easiest' as RouteProfile) && c.usedStairConnector;

    const result: RouteResult = {
      ok: true,
      floorSegments: c.floorSegments,
      totalDistanceMeters: c.totalDistanceMeters,
      estimatedTimeSeconds: c.estimatedTimeSeconds,
      effortMeters: c.effortMeters,
      effortScore: c.effortMeters / 100,
      connectorStats: c.connectorStats,
      usedStairsFallback,
      originPoint,
      destinationPoint: destPoint,
      ...(usedStairsFallback
        ? { warning: '이 경로는 계단을 포함합니다. 엘리베이터 경로를 찾을 수 없습니다.' }
        : {}),
    };

    return {
      id: `${c.profile}-${idx}`,
      label,
      badge,
      profile: c.profile,
      accessibilityMode: c.profile === 'easiest' ? 'elevator_priority' : 'normal',
      result,
      balancedScore: score,
    };
  });

  return options;
}

// ── Re-exports for downstream callers (single import surface) ───────

export { computeConnectorEffortMeters, effortCoefficients };
export type { RouteNode };
