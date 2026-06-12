import type {
  RouteAccessibilityMode,
  RouteDestination,
  RouteEdge,
  RouteFloorSegment,
  RouteGraph,
  RouteNode,
  RouteOrigin,
  RouteResult,
  RoutingConnectorFeature,
  RoutingWalkableAreaFeature,
} from '../../../types/routing';

// ── Runtime Validation Helpers ──────────────────────────────────────
// These helpers check that plain objects match the expected type shapes
// at runtime, since TS types are erased during compilation.

function isRouteResult(value: unknown): value is RouteResult {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (obj.ok === true) {
    return (
      Array.isArray(obj.floorSegments) &&
      typeof obj.totalDistanceMeters === 'number' &&
      typeof obj.estimatedTimeSeconds === 'number' &&
      typeof obj.usedStairsFallback === 'boolean'
    );
  }
  if (obj.ok === false) {
    return typeof obj.reason === 'string';
  }
  return false;
}

function isRouteNode(value: unknown): value is RouteNode {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  const validNodeTypes = [
    'polygon',
    'connector',
    'temp_origin',
    'temp_destination',
  ];
  return (
    typeof obj.id === 'string' &&
    typeof obj.x === 'number' &&
    typeof obj.y === 'number' &&
    typeof obj.level === 'number' &&
    validNodeTypes.includes(obj.nodeType as string)
  );
}

function isRouteEdge(value: unknown): value is RouteEdge {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  const validEdgeTypes = ['walk', 'connector'];
  return (
    typeof obj.from === 'string' &&
    typeof obj.to === 'string' &&
    typeof obj.weightMeters === 'number' &&
    typeof obj.level === 'number' &&
    typeof obj.accessibilityPenalty === 'number' &&
    validEdgeTypes.includes(obj.edgeType as string)
  );
}

function isRouteAccessibilityMode(
  value: unknown,
): value is RouteAccessibilityMode {
  return value === 'normal' || value === 'elevator_priority';
}

// ── Tests ───────────────────────────────────────────────────────────

describe('routing types / schema', () => {
  // ── RouteAccessibilityMode ───────────────────────────────────────

  describe('RouteAccessibilityMode', () => {
    it('accepts "normal" and "elevator_priority"', () => {
      expect(isRouteAccessibilityMode('normal')).toBe(true);
      expect(isRouteAccessibilityMode('elevator_priority')).toBe(true);
    });

    it('rejects unknown values', () => {
      expect(isRouteAccessibilityMode('stairs_only')).toBe(false);
      expect(isRouteAccessibilityMode('')).toBe(false);
      expect(isRouteAccessibilityMode(null)).toBe(false);
      expect(isRouteAccessibilityMode(undefined)).toBe(false);
    });
  });

  // ── RouteNode ────────────────────────────────────────────────────

  describe('RouteNode', () => {
    const validNode: RouteNode = {
      id: 'n-001',
      x: 191248.547,
      y: 188085.015,
      level: 1,
      nodeType: 'polygon',
    };

    it('accepts a fully populated node', () => {
      expect(isRouteNode(validNode)).toBe(true);
    });

    it('rejects a node with missing fields', () => {
      expect(isRouteNode({ id: 'n-001' })).toBe(false);
      expect(isRouteNode(null)).toBe(false);
      expect(isRouteNode(undefined)).toBe(false);
    });

    it('rejects a node with invalid nodeType', () => {
      const bad = { ...validNode, nodeType: 'elevator' };
      expect(isRouteNode(bad)).toBe(false);
    });
  });

  // ── RouteEdge ────────────────────────────────────────────────────

  describe('RouteEdge', () => {
    const validEdge: RouteEdge = {
      from: 'n-001',
      to: 'n-002',
      weightMeters: 12.5,
      level: 1,
      accessibilityPenalty: 0,
      edgeType: 'walk',
    };

    it('accepts a fully populated edge', () => {
      expect(isRouteEdge(validEdge)).toBe(true);
    });

    it('accepts a connector edge with connectorId', () => {
      const connectorEdge: RouteEdge = {
        ...validEdge,
        edgeType: 'connector',
        connectorId: 'stair-01',
        accessibilityPenalty: 5,
      };
      expect(isRouteEdge(connectorEdge)).toBe(true);
    });

    it('rejects an edge with missing fields', () => {
      expect(isRouteEdge({ from: 'n-001' })).toBe(false);
      expect(isRouteEdge(null)).toBe(false);
    });

    it('rejects an edge with invalid edgeType', () => {
      const bad = { ...validEdge, edgeType: 'escalator' };
      expect(isRouteEdge(bad)).toBe(false);
    });
  });

  // ── RouteResult (discriminated union) ────────────────────────────

  describe('RouteResult', () => {
    it('accepts an ok:true result with all fields', () => {
      const result: RouteResult = {
        ok: true,
        floorSegments: [
          {
            level: 1,
            nodeIds: ['n-001', 'n-002'],
            distanceMeters: 12.5,
          },
        ],
        totalDistanceMeters: 12.5,
        estimatedTimeSeconds: 18,
        usedStairsFallback: false,
      };
      expect(isRouteResult(result)).toBe(true);
    });

    it('accepts an ok:true result with connectorTransition', () => {
      const segment: RouteFloorSegment = {
        level: 1,
        nodeIds: ['n-001', 'n-002'],
        distanceMeters: 10,
        connectorTransition: {
          connectorId: 'stair-a',
          fromLevel: 1,
          toLevel: 2,
        },
      };
      const result: RouteResult = {
        ok: true,
        floorSegments: [segment],
        totalDistanceMeters: 10,
        estimatedTimeSeconds: 25,
        usedStairsFallback: true,
        warning: 'Using stairs – elevator recommended',
      };
      expect(isRouteResult(result)).toBe(true);
    });

    it('accepts an ok:false result with reason', () => {
      const result: RouteResult = {
        ok: false,
        reason: 'No path found between origin and destination',
      };
      expect(isRouteResult(result)).toBe(true);
    });

    it('rejects an object missing the required discriminated field', () => {
      expect(isRouteResult({})).toBe(false);
      expect(isRouteResult(null)).toBe(false);
    });
  });

  // ── RouteOrigin ──────────────────────────────────────────────────

  describe('RouteOrigin', () => {
    it('constructs a user_location origin', () => {
      const origin: RouteOrigin = {
        type: 'user_location',
        coordinates: [191248.5, 188085.0],
        level: 1,
        accuracy: 5.0,
      };
      expect(origin.type).toBe('user_location');
      expect(origin.coordinates).toHaveLength(2);
      expect(typeof origin.accuracy).toBe('number');
    });

    it('constructs a selected_place origin without accuracy', () => {
      const origin: RouteOrigin = {
        type: 'selected_place',
        featureId: 'room-101',
        coordinates: [191240.0, 188080.0],
        level: 1,
      };
      expect(origin.type).toBe('selected_place');
      expect(origin.featureId).toBe('room-101');
    });
  });

  // ── RouteDestination ─────────────────────────────────────────────

  describe('RouteDestination', () => {
    it('constructs a destination with required fields', () => {
      const dest: RouteDestination = {
        featureId: 'room-302',
        coordinates: [191200.0, 188050.0],
        level: 3,
      };
      expect(dest.featureId).toBe('room-302');
      expect(dest.level).toBe(3);
    });
  });

  // ── RouteGraph ───────────────────────────────────────────────────

  describe('RouteGraph', () => {
    it('constructs a graph with nodes, edges, and adjacency', () => {
      const graph: RouteGraph = {
        nodes: new Map([['n-001', { id: 'n-001', x: 0, y: 0, level: 1, nodeType: 'polygon' }]]),
        edges: [{ from: 'n-001', to: 'n-002', weightMeters: 10, level: 1, accessibilityPenalty: 0, edgeType: 'walk' }],
        adjacency: new Map([['n-001', ['n-002']]]),
      };
      expect(graph.nodes.size).toBe(1);
      expect(graph.edges).toHaveLength(1);
      expect(graph.adjacency.get('n-001')).toEqual(['n-002']);
    });
  });

  // ── RoutingWalkableAreaFeature ───────────────────────────────────

  describe('RoutingWalkableAreaFeature', () => {
    it('constructs a polygon walkable area', () => {
      const area: RoutingWalkableAreaFeature = {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[[191200, 188000], [191210, 188000], [191210, 188010], [191200, 188010], [191200, 188000]]],
        },
        properties: {
          level: 1,
          areaSquareMeters: 100,
          sourceFeatureIds: ['corridor-1f-main'],
        },
      };
      expect(area.type).toBe('Feature');
      expect(area.geometry.type).toBe('Polygon');
      expect(area.properties.level).toBe(1);
    });
  });

  // ── RoutingConnectorFeature ──────────────────────────────────────

  describe('RoutingConnectorFeature', () => {
    it('constructs a stair connector', () => {
      const connector: RoutingConnectorFeature = {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [191220, 188030],
        },
        properties: {
          connectorType: 'stair',
          connectsLevels: [1, 2],
          traversalTimeSeconds: 15,
          accessibilityPenalty: 5,
          sourceFeatureIds: ['stair-1f-north'],
          confidence: 'auto',
        },
      };
      expect(connector.properties.connectorType).toBe('stair');
      expect(connector.properties.connectsLevels).toEqual([1, 2]);
    });

    it('constructs an elevator connector', () => {
      const connector: RoutingConnectorFeature = {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [191230, 188040],
        },
        properties: {
          connectorType: 'elevator',
          connectsLevels: [1, 4],
          traversalTimeSeconds: 30,
          accessibilityPenalty: 0,
          sourceFeatureIds: ['elevator-main'],
          confidence: 'manual',
        },
      };
      expect(connector.properties.connectorType).toBe('elevator');
      expect(connector.properties.accessibilityPenalty).toBe(0);
    });
  });
});
