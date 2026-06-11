import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
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
import CampusBleMarker from './CampusBleMarker';
import { getDetectedBuildingId } from '../../utils/buildingDetection';
import type { CampusGeoJSON } from '../../types/geojson';
import { getFeatureById, getFeatureCentroid } from '../../utils/geoJsonHelpers';

const campusData = campusDataUntyped as unknown as CampusGeoJSON;
const outlineData = outlineDataUntyped as any;

const CAMPUS_BOUNDS: [number, number, number, number] = [128.9028, 35.1876, 128.9041, 35.1893];
const CAMPUS_CENTER: [number, number] = [128.9035, 35.1885];

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
};

type CampusMapProps = {
  topPadding?: number;
  locationTrackingEnabled?: boolean;
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

function CampusMap({ topPadding = 50, locationTrackingEnabled = false }: CampusMapProps, ref: Ref<CampusMapHandle>) {
  const mapRef = useRef<MapRef>(null);
  const cameraRef = useRef<CameraRef>(null);
  const [zoomLevel, setZoomLevel] = useState(17);
  const [mbtilesPath, setMbtilesPath] = useState<string | null>(null);
  const currentPosition = useCurrentPosition({ enabled: locationTrackingEnabled });
  const selectedLevel = useMapStore((state) => state.selectedLevel);
  const selectedFeatureId = useMapStore((state) => state.selectedFeatureId);
  const setSelectedFeatureId = useMapStore((state) => state.setSelectedFeatureId);
  const setDetectedBuildingId = useMapStore((state) => state.setDetectedBuildingId);
  const setUserCoordinates = useMapStore((state) => state.setUserCoordinates);
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

  const handleMapPress = useCallback(
    async (event: any) => {
      const point = event?.nativeEvent?.point;

      if (!point || !mapRef.current) {
        setSelectedFeatureId(null);
        return;
      }

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

      setUserCoordinates({ longitude, latitude });
      setDetectedBuildingId(getDetectedBuildingId(longitude, latitude, campusData));
    },
    [setDetectedBuildingId, setUserCoordinates],
  );

  useEffect(() => {
    handleUserLocationUpdate(currentPosition);
  }, [currentPosition, handleUserLocationUpdate]);

  const flyToUser = useCallback(() => {
    const coords = userCoordsRef.current;
    if (!coords) {
      return;
    }

    cameraRef.current?.flyTo({
      center: [coords.longitude, coords.latitude],
      duration: 500,
    });
  }, []);

  const flyToCoordinates = useCallback((coordinates: [number, number]) => {
    cameraRef.current?.flyTo({
      center: coordinates,
      duration: 500,
    });
  }, []);

  const zoomIn = useCallback(() => {
    const nextZoom = Math.min(zoomLevel + 1, 19);
    setZoomLevel(nextZoom);
    cameraRef.current?.zoomTo(nextZoom, { duration: 200 });
  }, [zoomLevel]);

  const zoomOut = useCallback(() => {
    const nextZoom = Math.max(zoomLevel - 1, 14);
    setZoomLevel(nextZoom);
    cameraRef.current?.zoomTo(nextZoom, { duration: 200 });
  }, [zoomLevel]);

  const handleRegionDidChange = useCallback((event: { nativeEvent: ViewStateChangeEvent }) => {
    setZoomLevel(event.nativeEvent.zoom);
  }, []);

  const resetView = useCallback(() => {
    setZoomLevel(17);
    cameraRef.current?.fitBounds(CAMPUS_BOUNDS, { padding: { top: topPadding, right: 50, bottom: 50, left: 50 }, duration: 200 });
  }, [topPadding]);

  const flyToFeature = useCallback(
    (featureId: string) => {
      const feature = getFeatureById(campusData, featureId);
      if (!feature) {
        return;
      }
      const centroid = getFeatureCentroid(feature);
      cameraRef.current?.flyTo({ center: centroid, duration: 500 });
    },
    [],
  );

  useImperativeHandle(ref, () => ({ flyToUser, flyToCoordinates, flyToFeature, zoomIn, zoomOut, resetView }), [flyToCoordinates, flyToFeature, flyToUser, resetView, zoomIn, zoomOut]);

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
      <Map ref={mapRef} mapStyle={BASE_STYLE} style={styles.map} onPress={handleMapPress} onRegionDidChange={handleRegionDidChange}>
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
            <Layer id={`${style.id}-tiles`} type="raster" layout={{ visibility: baseLayer === style.id ? 'visible' : 'none' }} />
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

        <CampusBleMarker />
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
