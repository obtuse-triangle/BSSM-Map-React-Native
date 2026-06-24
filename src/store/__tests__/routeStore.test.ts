import type { RouteAccessibilityMode, RouteDestination, RouteOrigin, RouteResult } from '../../types/routing';
import { setRouteComputer, useRouteStore } from '../routeStore';

// ── Helpers ────────────────────────────────────────────────────────

/** Known valid feature ID from campus-wgs84.json (정독실, level 1). */
const VALID_FEATURE_ID = '1-4-7';

/**
 * Default mock computer used to reset between tests.
 * Returns a deterministic success result.
 */
function defaultMockComputer(input: {
  origin: RouteOrigin;
  destination: RouteDestination;
  accessibilityMode: RouteAccessibilityMode;
}): RouteResult {
  return {
    ok: true,
    floorSegments: [
      {
        level: input.origin.level,
        nodeIds: ['mock-origin', 'mock-destination'],
        distanceMeters: 50,
      },
    ],
    totalDistanceMeters: 50,
    estimatedTimeSeconds: 60,
    usedStairsFallback: false,
  };
}

/** Set up origin and destination so computeRoute can succeed. */
function setValidRoute(): void {
  useRouteStore.getState().setOriginFromFeature(VALID_FEATURE_ID);
  useRouteStore.getState().setDestinationFeature(VALID_FEATURE_ID);
}

/**
 * Flush the macrotask queue so deferred computeRouteOptions (setTimeout(0))
 * completes before assertions. The store yields to the UI thread before the
 * heavy computation, so tests must await the same yield.
 */
function flushCompute(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// ── Suite ──────────────────────────────────────────────────────────

describe('routeStore', () => {
  beforeEach(() => {
    // Reset all route state and restore default computer
    useRouteStore.getState().clearRoute();
    useRouteStore.setState({ accessibilityMode: 'normal' });
    setRouteComputer(defaultMockComputer);
  });

  // ── 1. Initial state ────────────────────────────────────────────

  describe('initial state', () => {
    it('has all route fields null and defaults', () => {
      const s = useRouteStore.getState();
      expect(s.routeOrigin).toBeNull();
      expect(s.routeDestination).toBeNull();
      expect(s.routeResult).toBeNull();
      expect(s.accessibilityMode).toBe('normal');
      expect(s.isComputing).toBe(false);
      expect(s.error).toBeNull();
    });
  });

  // ── 2. setOriginFromFeature ─────────────────────────────────────

  describe('setOriginFromFeature', () => {
    it('resolves a valid campus feature and stores coordinates and level', () => {
      useRouteStore.getState().setOriginFromFeature(VALID_FEATURE_ID);
      const s = useRouteStore.getState();
      expect(s.routeOrigin).not.toBeNull();
      expect(s.routeOrigin!.type).toBe('selected_place');
      expect(s.routeOrigin!.featureId).toBe(VALID_FEATURE_ID);
      expect(Array.isArray(s.routeOrigin!.coordinates)).toBe(true);
      expect(s.routeOrigin!.coordinates.length).toBe(2);
      expect(typeof s.routeOrigin!.coordinates[0]).toBe('number');
      expect(typeof s.routeOrigin!.coordinates[1]).toBe('number');
      expect(s.routeOrigin!.level).toBe(1);
      expect(s.error).toBeNull();
    });
  });

  // ── 3. setOriginFromUserLocation ────────────────────────────────

  describe('setOriginFromUserLocation', () => {
    it('stores user location with coordinates and level', () => {
      useRouteStore.getState().setOriginFromUserLocation([127.0, 37.5], 2);
      const s = useRouteStore.getState();
      expect(s.routeOrigin).not.toBeNull();
      expect(s.routeOrigin!.type).toBe('user_location');
      expect(s.routeOrigin!.coordinates).toEqual([127.0, 37.5]);
      expect(s.routeOrigin!.level).toBe(2);
      expect(s.routeOrigin).not.toHaveProperty('accuracy');
      expect(s.error).toBeNull();
    });

    it('stores user location with accuracy when provided', () => {
      useRouteStore.getState().setOriginFromUserLocation([127.0, 37.5], 2, 5.0);
      const s = useRouteStore.getState();
      expect(s.routeOrigin).not.toBeNull();
      expect(s.routeOrigin!.type).toBe('user_location');
      expect(s.routeOrigin!.accuracy).toBe(5.0);
    });
  });

  // ── 4. setDestinationFeature ────────────────────────────────────

  describe('setDestinationFeature', () => {
    it('resolves destination correctly', () => {
      useRouteStore.getState().setDestinationFeature(VALID_FEATURE_ID);
      const s = useRouteStore.getState();
      expect(s.routeDestination).not.toBeNull();
      expect(s.routeDestination!.featureId).toBe(VALID_FEATURE_ID);
      expect(Array.isArray(s.routeDestination!.coordinates)).toBe(true);
      expect(s.routeDestination!.coordinates.length).toBe(2);
      expect(s.routeDestination!.level).toBe(1);
      expect(s.error).toBeNull();
    });
  });

  // ── 5. computeRoute — no origin ─────────────────────────────────

  describe('computeRoute', () => {
    it('with no origin sets error ROUTE_ORIGIN_REQUIRED', () => {
      useRouteStore.getState().setDestinationFeature(VALID_FEATURE_ID);
      useRouteStore.getState().computeRoute();
      const s = useRouteStore.getState();
      expect(s.error).toBe('ROUTE_ORIGIN_REQUIRED');
      expect(s.isComputing).toBe(false);
      expect(s.routeResult).toBeNull();
    });

    // ── 6. computeRoute — no destination ──────────────────────────

    it('with no destination sets error ROUTE_DESTINATION_REQUIRED', () => {
      useRouteStore.getState().setOriginFromFeature(VALID_FEATURE_ID);
      useRouteStore.getState().computeRoute();
      const s = useRouteStore.getState();
      expect(s.error).toBe('ROUTE_DESTINATION_REQUIRED');
      expect(s.isComputing).toBe(false);
      expect(s.routeResult).toBeNull();
    });

    // ── 7. computeRoute — success ─────────────────────────────────

    it('with both origin and destination returns mock success result', async () => {
      setValidRoute();
      useRouteStore.getState().computeRoute();
      await flushCompute();
      const s = useRouteStore.getState();
      expect(s.isComputing).toBe(false);
      expect(s.error).toBeNull();
      expect(s.routeResult).not.toBeNull();
      expect(s.routeResult!.ok).toBe(true);
      if (s.routeResult!.ok) {
        expect(s.routeResult.floorSegments).toHaveLength(1);
        expect(s.routeResult.totalDistanceMeters).toBe(50);
        expect(s.routeResult.estimatedTimeSeconds).toBe(60);
        expect(s.routeResult.usedStairsFallback).toBe(false);
      }
    });
  });

  // ── 8. clearRoute ───────────────────────────────────────────────

  describe('clearRoute', () => {
    it('resets result, error, origin, destination, and computing but NOT accessibilityMode', async () => {
      // First set up a computed route
      setValidRoute();
      useRouteStore.getState().computeRoute();
      await flushCompute();
      useRouteStore.getState().setAccessibilityMode('elevator_priority');

      // Verify we have state
      expect(useRouteStore.getState().routeOrigin).not.toBeNull();
      expect(useRouteStore.getState().routeDestination).not.toBeNull();
      expect(useRouteStore.getState().routeResult).not.toBeNull();
      expect(useRouteStore.getState().accessibilityMode).toBe('elevator_priority');

      // Clear
      useRouteStore.getState().clearRoute();

      const s = useRouteStore.getState();
      expect(s.routeOrigin).toBeNull();
      expect(s.routeDestination).toBeNull();
      expect(s.routeResult).toBeNull();
      expect(s.error).toBeNull();
      expect(s.isComputing).toBe(false);
      // accessibilityMode must NOT be reset
      expect(s.accessibilityMode).toBe('elevator_priority');
    });
  });

  // ── 9. setAccessibilityMode ─────────────────────────────────────

  describe('setAccessibilityMode', () => {
    it('toggles from normal to elevator_priority', () => {
      useRouteStore.getState().setAccessibilityMode('elevator_priority');
      expect(useRouteStore.getState().accessibilityMode).toBe('elevator_priority');
    });

    it('toggles from elevator_priority back to normal', () => {
      useRouteStore.getState().setAccessibilityMode('elevator_priority');
      useRouteStore.getState().setAccessibilityMode('normal');
      expect(useRouteStore.getState().accessibilityMode).toBe('normal');
    });
  });

  // ── 10. recomputeRoute ──────────────────────────────────────────

  describe('recomputeRoute', () => {
    it('re-routes when previous result exists', async () => {
      // Set up a route and compute it
      setValidRoute();
      useRouteStore.getState().computeRoute();
      await flushCompute();
      expect(useRouteStore.getState().routeResult).not.toBeNull();

      // Inject a different computer that returns different distance
      setRouteComputer(() => ({
        ok: true as const,
        floorSegments: [
          {
            level: 1,
            nodeIds: ['alt-origin', 'alt-destination'],
            distanceMeters: 200,
          },
        ],
        totalDistanceMeters: 200,
        estimatedTimeSeconds: 240,
        usedStairsFallback: true,
      }));

      useRouteStore.getState().recomputeRoute();
      await flushCompute();

      const s = useRouteStore.getState();
      expect(s.routeResult).not.toBeNull();
      expect(s.isComputing).toBe(false);
      expect(s.error).toBeNull();
      if (s.routeResult!.ok) {
        expect(s.routeResult.totalDistanceMeters).toBe(200);
        expect(s.routeResult.usedStairsFallback).toBe(true);
      }
    });

    it('is no-op when no previous result exists', async () => {
      setValidRoute();
      // setValidRoute now triggers auto-compute on setDestinationFeature,
      // so there is a prior result. recomputeRoute should work.
      await flushCompute();
      useRouteStore.getState().recomputeRoute();
      await flushCompute();
      const s = useRouteStore.getState();
      expect(s.routeResult).not.toBeNull();
      expect(s.isComputing).toBe(false);
    });
  });

  // ── 11. No-path response ────────────────────────────────────────

  describe('no-path response', () => {
    it('sets error and does not throw when compute returns ok:false', async () => {
      setRouteComputer(() => ({
        ok: false as const,
        reason: 'No path found',
      }));

      setValidRoute();
      useRouteStore.getState().computeRoute();
      await flushCompute();

      const s = useRouteStore.getState();
      expect(s.error).toBe('No path found');
      expect(s.routeResult).toBeNull();
      expect(s.isComputing).toBe(false);
    });
  });

  // ── 12. Isolation ───────────────────────────────────────────────

  describe('action isolation', () => {
    it('setOriginFromFeature does not mutate destination, result, or computing', async () => {
      useRouteStore.getState().setDestinationFeature(VALID_FEATURE_ID);
      const destBefore = useRouteStore.getState().routeDestination;
      // Destination is set but no origin yet — no routeOptions computed yet
      expect(useRouteStore.getState().routeResult).toBeNull();

      useRouteStore.getState().setOriginFromFeature(VALID_FEATURE_ID);
      // Now both are set → auto-compute fires, populating routeResult
      await flushCompute();

      const s = useRouteStore.getState();
      expect(s.routeDestination).toBe(destBefore);
      expect(s.routeResult).not.toBeNull();
      expect(s.isComputing).toBe(false);
    });

    it('setDestinationFeature does not mutate origin, result, or computing', async () => {
      useRouteStore.getState().setOriginFromFeature(VALID_FEATURE_ID);
      const originBefore = useRouteStore.getState().routeOrigin;
      // Origin is set but no destination yet — no routeOptions computed yet
      expect(useRouteStore.getState().routeResult).toBeNull();

      useRouteStore.getState().setDestinationFeature(VALID_FEATURE_ID);
      // Now both are set → auto-compute fires, populating routeResult
      await flushCompute();

      const s = useRouteStore.getState();
      expect(s.routeOrigin).toBe(originBefore);
      expect(s.routeResult).not.toBeNull();
      expect(s.isComputing).toBe(false);
    });

    it('setAccessibilityMode does not mutate route origin/destination/result', () => {
      setValidRoute();
      useRouteStore.getState().computeRoute();
      const originBefore = useRouteStore.getState().routeOrigin;
      const destBefore = useRouteStore.getState().routeDestination;
      const resultBefore = useRouteStore.getState().routeResult;

      useRouteStore.getState().setAccessibilityMode('elevator_priority');

      const s = useRouteStore.getState();
      expect(s.routeOrigin).toBe(originBefore);
      expect(s.routeDestination).toBe(destBefore);
      expect(s.routeResult).toBe(resultBefore);
    });

    it('clearRoute does not mutate accessibilityMode', () => {
      useRouteStore.getState().setAccessibilityMode('elevator_priority');
      useRouteStore.getState().clearRoute();
      expect(useRouteStore.getState().accessibilityMode).toBe('elevator_priority');
    });
  });
});
