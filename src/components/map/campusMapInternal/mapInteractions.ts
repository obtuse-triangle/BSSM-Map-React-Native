import { type MapRef } from '@maplibre/maplibre-react-native';
import { useSavedPlacesStore } from '../../../store/savedPlacesStore';
import { useMapStore } from '../../../store/mapStore';
import { getDetectedBuildingId } from '../../../utils/buildingDetection';
import campusDataUntyped from '../../../data/campus-wgs84.json';
import type { CampusGeoJSON } from '../../../types/geojson';

const campusData = campusDataUntyped as unknown as CampusGeoJSON;

export function createMapPressHandler(deps: {
  mapRef: React.RefObject<MapRef | null>;
  selectedFeatureId: string | null;
  setSelectedFeatureId: (id: string | null) => void;
}): (event: any) => Promise<void> {
  return async (event) => {
    const point = event?.nativeEvent?.point;

    if (!point || !deps.mapRef.current) {
      deps.setSelectedFeatureId(null);
      return;
    }

    // 1) Saved pin check first
    const pinFeatures = await deps.mapRef.current.queryRenderedFeatures(point, {
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
    const features = await deps.mapRef.current.queryRenderedFeatures(point, {
      layers: ['campus-fill'],
    });

    const pressedFeature = (features as Array<{ id?: string | number; properties?: { interactive?: boolean; id?: string } }> | undefined)
      ?.find((f) => f?.properties?.interactive === true);

    if (!pressedFeature) {
      deps.setSelectedFeatureId(null);
      return;
    }

    const featureId = String(pressedFeature.id ?? pressedFeature.properties?.id ?? '');

    if (!featureId || featureId === 'undefined') {
      return;
    }

    deps.setSelectedFeatureId(featureId === deps.selectedFeatureId ? null : featureId);
  };
}

export function createMapLongPressHandler(deps: {
  mapRef: React.RefObject<MapRef | null>;
}): (event: any) => Promise<void> {
  return async (event) => {
    const point = event?.nativeEvent?.point;
    const lngLat = event?.nativeEvent?.lngLat;
    if (!point || !lngLat || !deps.mapRef.current) {
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
  };
}

export function createUserLocationUpdateHandler(deps: {
  setDetectedBuildingId: (id: string | null) => void;
  setGpsCoordinates: (coords: { longitude: number; latitude: number }) => void;
}): (position: { coords?: { longitude?: number; latitude?: number } } | undefined) => void {
  return (position) => {
    const coords = position?.coords;

    if (!coords) {
      return;
    }

    const { longitude, latitude } = coords;

    if (typeof longitude !== 'number' || typeof latitude !== 'number') {
      return;
    }

    deps.setGpsCoordinates({ longitude, latitude });
    deps.setDetectedBuildingId(getDetectedBuildingId(longitude, latitude, campusData));
  };
}
