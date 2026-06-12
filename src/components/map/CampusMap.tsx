import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { Platform, StyleSheet, View, type NativeSyntheticEvent } from 'react-native';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  NativeUserLocation,
  RasterSource,
  type FilterSpecification,
  type MapRef,
  type CameraRef,
  type ViewStateChangeEvent,
  useCurrentPosition,
} from '@maplibre/maplibre-react-native';

import campusDataUntyped from '../../data/campus-wgs84.json';
import outlineDataUntyped from '../../data/school-outline.json';
import { MAP_STYLES } from '../../constants/mapStyles';
import { useMapStore, type CampusFeatureCategory, type MapBaseLayer } from '../../store/mapStore';
import { useSavedPlacesStore } from '../../store/savedPlacesStore';
import CampusBleMarker from './CampusBleMarker';
import CampusApMarkers from './CampusApMarkers';
import SavedPinsLayer from './SavedPinsLayer';
import RoutePathLayer from './RoutePathLayer';
import { getDetectedBuildingId } from '../../utils/buildingDetection';
import type { CampusGeoJSON } from '../../types/geojson';
import { getFeatureById } from '../../utils/geoJsonHelpers';
import { getCoordinateFlyToOptions, getFeatureCameraTarget } from '../../utils/cameraTarget';

const campusData = campusDataUntyped as unknown as CampusGeoJSON;
const outlineData = outlineDataUntyped as any;

const CAMPUS_BOUNDS: [number, number, number, number] = [128.9028, 35.1876, 128.9041, 35.1893];
const CAMPUS_CENTER: [number, number] = [128.9035, 35.1885];
const PROGRAMMATIC_CAMERA_SUPPRESSION_MS = 600;

const BASE_STYLE = {
  version: 8 as const,
  name: 'base',
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {} as Record<string, any>,
  layers: [] as any[],
};

export type CampusMapHandle = {
  flyToUser: () => void;
  flyToCoordinates: (coordinates: [number, number]) => void;
  flyToFeature: (featureId: string) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
  showAttribution: () => void;
};

type CampusMapProps = {
  topPadding?: number;
  locationTrackingEnabled?: boolean;
  onUserMapDragStart?: () => void;
};

let designTilesPathPromise: Promise<string | null> | null = null;

function getDesignTilesPath(): Promise<string | null> {
  if (!designTilesPathPromise) {
    designTilesPathPromise = (async () => {
      try {
        const asset = Asset.fromModule(require('../../data/campus-design.mbtiles'));
        const downloaded = await asset.downloadAsync();
        if (downloaded.localUri) {
          return downloaded.localUri.replace('file://', '');
        }
        console.warn('[CampusMap] downloadAsync returned no localUri for mbtiles asset');
        return null;
      } catch (err) {
        console.error('[CampusMap] Failed to resolve mbtiles path:', err);
        return null;
      }
    })();
  }
  return designTilesPathPromise;
}

function CampusMap({ topPadding = 50, locationTrackingEnabled = false, onUserMapDragStart }: CampusMapProps, ref: Ref<CampusMapHandle>) {
  const mapRef = useRef<MapRef>(null);
  const cameraRef = useRef<CameraRef>(null);
  const programmaticCameraUntil = useRef(0);
  const programmaticCameraTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userDragGestureActiveRef = useRef(false);
  const [zoomLevel, setZoomLevel] = useState(17);
  const [mbtilesPath, setMbtilesPath] = useState<string | null>(null);
  const currentPosition = useCurrentPosition({ enabled: locationTrackingEnabled });
  const selectedLevel = useMapStore((state) => state.selectedLevel);
  const selectedFeatureId = useMapStore((state) => state.selectedFeatureId);
  const setSelectedFeatureId = useMapStore((state) => state.setSelectedFeatureId);
  const setDetectedBuildingId = useMapStore((state) => state.setDetectedBuildingId);
  const setGpsCoordinates = useMapStore((state) => state.setGpsCoordinates);
  const baseLayer = useMapStore((state) => state.baseLayer);
  const hiddenCategories = useMapStore((state) => state.hiddenCategories);
  // userCoordinates ref — updated imperatively to avoid re-renders on
  // every BLE WCL or GPS position tick.
  const userCoordsRef = useRef<{ longitude: number; latitude: number } | null>(
    useMapStore.getState().userCoordinates,
  );

  // Subscribe to mapStore.userCoordinates without triggering React re-renders.
  useEffect(() => {
    const unsub = useMapStore.subscribe(() => {
      userCoordsRef.current = useMapStore.getState().userCoordinates;
    });
    return unsub;
  }, []);

  useEffect(() => {
    getDesignTilesPath().then(setMbtilesPath);
  }, []);

  useEffect(() => {
    return () => {
      if (programmaticCameraTimeoutRef.current) {
        clearTimeout(programmaticCameraTimeoutRef.current);
      }
    };
  }, []);

  const markProgrammaticCameraMove = useCallback(() => {
    programmaticCameraUntil.current = Date.now() + PROGRAMMATIC_CAMERA_SUPPRESSION_MS;
    userDragGestureActiveRef.current = false;
    if (programmaticCameraTimeoutRef.current) {
      clearTimeout(programmaticCameraTimeoutRef.current);
    }
    programmaticCameraTimeoutRef.current = setTimeout(() => {
      programmaticCameraUntil.current = 0;
    }, PROGRAMMATIC_CAMERA_SUPPRESSION_MS);
  }, []);

  const handleMapPress = useCallback(
    async (event: any) => {
      const point = event?.nativeEvent?.point;

      if (!point || !mapRef.current) {
        setSelectedFeatureId(null);
        return;
      }

      // 1) Saved pin check first
      const pinFeatures = await mapRef.current.queryRenderedFeatures(point, {
        layers: ['saved-pins-layer'],
      });
      const hitPin = (pinFeatures as Array<{
        properties?: { id?: string };
        geometry?: { coordinates?: [number, number] };
      }> | undefined)?.[0];
      if (hitPin && hitPin.properties?.id) {
        useSavedPlacesStore.getState().setSelectedSavedPlaceId(hitPin.properties.id);
        useMapStore.getState().setSelectedFeatureId(null);
        const g = hitPin.geometry?.coordinates;
        if (g && Number.isFinite(g[0]) && Number.isFinite(g[1])) {
          useMapStore.getState().setPendingFlyToCoordinates(g);
        }
        useMapStore.getState().requestMinimizeSheets();
        return;
      }

      // 2) Campus polygon (existing logic)
      const features = await mapRef.current.queryRenderedFeatures(point, {
        layers: ['campus-fill'],
      });

      const pressedFeature = (features as Array<{ id?: string | number; properties?: { interactive?: boolean; id?: string } }> | undefined)
        ?.find((f) => f?.properties?.interactive === true);

      if (!pressedFeature) {
        setSelectedFeatureId(null);
        return;
      }

      const featureId = String(pressedFeature.id ?? pressedFeature.properties?.id ?? '');

      if (!featureId || featureId === 'undefined') {
        return;
      }

      setSelectedFeatureId(featureId === selectedFeatureId ? null : featureId);
    },
    [selectedFeatureId, setSelectedFeatureId],
  );

  const handleMapLongPress = useCallback(async (event: any) => {
    const point = event?.nativeEvent?.point;
    const lngLat = event?.nativeEvent?.lngLat;
    if (!point || !lngLat || !mapRef.current) {
      console.warn('[CampusMap] long-press missing point or lngLat; skipping pin creation');
      return;
    }
    const lng = typeof lngLat.longitude === 'number'
      ? lngLat.longitude
      : Array.isArray(lngLat) ? lngLat[0] : NaN;
    const lat = typeof lngLat.latitude === 'number'
      ? lngLat.latitude
      : Array.isArray(lngLat) ? lngLat[1] : NaN;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      console.warn('[CampusMap] long-press non-finite coords; skipping');
      return;
    }
    const currentLevel = useMapStore.getState().selectedLevel;
    const newId = useSavedPlacesStore.getState().createCustomPin({ coordinates: [lng, lat], level: currentLevel });
    if (!newId) return;
    useSavedPlacesStore.getState().setSelectedSavedPlaceId(newId);
    useMapStore.getState().setSelectedFeatureId(null);
    useMapStore.getState().requestMinimizeSheets();
  }, []);

  const handleUserLocationUpdate = useCallback(
    (position: { coords?: { longitude?: number; latitude?: number } } | undefined) => {
      const coords = position?.coords;

      if (!coords) {
        return;
      }

      const { longitude, latitude } = coords;

      if (typeof longitude !== 'number' || typeof latitude !== 'number') {
        return;
      }

      setGpsCoordinates({ longitude, latitude });
      setDetectedBuildingId(getDetectedBuildingId(longitude, latitude, campusData));
    },
    [setDetectedBuildingId, setGpsCoordinates],
  );

  useEffect(() => {
    handleUserLocationUpdate(currentPosition);
  }, [currentPosition, handleUserLocationUpdate]);

  const flyToUser = useCallback(() => {
    const coords = userCoordsRef.current;
    if (!coords) {
      return;
    }

    markProgrammaticCameraMove();
    cameraRef.current?.flyTo({
      ...getCoordinateFlyToOptions([coords.longitude, coords.latitude]),
    });
  }, [markProgrammaticCameraMove]);

  const flyToCoordinates = useCallback((coordinates: [number, number]) => {
    markProgrammaticCameraMove();
    cameraRef.current?.flyTo({
      ...getCoordinateFlyToOptions(coordinates),
    });
  }, [markProgrammaticCameraMove]);

  const zoomIn = useCallback(() => {
    const nextZoom = Math.min(zoomLevel + 1, 19);
    setZoomLevel(nextZoom);
    markProgrammaticCameraMove();
    cameraRef.current?.zoomTo(nextZoom, { duration: 200 });
  }, [markProgrammaticCameraMove, zoomLevel]);

  const zoomOut = useCallback(() => {
    const nextZoom = Math.max(zoomLevel - 1, 14);
    setZoomLevel(nextZoom);
    markProgrammaticCameraMove();
    cameraRef.current?.zoomTo(nextZoom, { duration: 200 });
  }, [markProgrammaticCameraMove, zoomLevel]);

  const handleRegionWillChange = useCallback((event: NativeSyntheticEvent<ViewStateChangeEvent>) => {
    const userInteraction = (event.nativeEvent as Partial<ViewStateChangeEvent>).userInteraction;
    if (Date.now() < programmaticCameraUntil.current || userInteraction !== true || userDragGestureActiveRef.current) {
      return;
    }

    userDragGestureActiveRef.current = true;
    onUserMapDragStart?.();
  }, [onUserMapDragStart]);

  const handleRegionDidChange = useCallback((event: { nativeEvent: ViewStateChangeEvent }) => {
    setZoomLevel(event.nativeEvent.zoom);
    if (Date.now() >= programmaticCameraUntil.current) {
      userDragGestureActiveRef.current = false;
    }
  }, []);

  const resetView = useCallback(() => {
    setZoomLevel(17);
    markProgrammaticCameraMove();
    cameraRef.current?.fitBounds(CAMPUS_BOUNDS, { padding: { top: topPadding, right: 50, bottom: 50, left: 50 }, duration: 200 });
  }, [markProgrammaticCameraMove, topPadding]);

  const flyToFeature = useCallback(
    (featureId: string) => {
      const feature = getFeatureById(campusData, featureId);
      if (!feature) {
        return;
      }
      const target = getFeatureCameraTarget(feature);
      if (!target) {
        return;
      }

      if (target.type === 'bounds') {
        markProgrammaticCameraMove();
        cameraRef.current?.fitBounds(target.bounds, { padding: target.padding, duration: target.duration });
      } else {
        markProgrammaticCameraMove();
        cameraRef.current?.flyTo({ center: target.center, zoom: target.zoom, duration: target.duration });
      }
    },
    [markProgrammaticCameraMove],
  );

  useImperativeHandle(ref, () => ({ flyToUser, flyToCoordinates, flyToFeature, zoomIn, zoomOut, resetView, showAttribution: () => mapRef.current?.showAttribution?.() }), [flyToCoordinates, flyToFeature, flyToUser, resetView, zoomIn, zoomOut]);

  const levelFilter = useMemo(
    () => ['==', ['get', 'level'], selectedLevel] as unknown as FilterSpecification,
    [selectedLevel],
  );

  const categoryFilter = useMemo(() => {
    if (hiddenCategories.size === 0) {
      return levelFilter;
    }

    const hidden = Array.from(hiddenCategories);
    return ['all', levelFilter, ['!', ['in', ['get', 'category'], ['literal', hidden]]]] as unknown as FilterSpecification;
  }, [levelFilter, hiddenCategories]);

  const selectedFeatureFilter = useMemo(
    () => ['==', ['id'], selectedFeatureId ?? ''] as unknown as FilterSpecification,
    [selectedFeatureId],
  );

  const showDesign = baseLayer === 'design';

  const tileStyles = useMemo(() => MAP_STYLES.filter((s) => s.id !== 'design'), []);

  return (
    <View style={styles.container}>
      <Map ref={mapRef} mapStyle={BASE_STYLE} style={styles.map} onPress={handleMapPress} onLongPress={handleMapLongPress} onRegionWillChange={handleRegionWillChange} onRegionDidChange={handleRegionDidChange} logo={false} attribution={false}>
        <Camera
          ref={cameraRef}
          initialViewState={{
            center: CAMPUS_CENTER,
            zoom: 17,
            bounds: CAMPUS_BOUNDS,
            padding: { top: topPadding, right: 50, bottom: 50, left: 50 },
          }}
        />

        {tileStyles.map((style) => (
          <RasterSource key={style.id} id={style.id} {...style.source}>
            <Layer id={`${style.id}-tiles`} type="raster" layout={{ visibility: baseLayer === style.id ? 'visible' : 'none' }} paint={style.paint} />
          </RasterSource>
        ))}
        <RasterSource id="design-tiles" tileSize={256} tiles={mbtilesPath ? [`mbtiles://${mbtilesPath}`] : []}>
          <Layer id="design-raster" type="raster" layout={{ visibility: showDesign && mbtilesPath ? 'visible' : 'none' }} paint={{ 'raster-opacity': 0.7 }} />
        </RasterSource>

        <GeoJSONSource id="school-outline" data={outlineData}>
          <Layer
            id="outline-fill"
            type="fill"
            paint={{ 'fill-color': '#E0E0E0', 'fill-opacity': 0.3 }}
          />
          <Layer
            id="outline-line"
            type="line"
            paint={{ 'line-color': '#666666', 'line-width': 1.5 }}
          />
        </GeoJSONSource>

        {locationTrackingEnabled && <NativeUserLocation mode="heading" />}

        <GeoJSONSource id="campus-polygons" data={campusData as any}>
          <Layer
            id="campus-fill"
            type="fill"
            filter={categoryFilter}
            paint={{
              'fill-color': [
                'match',
                ['get', 'category'],
                'classroom', '#D4E8FC',
                'room', '#FFF9C4',
                'facility', '#C8E6C9',
                'restroom', '#B3E5FC',
                'stair', '#D7CCC8',
                'elevator', '#CFD8DC',
                'corridor', '#F5F5F5',
                'structural', '#EEEEEE',
                '#F9F9F9',
              ],
              'fill-opacity': 0.85,
            }}
          />
          <Layer
            id="room-highlight"
            type="fill"
            filter={selectedFeatureFilter}
            paint={{ 'fill-color': '#2979FF', 'fill-opacity': 0.6 }}
            afterId="campus-fill"
          />
          <Layer
            id="campus-outline"
            type="line"
            filter={categoryFilter}
            paint={{ 'line-color': '#333333', 'line-width': 1 }}
          />
          <Layer
            id="room-labels"
            type="symbol"
            filter={categoryFilter}
            layout={{
              'text-field': ['get', 'name'],
              'text-size': 10,
              'text-anchor': 'center',
              'text-allow-overlap': false,
              'text-ignore-placement': false,
              'text-optional': true,
              'text-max-width': 8,
              'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
            }}
            paint={{
              'text-color': '#333333',
              'text-halo-color': '#ffffff',
              'text-halo-width': 1.5,
            }}
            minzoom={16}
          />
        </GeoJSONSource>

        <SavedPinsLayer />
        <CampusBleMarker />
        <CampusApMarkers />
        <RoutePathLayer />
      </Map>
    </View>
  );
}

export default forwardRef(CampusMap);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
});
