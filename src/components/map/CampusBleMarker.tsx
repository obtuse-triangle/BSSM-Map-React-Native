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
};

type StoreSnapshot = {
  status: string;
  result: BleWclResult | null;
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
    properties: { accuracyMeters: number };
  }>;
} {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: 'ble-marker',
        geometry: {
          type: 'Point',
          coordinates: [data.longitude, data.latitude],
        },
        properties: {
          accuracyMeters: data.accuracyMeters,
        },
      },
    ],
  };
}

/** Read current BLE result from store and return MarkerData (or null). */
function snapshotToMarkerData(snapshot: StoreSnapshot): MarkerData | null {
  if (snapshot.status !== 'success' || !snapshot.result) {
    return null;
  }
  return {
    longitude: snapshot.result.longitude,
    latitude: snapshot.result.latitude,
    accuracyMeters: snapshot.result.accuracyMeters,
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
  });

  // ── Imperative store subscription (NO React re-render on every tick) ─
  useEffect(() => {
    /* Bootstrap from current store state (avoids flash-of-no-marker on
     * mount when a BLE result already exists). */
    const initial = useBleLocationStore.getState();
    const initialSnapshot: StoreSnapshot = {
      status: initial.status,
      result: initial.result,
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
      const { status, result } = useBleLocationStore.getState();
      lastSnapshotRef.current = { status, result };

      if (status === 'success' && result) {
        /* Trigger a minimal React render to update the GeoJSON source.
         * This is the ONLY render the marker subtree performs per BLE
         * update — the parent CampusMap is NOT affected. */
        setMarkerData({
          longitude: result.longitude,
          latitude: result.latitude,
          accuracyMeters: result.accuracyMeters,
        });
      } else {
        /* No valid position — hide the marker.
         * setMarkerData(null) triggers a render that returns null,
         * removing the GeoJSONSource + Layers from the tree. */
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
      if (!coords || snapshot.status !== 'success' || !snapshot.result) {
        return;
      }

      setMarkerData({
        longitude: coords.longitude,
        latitude: coords.latitude,
        accuracyMeters: snapshot.result.accuracyMeters,
      });
    });

    return () => {
      unsubBle();
      unsubMap();
    };
  }, []);

  // ── Memoised GeoJSON — only re-computes when markerData identity changes ─
  const geoJsonData = useMemo(() => {
    if (!markerData) return null;
    return makeMarkerGeoJson(markerData);
  }, [markerData]);

  // ── Render ───────────────────────────────────────────────────────────────
  if (!geoJsonData) {
    return null;
  }

  return (
    <GeoJSONSource id="ble-marker" data={geoJsonData}>
      {/* Accuracy radius — semi-transparent circle sized by accuracyMeters */}
      <Layer
        id="ble-accuracy-circle"
        type="circle"
        paint={{
          'circle-radius': ['max', ['*', ['get', 'accuracyMeters'], 3], 24],
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
        paint={{
          'circle-radius': 8,
          'circle-color': '#2979FF',
          'circle-opacity': 0.9,
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-width': 2,
        }}
      />
    </GeoJSONSource>
  );
}

/** React.memo prevents parent (CampusMap) re-renders from cascading into
 *  this component.  CampusBleMarker only re-renders when its internal
 *  `markerData` state changes (≈1 Hz from BLE WCL, or on mount). */
export default React.memo(CampusBleMarker);
