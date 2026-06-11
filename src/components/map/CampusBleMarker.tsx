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
import type { FusionConfidenceLevel, FusionState } from '../../types/fusion';

const MARKER_EASE_DURATION_MS = 300;

// ── Types ────────────────────────────────────────────────────────────────

type MarkerData = {
  longitude: number;
  latitude: number;
  accuracyMeters: number;
  heading: number | null;
  source: string;
  confidence: number;
  confidenceLevel: FusionConfidenceLevel;
  inferredZoneName: string | null;
};

type MarkerFeatureKind = 'position' | 'heading';

type StoreSnapshot = {
  status: string;
  result: BleWclResult | null;
  fusionState: FusionState | null;
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
      source: string;
      confidence: number;
      confidenceLevel: FusionConfidenceLevel;
      inferredZoneName: string | null;
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
      source: string;
      confidence: number;
      confidenceLevel: FusionConfidenceLevel;
      inferredZoneName: string | null;
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
        source: data.source,
        confidence: data.confidence,
        confidenceLevel: data.confidenceLevel,
        inferredZoneName: data.inferredZoneName,
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
        source: data.source,
        confidence: data.confidence,
        confidenceLevel: data.confidenceLevel,
        inferredZoneName: data.inferredZoneName,
      },
    });
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

function snapshotToMarkerData(snapshot: StoreSnapshot): MarkerData | null {
  const { fusionState, result, currentHeading } = snapshot;

  if (fusionState && fusionState.confidenceLevel !== 'unknown') {
    return {
      longitude: fusionState.lng,
      latitude: fusionState.lat,
      accuracyMeters: fusionState.accuracyMeters,
      heading: fusionState.headingDeg ?? currentHeading,
      source: fusionState.source,
      confidence: fusionState.confidence,
      confidenceLevel: fusionState.confidenceLevel,
      inferredZoneName: fusionState.inferredZone?.zoneName ?? fusionState.inferredZone?.zoneNameKo ?? null,
    };
  }

  if (!result) {
    return null;
  }

  return {
    longitude: result.longitude,
    latitude: result.latitude,
    accuracyMeters: result.accuracyMeters,
    heading: currentHeading,
    source: result.source,
    confidence: result.confidence,
    confidenceLevel: 'unknown',
    inferredZoneName: null,
  };
}

// ── Component ────────────────────────────────────────────────────────────

function CampusBleMarker() {
  const [markerData, setMarkerData] = useState<MarkerData | null>(null);

  const animRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fromPosRef = useRef<{ lng: number; lat: number } | null>(null);
  const targetDataRef = useRef<MarkerData | null>(null);

  const lastSnapshotRef = useRef<StoreSnapshot>({
    status: useBleLocationStore.getState().status,
    result: useBleLocationStore.getState().result,
    fusionState: useBleLocationStore.getState().fusionState,
    currentHeading: useBleLocationStore.getState().currentHeading,
  });

  const startEaseTo = (target: MarkerData) => {
    const fromLng = fromPosRef.current?.lng ?? target.longitude;
    const fromLat = fromPosRef.current?.lat ?? target.latitude;
    const start = Date.now();

    if (animRef.current) clearTimeout(animRef.current);

    const tick = () => {
      const elapsed = Date.now() - start;
      const t = Math.min(elapsed / MARKER_EASE_DURATION_MS, 1);
      const eased = 1 - Math.pow(1 - t, 3);

      const curLng = fromLng + (target.longitude - fromLng) * eased;
      const curLat = fromLat + (target.latitude - fromLat) * eased;

      setMarkerData({ ...target, longitude: curLng, latitude: curLat });

      if (t < 1) {
        animRef.current = setTimeout(tick, 16);
      } else {
        fromPosRef.current = { lng: target.longitude, lat: target.latitude };
        animRef.current = null;
      }
    };

    tick();
  };

  useEffect(() => {
    const initial = useBleLocationStore.getState();
    const initialSnapshot: StoreSnapshot = {
      status: initial.status,
      result: initial.result,
      fusionState: initial.fusionState,
      currentHeading: initial.currentHeading,
    };
    lastSnapshotRef.current = initialSnapshot;

    const initialData = snapshotToMarkerData(initialSnapshot);
    if (initialData) {
      setMarkerData(initialData);
      fromPosRef.current = { lng: initialData.longitude, lat: initialData.latitude };
    }

    const unsubBle = useBleLocationStore.subscribe(() => {
      const { status, result, fusionState, currentHeading } = useBleLocationStore.getState();
      lastSnapshotRef.current = { status, result, fusionState, currentHeading };

      const nextMarkerData = snapshotToMarkerData({ status, result, fusionState, currentHeading });

      if (nextMarkerData) {
        targetDataRef.current = nextMarkerData;
        startEaseTo(nextMarkerData);
      } else {
        if (animRef.current) { clearTimeout(animRef.current); animRef.current = null; }
        fromPosRef.current = null;
        setMarkerData(null);
      }
    });

    const unsubMap = useMapStore.subscribe(() => {
      const snapshot = lastSnapshotRef.current;
      const marker = snapshotToMarkerData(snapshot);
      if (marker) {
        startEaseTo(marker);
      }
    });

    return () => {
      unsubBle();
      unsubMap();
      if (animRef.current) clearTimeout(animRef.current);
    };
  }, []);

  const geoJsonData = useMemo(() => {
    if (!markerData) return null;
    return makeMarkerGeoJson(markerData);
  }, [markerData]);

  if (!geoJsonData) return null;

  const showHeadingArrow = markerData?.heading != null;

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
            15,
            ['*', ['get', 'accuracyMeters'], 0.53],
            17,
            ['*', ['get', 'accuracyMeters'], 2.11],
            19,
            ['*', ['get', 'accuracyMeters'], 8.44],
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
