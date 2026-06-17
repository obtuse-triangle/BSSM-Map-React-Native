import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { StyleSheet, View, type NativeSyntheticEvent } from 'react-native';
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  NativeUserLocation,
  RasterSource,
  type MapRef,
  type CameraRef,
  type ViewStateChangeEvent,
  useCurrentPosition,
} from '@maplibre/maplibre-react-native';

import campusDataUntyped from '../../data/campus-wgs84.json';
import outlineDataUntyped from '../../data/school-outline.json';
import { MAP_STYLES } from '../../constants/mapStyles';
import { useMapStore } from '../../store/mapStore';
import CampusBleMarker from './CampusBleMarker';
import CampusApMarkers from './CampusApMarkers';
import SavedPinsLayer from './SavedPinsLayer';
import RoutePathLayer from './RoutePathLayer';
import { getCampusOverlayPaints } from './campusOverlayPaints';
import type { CampusGeoJSON } from '../../types/geojson';
import { getFeatureById } from '../../utils/geoJsonHelpers';
import { getCoordinateFlyToOptions, getFeatureCameraTarget } from '../../utils/cameraTarget';

import { CAMPUS_BOUNDS, CAMPUS_CENTER, PROGRAMMATIC_CAMERA_SUPPRESSION_MS, BASE_STYLE } from './campusMapInternal/campusMapConstants';
import { getDesignTilesPath } from './campusMapInternal/tileAssets';
import { createMapPressHandler, createMapLongPressHandler, createUserLocationUpdateHandler } from './campusMapInternal/mapInteractions';
import { buildLevelFilter, buildCategoryFilter, buildSelectedFeatureFilter } from './campusMapInternal/layerFilters';

const campusData = campusDataUntyped as unknown as CampusGeoJSON;
const outlineData = outlineDataUntyped as any;

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
    createMapPressHandler({ mapRef, selectedFeatureId, setSelectedFeatureId }),
    [selectedFeatureId, setSelectedFeatureId],
  );

  const handleMapLongPress = useCallback(
    createMapLongPressHandler({ mapRef }),
    [],
  );

  const handleUserLocationUpdate = useCallback(
    createUserLocationUpdateHandler({ setDetectedBuildingId, setGpsCoordinates }),
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

  const levelFilter = useMemo(() => buildLevelFilter(selectedLevel), [selectedLevel]);
  const categoryFilter = useMemo(() => buildCategoryFilter(levelFilter, hiddenCategories), [levelFilter, hiddenCategories]);
  const selectedFeatureFilter = useMemo(() => buildSelectedFeatureFilter(selectedFeatureId), [selectedFeatureId]);

  const overlayPaints = useMemo(() => getCampusOverlayPaints(baseLayer), [baseLayer]);

  const showDesign = baseLayer === 'design';

  const tileStyles = useMemo(() => MAP_STYLES.filter((s) => s.id !== 'design'), []);

  return (
    <View
      style={styles.container}
      accessibilityLabel="학교 실내 지도"
      accessibilityRole="none"
      importantForAccessibility="yes"
      accessible
    >
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
            paint={overlayPaints.schoolOutlineFill}
          />
          <Layer
            id="outline-line"
            type="line"
            paint={overlayPaints.schoolOutlineLine}
          />
        </GeoJSONSource>

        {locationTrackingEnabled && <NativeUserLocation mode="heading" />}

        <GeoJSONSource id="campus-polygons" data={campusData as any}>
          <Layer
            id="campus-fill"
            type="fill"
            filter={categoryFilter}
            paint={{
              'fill-color': overlayPaints.campusFillMatch,
              'fill-opacity': overlayPaints.campusFillOpacity,
            }}
          />
          <Layer
            id="room-highlight"
            type="fill"
            filter={selectedFeatureFilter}
            paint={overlayPaints.roomHighlight}
            afterId="campus-fill"
          />
          <Layer
            id="campus-outline"
            type="line"
            filter={categoryFilter}
            paint={overlayPaints.campusOutline}
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
              ...overlayPaints.roomLabel,
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
