/**
 * SavedPinsLayer — Renders saved/custom pins on the MapLibre map.
 *
 * ## Design
 *
 * Follows the same imperative subscribe pattern as CampusBleMarker to avoid
 * cascading React re-renders. Subscribes to savedPlacesStore imperatively
 * and only updates local React state when the saved places data actually
 * changes (reference-compared snapshot via useRef).
 *
 * ## Data flow
 *
 *   savedPlacesStore (savedPlaces Record)
 *       │
 *       └── imperative subscribe (no React re-render)
 *               ↓
 *           setGeoJsonData (local state update)
 *               ↓
 *           GeoJSONSource data → MapLibre GL layers
 *
 * ## Layer IDs (stable — queried by CampusMap.handleMapPress)
 *
 *   - saved-pins-source  (GeoJSONSource)
 *   - saved-pins-layer   (circle — coloured by place colour)
 *   - saved-pins-labels  (symbol — place name, minzoom 17)
 *
 * @see CampusMap.tsx — renders this inside <Map>
 */

import React, { useEffect, useRef, useState } from 'react';
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { useSavedPlacesStore } from '../../store/savedPlacesStore';
import { useMapStore } from '../../store/mapStore';
import type { SavedPlace } from '../../types/savedPlaces';

// ── Internal types ───────────────────────────────────────────────────────

type SavedPlacesSnapshot = Record<string, SavedPlace>;

type PointFeature = {
  type: 'Feature';
  id: string;
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    id: string;
    name: string;
    color: string;
    kind: 'campus' | 'custom';
  };
};

type PointFeatureCollection = {
  type: 'FeatureCollection';
  features: PointFeature[];
};

// ── GeoJSON helper ───────────────────────────────────────────────────────

function toGeoJson(snapshot: SavedPlacesSnapshot, selectedLevel: number): PointFeatureCollection {
  const features: PointFeature[] = Object.values(snapshot)
    .filter((place) => place.level === selectedLevel)
    .map((place) => ({
      type: 'Feature',
      id: place.id,
      geometry: {
        type: 'Point',
        coordinates: place.coordinates, // [longitude, latitude]
      },
      properties: {
        id: place.id,
        name: place.name,
        color: place.color,
        kind: place.type, // 'campus' | 'custom'
      },
    }));

  return { type: 'FeatureCollection', features };
}

// ── Component ────────────────────────────────────────────────────────────

function SavedPinsLayer() {
  const [geoJsonData, setGeoJsonData] = useState<PointFeatureCollection | null>(null);
  const lastSnapshotRef = useRef<SavedPlacesSnapshot>({});

  useEffect(() => {
    const rebuild = () => {
      const snapshot = useSavedPlacesStore.getState().savedPlaces;
      const selectedLevel = useMapStore.getState().selectedLevel;

      if (snapshot === lastSnapshotRef.current) {
        return;
      }
      lastSnapshotRef.current = snapshot;

      if (Object.keys(snapshot).length === 0) {
        setGeoJsonData(null);
        return;
      }

      setGeoJsonData(toGeoJson(snapshot, selectedLevel));
    };

    // Initial data load
    rebuild();

    // Imperative subscribe — no React re-render on every store tick;
    // only when savedPlaces reference actually changes.
    const unsubPlaces = useSavedPlacesStore.subscribe(rebuild);

    return unsubPlaces;
  }, []);

  useEffect(() => {
    const unsubLevel = useMapStore.subscribe((state, prevState) => {
      if (state.selectedLevel === prevState.selectedLevel) return;
      const snapshot = useSavedPlacesStore.getState().savedPlaces;
      lastSnapshotRef.current = snapshot;
      if (Object.keys(snapshot).length === 0) {
        setGeoJsonData(null);
        return;
      }
      setGeoJsonData(toGeoJson(snapshot, state.selectedLevel));
    });

    return unsubLevel;
  }, []);

  if (!geoJsonData) return null;

  return (
    <GeoJSONSource id="saved-pins-source" data={geoJsonData}>
      {/* Circle — data-driven colour from place.color */}
      <Layer
        id="saved-pins-layer"
        type="circle"
        paint={{
          'circle-radius': 7,
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-width': 2,
        }}
      />
      {/* Label — place name above pin, visible at zoom >= 17 to avoid clutter */}
      <Layer
        id="saved-pins-labels"
        type="symbol"
        minzoom={17}
        layout={{
          'text-field': ['get', 'name'],
          'text-optional': true,
          'text-size': 11,
          'text-anchor': 'top',
          'text-offset': [0, 1.5],
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

/** React.memo prevents parent (CampusMap) re-renders from cascading. */
export default React.memo(SavedPinsLayer);
