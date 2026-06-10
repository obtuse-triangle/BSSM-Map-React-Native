/**
 * CampusBleMarker — BLE WCL position marker rendered on the MapLibre map.
 *
 * ## Design
 *
 * This component avoids cascading React re-renders by subscribing to the
 * Zustand stores **imperatively** (`store.subscribe()`) instead of through
 * React hooks.  The only React state is a `markerData` blob that is updated
 * when the BLE scan result actually changes — which happens at ≈1 Hz.
 *
 * ## Data flow
 *
 *   bleLocationStore (result / status)
 *       │
 *       └── imperative subscribe (no React re-render)
 *               ↓
 *           setMarkerData (1 Hz React render, isolated to this subtree)
 *               ↓
 *           GeoJSONSource data (native → MapLibre GL)
 *
 * @see CampusMap.tsx — renders this inside <Map>
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { useBleLocationStore } from '../../store/bleLocationStore';
import { useMapStore } from '../../store/mapStore';
import type { BleWclResult } from '../../services/location/bleWclProvider';

// ── Types ────────────────────────────────────────────────────────────────

type MarkerData = {
  longitude: number;
  latitude: number;
  accuracyMeters: number;
  heading: number | null;
};

type MarkerFeatureKind = 'position' | 'heading';

type StoreSnapshot = {
  status: string;
  result: BleWclResult | null;
  currentHeading: number | null;
};

// ── Constants ────────────────────────────────────────────────────────────

// ── GeoJSON helpers ──────────────────────────────────────────────────────

function makeMarkerGeoJson(
  data: MarkerData,
): {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    id: string;
    geometry: { type: 'Point'; coordinates: [number, number] };
    properties: {
      kind: MarkerFeatureKind;
      accuracyMeters: number;
      heading: number | null;
    };
  }>;
} {
  const features: Array<{
    type: 'Feature';
    id: string;
    geometry: { type: 'Point'; coordinates: [number, number] };
    properties: {
      kind: MarkerFeatureKind;
      accuracyMeters: number;
      heading: number | null;
    };
  }> = [
    {
      type: 'Feature',
      id: 'ble-marker',
      geometry: {
        type: 'Point',
        coordinates: [data.longitude, data.latitude],
      },
      properties: {
        kind: 'position',
        accuracyMeters: data.accuracyMeters,
        heading: data.heading,
      },
    },
  ];

  if (data.heading != null) {
    const headingRad = (data.heading * Math.PI) / 180;
    const dx = Math.sin(headingRad) * 0.00005;
    const dy = Math.cos(headingRad) * 0.00005;

    features.push({
      type: 'Feature',
      id: 'ble-heading-indicator',
      geometry: {
        type: 'Point',
        coordinates: [data.longitude + dx, data.latitude + dy],
      },
      properties: {
        kind: 'heading',
        accuracyMeters: data.accuracyMeters,
        heading: data.heading,
      },
    });
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

/** Read current BLE result from store and return MarkerData (or null). */
function snapshotToMarkerData(snapshot: StoreSnapshot): MarkerData | null {
  if (!snapshot.result) {
    return null;
  }
  return {
    longitude: snapshot.result.longitude,
    latitude: snapshot.result.latitude,
    accuracyMeters: snapshot.result.accuracyMeters,
    heading: snapshot.currentHeading,
  };
}

// ── Component ────────────────────────────────────────────────────────────

function CampusBleMarker() {
  // ── React state — drives GeoJSON rendering (updated at 1 Hz) ─────────
  const [markerData, setMarkerData] = useState<MarkerData | null>(null);

  // ── Ref to hold latest snapshot for synchronous access ───────────────
  const lastSnapshotRef = useRef<StoreSnapshot>({
    status: useBleLocationStore.getState().status,
    result: useBleLocationStore.getState().result,
    currentHeading: useBleLocationStore.getState().currentHeading,
  });

  // ── Imperative store subscription (NO React re-render on every tick) ─
  useEffect(() => {
    /* Bootstrap from current store state (avoids flash-of-no-marker on
     * mount when a BLE result already exists). */
    const initial = useBleLocationStore.getState();
    const initialSnapshot: StoreSnapshot = {
      status: initial.status,
      result: initial.result,
      currentHeading: initial.currentHeading,
    };
    lastSnapshotRef.current = initialSnapshot;

    const initialData = snapshotToMarkerData(initialSnapshot);
    if (initialData) {
      setMarkerData(initialData);
    }

    /* Subscribe to BLE store changes imperatively.
     * Zustand v5 subscribe(listener) — does NOT cause React re-renders.
     * We call getState() inside the listener for the latest snapshot. */
    const unsubBle = useBleLocationStore.subscribe(() => {
      const { status, result, currentHeading } = useBleLocationStore.getState();
      lastSnapshotRef.current = { status, result, currentHeading };

      if (__DEV__) {
        console.log('[BLE-MARKER] Subscribe triggered: status=', status, 'result=', result ? `${result.longitude.toFixed(6)},${result.latitude.toFixed(6)}` : null);
      }

      if (result) {
        /* Trigger a minimal React render to update the GeoJSON source.
         * This is the ONLY render the marker subtree performs per BLE
         * update — the parent CampusMap is NOT affected. */
        if (__DEV__) {
          console.log('[BLE-MARKER] Setting markerData to:', result.longitude.toFixed(6), result.latitude.toFixed(6));
        }
        setMarkerData({
          longitude: result.longitude,
          latitude: result.latitude,
          accuracyMeters: result.accuracyMeters,
          heading: currentHeading,
        });
      } else {
        /* No valid position — hide the marker.
         * setMarkerData(null) triggers a render that returns null,
         * removing the GeoJSONSource + Layers from the tree. */
        if (__DEV__) {
          console.log('[BLE-MARKER] Clearing markerData (null)');
        }
        setMarkerData(null);
      }
    });

    /* Also subscribe to mapStore.userCoordinates — the GPS path AND the
     * BLE path both write here.  This catch‑all ensures the marker still
     * appears correctly during the transition period while BLE results
     * are being computed. */
    const unsubMap = useMapStore.subscribe(() => {
      const coords = useMapStore.getState().userCoordinates;
      /* Only react if we already have a BLE result (the accuracy circle
       * needs bleResult.accuracyMeters, which is not available from
       * mapStore alone).  Without this guard the marker would briefly
       * show GPS position without accuracy data. */
      const snapshot = lastSnapshotRef.current;
       if (!coords || !snapshot.result) {
        return;
      }

      setMarkerData({
        longitude: coords.longitude,
        latitude: coords.latitude,
        accuracyMeters: snapshot.result.accuracyMeters,
        heading: snapshot.currentHeading,
      });
    });

    return () => {
      unsubBle();
      unsubMap();
    };
  }, []);

  // ── Memoised GeoJSON — only re-computes when markerData identity changes ─
  const geoJsonData = useMemo(() => {
    if (!markerData) {
      if (__DEV__) console.log('[BLE-MARKER] geoJsonData: null (no markerData)');
      return null;
    }
    const geoJson = makeMarkerGeoJson(markerData);
    if (__DEV__) console.log('[BLE-MARKER] geoJsonData created:', JSON.stringify(geoJson.features[0].geometry.coordinates));
    return geoJson;
  }, [markerData]);

  // ── Render ───────────────────────────────────────────────────────────────
  if (!geoJsonData) {
    return null;
  }

  const showHeadingArrow = markerData?.heading != null;

  if (__DEV__) {
    console.log('[BLE-MARKER] heading debug:', markerData?.heading, 'showHeadingArrow:', showHeadingArrow);
  }

  return (
    <GeoJSONSource id="ble-marker" data={geoJsonData}>
      {/* Accuracy radius — semi-transparent circle sized by accuracyMeters */}
      <Layer
        id="ble-accuracy-circle"
        type="circle"
        filter={['==', ['get', 'kind'], 'position']}
        paint={{
          'circle-pitch-alignment': 'map',
          'circle-pitch-scale': 'map',
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            14,
            ['*', ['get', 'accuracyMeters'], 0.25],
            18,
            ['*', ['get', 'accuracyMeters'], 1],
            22,
            ['*', ['get', 'accuracyMeters'], 4],
          ],
          'circle-color': '#2979FF',
          'circle-opacity': 0.15,
          'circle-stroke-color': '#2979FF',
          'circle-stroke-width': 1,
          'circle-stroke-opacity': 0.4,
        }}
      />
      {/* Centre dot — solid blue with white stroke */}
      <Layer
        id="ble-dot"
        type="circle"
        filter={['==', ['get', 'kind'], 'position']}
        paint={{
          'circle-pitch-alignment': 'map',
          'circle-pitch-scale': 'map',
          'circle-radius': 8,
          'circle-color': '#2979FF',
          'circle-opacity': 0.9,
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-width': 2,
        }}
      />
      {showHeadingArrow && (
        <Layer
          id="ble-heading-indicator"
          type="circle"
          filter={['==', ['get', 'kind'], 'heading']}
          paint={{
            'circle-pitch-alignment': 'map',
            'circle-pitch-scale': 'map',
            'circle-radius': 4.5,
            'circle-color': '#FFFFFF',
            'circle-stroke-color': '#2979FF',
            'circle-stroke-width': 2,
            'circle-opacity': 1,
          }}
        />
      )}
    </GeoJSONSource>
  );
}

/** React.memo prevents parent (CampusMap) re-renders from cascading into
 *  this component.  CampusBleMarker only re-renders when its internal
 *  `markerData` state changes (≈1 Hz from BLE WCL, or on mount). */
export default React.memo(CampusBleMarker);
