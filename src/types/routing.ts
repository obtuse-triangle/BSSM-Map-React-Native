/**
 * Types for indoor walkable routing (EPSG:5183 planar coordinate space).
 *
 * All spatial coordinates (x, y on nodes, coordinates on connectors/origins/destinations)
 * are in **EPSG:5183** (Korean TM Central Belt) unless explicitly documented as WGS84.
 */

// ── Enums / Unions ──────────────────────────────────────────────────

/** Accessibility mode preference for route calculation. */
export type RouteAccessibilityMode = 'normal' | 'elevator_priority';

/**
 * Routing profile — which semantic weight Yen's algorithm optimises.
 * Used by the multi-option engine to produce genuinely different routes.
 */
export type RouteProfile = 'fastest' | 'shortest' | 'easiest';

/** UI-facing sort mode for route option list. */
export type RouteSortMode = 'recommended' | 'fastest' | 'shortest' | 'easiest';

// ── Graph Primitives ────────────────────────────────────────────────

/** A single node in the routing graph (EPSG:5183 planar coordinates). */
export interface RouteNode {
  id: string;
  /** EPSG:5183 easting (metres). */
  x: number;
  /** EPSG:5183 northing (metres). */
  y: number;
  /** Floor level the node belongs to (e.g. 1, 2, 3, 4). */
  level: number;
  nodeType: 'polygon' | 'connector' | 'temp_origin' | 'temp_destination';
}

/**
 * A directed/undirected edge connecting two RouteNodes.
 *
 * Edge weights are split into three independent semantic channels so that
 * different routing profiles can optimise different objectives without
 * contaminating user-facing metrics:
 *   - `distanceMeters`: physical horizontal distance (0 for pure connectors)
 *   - `timeSeconds`: traversal time (walk = dist/speed, connector = traversalTimeSeconds)
 *   - `effortMetersEquivalent`: ergonomic cost in "equivalent flat walking metres"
 *
 * `accessibilityPenalty` is kept ONLY for accessibility preference routing and
 * must NEVER flow into `estimatedTimeSeconds` or `effortMetersEquivalent`.
 */
export interface RouteEdge {
  from: string;
  to: string;
  /** Physical horizontal distance in metres (0 for pure cross-floor connectors). */
  distanceMeters: number;
  /** Time cost in seconds to traverse this edge. */
  timeSeconds: number;
  /** Effort cost expressed in "equivalent flat walking metres". */
  effortMetersEquivalent: number;
  /** Floor level this edge traverses. */
  level: number;
  /** Optional ID linking to a RoutingConnectorFeature if this edge crosses floors. */
  connectorId?: string;
  /**
   * Additional weight penalty for accessibility-conscious routing.
   * 0 for normal walk edges; higher for stairs. Preference-only — never time.
   */
  accessibilityPenalty: number;
  edgeType: 'walk' | 'connector';
  /**
   * True for connectivity-guarantee bridges added to link otherwise-isolated
   * floor fragments. These may exceed the normal local-edge length limit and so
   * are exempt from the ≤30 m walk-edge invariant.
   */
  isBridge?: boolean;
  /**
   * Connector metadata copied from the source RoutingConnectorFeature at build
   * time. Present only on `edgeType === 'connector'` edges. Used by effort/time
   * post-processing to derive stair ascent/descent and elevator ride counts.
   */
  connectorMeta?: {
    connectorType: 'stair' | 'elevator';
    connectsLevels: [number, number];
  };
}

/** Full routing graph assembled per building or floor-set. */
export interface RouteGraph {
  nodes: Map<string, RouteNode>;
  edges: RouteEdge[];
  /** Adjacency list: node ID → neighbour node IDs. */
  adjacency: Map<string, string[]>;
}

// ── Route Segments & Results ────────────────────────────────────────

/** A contiguous segment of the route on a single floor level. */
export interface RouteFloorSegment {
  level: number;
  /** Ordered node IDs traversed on this floor. */
  nodeIds: string[];
  /** Cumulative distance for this floor segment in metres. */
  distanceMeters: number;
  /** If this segment ends with a floor transition (stair/elevator). */
  connectorTransition?: {
    connectorId: string;
    fromLevel: number;
    toLevel: number;
  };
}

/** Aggregate statistics about connector usage along a route. */
export interface RouteConnectorStats {
  /** Floors climbed by stairs (sum of positive level deltas on stair edges). */
  stairAscentFloors: number;
  /** Floors descended by stairs (sum of negative level deltas on stair edges). */
  stairDescentFloors: number;
  /** Number of elevator rides used. */
  elevatorRideCount: number;
  /** Total floor changes (absolute delta across all connector edges). */
  floorChangeCount: number;
}

/**
 * Discriminated union for route result.
 * - `ok: true` → successful route with segments
 * - `ok: false` → failure with a human-readable reason
 */
export type RouteResult =
  | {
      ok: true;
      floorSegments: RouteFloorSegment[];
      totalDistanceMeters: number;
      estimatedTimeSeconds: number;
      /** Total effort cost in "equivalent flat walking metres". */
      effortMeters: number;
      /** Normalized effort score: effortMeters / 100. */
      effortScore: number;
      /** Aggregate connector usage stats. */
      connectorStats: RouteConnectorStats;
      /** Whether stairs were used (true) or elevators only (false). */
      usedStairsFallback: boolean;
      /** Optional warning (e.g. "partial route – destination unreachable"). */
      warning?: string;
      /** Actual origin coordinates in EPSG:5183 (for rendering beyond last graph node). */
      originPoint?: { x: number; y: number; level: number };
      /** Actual destination coordinates in EPSG:5183 (for rendering beyond last graph node). */
      destinationPoint?: { x: number; y: number; level: number };
    }
  | {
      ok: false;
      /** Human-readable reason the route could not be computed. */
      reason: string;
    };

// ── GeoJSON-derived Types for Walkable Areas & Connectors ───────────

/** GeoJSON Feature representing a walkable polygon (floor area). */
export interface RoutingWalkableAreaFeature {
  type: 'Feature';
  geometry: {
    type: 'Polygon';
    coordinates: [number, number][][];
  };
  properties: {
    level: number;
    areaSquareMeters: number;
    /** IDs of the original CampusFeature(s) that contributed to this area. */
    sourceFeatureIds: string[];
  };
}

/** GeoJSON Feature representing a floor connector (stair or elevator). */
export interface RoutingConnectorFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: {
    connectorType: 'stair' | 'elevator';
    /** From level → to level as a tuple. */
    connectsLevels: [number, number];
    /** Estimated traversal time in seconds. */
    traversalTimeSeconds: number;
    /** Accessibility penalty (0 for elevator, >0 for stairs). */
    accessibilityPenalty: number;
    /** IDs of the original CampusFeature(s) that sourced this connector. */
    sourceFeatureIds: string[];
    confidence: 'auto' | 'manual';
  };
}

// ── Route Origin & Destination ──────────────────────────────────────

/** Origin of a route request — either the user's live location or a selected place. */
export type RouteOrigin =
  | {
      type: 'user_location';
      coordinates: [number, number];
      level: number;
      /** Optional horizontal accuracy estimate in metres. */
      accuracy?: number;
    }
  | {
      type: 'selected_place';
      featureId: string;
      coordinates: [number, number];
      level: number;
    };

/** Destination of a route request — always a selected place/feature. */
export interface RouteDestination {
  featureId: string;
  coordinates: [number, number];
  level: number;
}

/**
 * A single route option presented to the user.
 *
 * Produced by the multi-profile Yen's k-shortest engine. The `profile` field
 * records which semantic weight produced this candidate (for debugging); the
 * user-facing `label`/`badge` are derived from the route's winning attribute.
 */
export interface RouteOption {
  /** Stable identifier (e.g. 'fastest-0', 'easiest-1', 'shortest-0'). */
  id: string;
  /** Korean display label: '가장 빠름', '가장 가까움', '가장 편함', '추천', '엘리베이터 경로'. */
  label: string;
  /** Short Korean badge describing the winning attribute: '빠름' | '가까움' | '편함' | '엘리베이터'. */
  badge?: string;
  /** Which routing profile produced this candidate. */
  profile: RouteProfile;
  /** The accessibility mode that produced this result (legacy compat). */
  accessibilityMode: RouteAccessibilityMode;
  /** The computed route result. */
  result: RouteResult;
  /** Balanced rank score (lower = better). Computed by the ranking pipeline. */
  balancedScore?: number;
}
