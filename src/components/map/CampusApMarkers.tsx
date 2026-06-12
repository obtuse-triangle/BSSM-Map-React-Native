/**
 * CampusApMarkers — BLE AP position markers rendered on the MapLibre map.
 *
 * ## Design
 *
 * This component avoids cascading React re-renders by subscribing to the
 * Zustand stores **imperatively** (`store.subscribe()`) instead of through
 * React hooks. The only React state is a `snapshot` blob that is updated
 * when the relevant store slices actually change.
 *
 * ## Data flow
 *
 *   mapStore (showApMarkers / selectedLevel)
 *   bleLocationStore (result.apContributions)
 *       │
 *       └── imperative subscribe (no React re-render)
 *               ↓
 *           setSnapshot (React render, isolated to this subtree)
 *               ↓
 *           buildApVisualizationGeoJson → GeoJSONSource (native → MapLibre GL)
 *
 * @see apVisualization.ts — helper functions that build the GeoJSON
 * @see CampusBleMarker.tsx — same imperative subscription pattern
 */

import React, { useEffect, useMemo, useState } from 'react';
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { useMapStore } from '../../store/mapStore';
import { useBleLocationStore } from '../../store/bleLocationStore';
import { BLE_AP_FIXTURES } from '../../constants/bleAccessPoints';
import { buildApVisualizationGeoJson } from './apVisualization';
import type { ApGeoJsonFeatureCollection } from './apVisualization';
import type { BleApContribution } from '../../services/location/bleWeightedCentroid';
import type { BleWclResult } from '../../services/location/bleWclProvider';

// ── Types ────────────────────────────────────────────────────────────────

type ApMarkerSnapshot = {
  showApMarkers: boolean;
  selectedLevel: number;
  apContributions: BleApContribution[] | undefined;
};

// ── Component ────────────────────────────────────────────────────────────

function CampusApMarkers() {
  const [snapshot, setSnapshot] = useState<ApMarkerSnapshot>(() => ({
    showApMarkers: useMapStore.getState().showApMarkers,
    selectedLevel: useMapStore.getState().selectedLevel,
    apContributions: useBleLocationStore.getState().result?.apContributions,
  }));

  useEffect(() => {
    // Initial snapshot
    const mapState = useMapStore.getState();
    const bleResult = useBleLocationStore.getState().result;
    setSnapshot({
      showApMarkers: mapState.showApMarkers,
      selectedLevel: mapState.selectedLevel,
      apContributions: bleResult?.apContributions,
    });

    // Subscribe to mapStore changes
    const unsubMap = useMapStore.subscribe(() => {
      const ms = useMapStore.getState();
      setSnapshot((prev) => ({
        showApMarkers: ms.showApMarkers,
        selectedLevel: ms.selectedLevel,
        apContributions: prev.apContributions,
      }));
    });

    // Subscribe to BLE store changes
    const unsubBle = useBleLocationStore.subscribe(() => {
      const bleState = useBleLocationStore.getState();
      const apContributions = bleState.result?.apContributions;
      setSnapshot((prev) => ({
        ...prev,
        apContributions,
      }));
    });

    return () => {
      unsubMap();
      unsubBle();
    };
  }, []);

  const geoJsonData = useMemo<ApGeoJsonFeatureCollection | null>(() => {
    if (!snapshot.showApMarkers) return null;
    return buildApVisualizationGeoJson({
      fixtures: BLE_AP_FIXTURES,
      contributions: snapshot.apContributions,
      selectedLevel: snapshot.selectedLevel,
    });
  }, [snapshot.showApMarkers, snapshot.selectedLevel, snapshot.apContributions]);

  if (!snapshot.showApMarkers || !geoJsonData) return null;

  return (
    <GeoJSONSource id="ble-ap-markers" data={geoJsonData}>
      {/* Dimmed baseline dots — non-contributors */}
      <Layer
        id="ble-ap-dimmed-dots"
        type="circle"
        filter={['!=', ['get', 'isContributor'], true]}
        paint={{
          'circle-pitch-alignment': 'map',
          'circle-pitch-scale': 'map',
          'circle-radius': ['get', 'circleRadius'],
          'circle-color': ['get', 'circleColor'],
          'circle-opacity': ['get', 'circleOpacity'],
        }}
      />
      {/* Contributor dots — highlighted */}
      <Layer
        id="ble-ap-contributor-dots"
        type="circle"
        filter={['==', ['get', 'isContributor'], true]}
        paint={{
          'circle-pitch-alignment': 'map',
          'circle-pitch-scale': 'map',
          'circle-radius': ['get', 'circleRadius'],
          'circle-color': ['get', 'circleColor'],
          'circle-opacity': ['get', 'circleOpacity'],
        }}
      />
      {/* Labels — high zoom only */}
      <Layer
        id="ble-ap-labels"
        type="symbol"
        minzoom={18}
        layout={{
          'text-field': ['get', 'label'],
          'text-size': 10,
          'text-anchor': 'center',
          'text-allow-overlap': false,
          'text-ignore-placement': false,
          'text-optional': true,
        }}
        paint={{
          'text-color': '#333333',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.5,
        }}
      />
    </GeoJSONSource>
  );
}

export default React.memo(CampusApMarkers);
