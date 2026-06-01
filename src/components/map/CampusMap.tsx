import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  NativeUserLocation,
  type FilterSpecification,
  type MapRef,
  type CameraRef,
  useCurrentPosition,
} from '@maplibre/maplibre-react-native';

// @ts-expect-error - GeoJSON import requires allowArbitraryExtensions + d.ts declaration
import campusData from '../../data/campus-wgs84.geojson';
import { useMapStore } from '../../store/mapStore';
import { getDetectedBuildingId } from '../../utils/buildingDetection';

const CAMPUS_BOUNDS: [number, number, number, number] = [128.9028, 35.1876, 128.9041, 35.1893];
const CAMPUS_CENTER: [number, number] = [128.9035, 35.1885];

export type CampusMapHandle = {
  flyToUser: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
};

function CampusMap(_props: {}, ref: Ref<CampusMapHandle>) {
  const mapRef = useRef<MapRef>(null);
  const cameraRef = useRef<CameraRef>(null);
  const [zoomLevel, setZoomLevel] = useState(17);
  const currentPosition = useCurrentPosition();
  const selectedLevel = useMapStore((state) => state.selectedLevel);
  const selectedFeatureId = useMapStore((state) => state.selectedFeatureId);
  const setSelectedFeatureId = useMapStore((state) => state.setSelectedFeatureId);
  const userCoordinates = useMapStore((state) => state.userCoordinates);
  const setDetectedBuildingId = useMapStore((state) => state.setDetectedBuildingId);
  const setUserCoordinates = useMapStore((state) => state.setUserCoordinates);

  const handlePress = useCallback(
    async (event: any) => {
      const screenPointX = event?.nativeEvent?.screenPointX;
      const screenPointY = event?.nativeEvent?.screenPointY;

      if (typeof screenPointX !== 'number' || typeof screenPointY !== 'number') {
        return;
      }

      const features = (await mapRef.current?.queryRenderedFeatures([screenPointX, screenPointY], {
        layers: ['campus-fill'],
      })) as Array<{ id?: string | number; properties?: { interactive?: boolean } }> | undefined;

      const pressedFeature = features?.find((feature) => {
        return feature?.properties?.interactive === true;
      });

      if (!pressedFeature) {
        return;
      }

      const featureId = String(pressedFeature.id ?? '');

      if (!featureId) {
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
    if (!userCoordinates) {
      return;
    }

    cameraRef.current?.flyTo({
      center: [userCoordinates.longitude, userCoordinates.latitude],
      duration: 500,
    });
  }, [userCoordinates]);

  const zoomIn = useCallback(() => {
    const nextZoom = Math.min(zoomLevel + 1, 20);

    setZoomLevel(nextZoom);
    cameraRef.current?.zoomTo(nextZoom, { duration: 200 });
  }, [zoomLevel]);

  const zoomOut = useCallback(() => {
    const nextZoom = Math.max(zoomLevel - 1, 14);

    setZoomLevel(nextZoom);
    cameraRef.current?.zoomTo(nextZoom, { duration: 200 });
  }, [zoomLevel]);

  const resetView = useCallback(() => {
    setZoomLevel(17);
    cameraRef.current?.fitBounds(CAMPUS_BOUNDS, { padding: { top: 50, right: 50, bottom: 50, left: 50 }, duration: 200 });
  }, []);

  useImperativeHandle(ref, () => ({ flyToUser, zoomIn, zoomOut, resetView }), [flyToUser, resetView, zoomIn, zoomOut]);

  const levelFilter = useMemo(
    () => ['==', ['get', 'level'], selectedLevel] as unknown as FilterSpecification,
    [selectedLevel],
  );
  const selectedFeatureFilter = useMemo(
    () => ['==', ['id'], selectedFeatureId ?? ''] as unknown as FilterSpecification,
    [selectedFeatureId],
  );

  return (
    <View style={styles.container}>
      <Map ref={mapRef} mapStyle="https://demotiles.maplibre.org/style.json" style={styles.map} onPress={handlePress}>
        <Camera
          ref={cameraRef}
          initialViewState={{
            center: CAMPUS_CENTER,
            zoom: 17,
            bounds: CAMPUS_BOUNDS,
          }}
        />
        <NativeUserLocation mode="default" />
        <GeoJSONSource id="campus-polygons" data={campusData}>
          <Layer
            id="campus-fill"
            type="fill"
            filter={levelFilter}
            paint={{
              'fill-color': '#e8e8e8',
              'fill-opacity': 0.7,
            }}
          />
          <Layer
            id="room-highlight"
            type="fill"
            filter={selectedFeatureFilter}
            paint={{
              'fill-color': '#4A90D9',
              'fill-opacity': 0.5,
            }}
            afterId="campus-fill"
          />
          <Layer
            id="campus-outline"
            type="line"
            filter={levelFilter}
            paint={{
              'line-color': '#333333',
              'line-width': 1,
            }}
          />
          <Layer
            id="room-labels"
            type="symbol"
            filter={levelFilter}
            layout={{
              'text-field': ['get', 'name'],
              'text-size': 11,
              'text-anchor': 'center',
              'text-allow-overlap': false,
              'text-optional': true,
              'text-max-width': 6,
            }}
            paint={{
              'text-color': '#333333',
              'text-halo-color': '#ffffff',
              'text-halo-width': 1,
            }}
            minzoom={17}
          />
        </GeoJSONSource>
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
