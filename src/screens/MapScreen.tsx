import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BG_WHITE, PRIMARY_BLUE, TEXT_DARK, TEXT_LIGHT } from '../theme';

import { bssmFloorMap } from '../constants/bssmFloorMap';
import { MAP_STYLES } from '../constants/mapStyles';
import campusDataUntyped from '../data/campus-wgs84.json';
import CampusMap, { type CampusMapHandle } from '../components/map/CampusMap';
import type { RootStackParamList } from '../navigation/types';
import type { CampusGeoJSON } from '../types/geojson';
import { getAccessPointsForFloor } from '../utils/accessPoint';
import { getLevelKeys } from '../utils/geoJsonHelpers';
import { useMapStore } from '../store/mapStore';
import { getSelectedFloor } from '../utils/floorMap';
import { usePermissions } from '../hooks/usePermissions';
import { useToast } from '../hooks/useToast';
import { ToastCard } from '../components/feedback/ToastCard';

const campusData = campusDataUntyped as unknown as CampusGeoJSON;

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

type MapScreenProps = NativeStackScreenProps<RootStackParamList, 'Map'>;

export function MapScreen({ navigation }: MapScreenProps) {
  const insets = useSafeAreaInsets();
  const campusMapRef = useRef<CampusMapHandle>(null);

  const {
    selectedFloorKey,
    selectedLevel,
    selectedFeatureId,
    baseLayer,
    setSelectedLevel,
    setSelectedFeatureId,
    setBaseLayer,
    userCoordinates,
    gpsTrackingEnabled,
    setGpsTrackingEnabled,
    bleCardVisible,
    settingsVisible,
    setBleCardVisible,
    setSettingsVisible,
    pendingFlyToFeatureId,
    setPendingFlyToFeatureId,
    pendingFlyToCoordinates,
    setPendingFlyToCoordinates,
    showAttributionTick,
  } = useMapStore();

  const { requestLocationPermission, requestPreciseLocation } = usePermissions();

  const { showToast, hideToast, visible: toastVisible, toastConfig } = useToast();

  const selectedFloor = useMemo(
    () => getSelectedFloor(bssmFloorMap, selectedFloorKey),
    [selectedFloorKey],
  );

  const accessPoints = useMemo(() => {
    if (!selectedFloorKey || !selectedFloor) return [];
    return getAccessPointsForFloor(selectedFloorKey, selectedFloor);
  }, [selectedFloor, selectedFloorKey]);

  const levels = useMemo(() => getLevelKeys(campusData), []);

  // Auto-present the formSheet on mount
  const hasNavigatedToSheet = useRef(false);
  useEffect(() => {
    if (!hasNavigatedToSheet.current) {
      hasNavigatedToSheet.current = true;
      navigation.navigate('MapSheet');
    }
  }, [navigation]);

  const handleLocate = useCallback(async () => {
    if (gpsTrackingEnabled) {
      // GPS OFF path
      setGpsTrackingEnabled(false);
      showToast({ message: 'GPS 위치 추적이 꺼졌습니다', variant: 'info' });
      return;
    }

    // GPS ON path
    const granted = await requestLocationPermission();
    if (!granted) return;
    await requestPreciseLocation();
    setGpsTrackingEnabled(true);
    showToast({ message: 'GPS 위치 추적이 활성화되었습니다', variant: 'success' });
  }, [gpsTrackingEnabled, setGpsTrackingEnabled, requestLocationPermission, requestPreciseLocation, showToast]);

  // Watch for pending fly-to feature or coordinates from MapSheet
  useEffect(() => {
    if (pendingFlyToFeatureId) {
      if (pendingFlyToFeatureId === '__locate__') {
        handleLocate();
      } else {
        campusMapRef.current?.flyToFeature(pendingFlyToFeatureId);
      }
      setPendingFlyToFeatureId(null);
    } else if (pendingFlyToCoordinates) {
      campusMapRef.current?.flyToCoordinates(pendingFlyToCoordinates);
      setPendingFlyToCoordinates(null);
    }
  }, [pendingFlyToFeatureId, pendingFlyToCoordinates, setPendingFlyToFeatureId, setPendingFlyToCoordinates, handleLocate]);

  const attributionFirstRenderRef = useRef(true);
  useEffect(() => {
    if (attributionFirstRenderRef.current) {
      attributionFirstRenderRef.current = false;
      return;
    }
    campusMapRef.current?.showAttribution();
  }, [showAttributionTick]);

  const handleSettingsToggle = useCallback(() => {
    setSettingsVisible(!settingsVisible);
  }, [settingsVisible, setSettingsVisible]);

  const handleUserMapDragStart = useCallback(() => {
    useMapStore.getState().requestMinimizeSheets();
  }, []);

  const baseLayerIcon = MAP_STYLES.find((s) => s.id === baseLayer)?.icon ?? '⚙';

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ToastCard
        visible={toastVisible}
        message={toastConfig?.message}
        variant={toastConfig?.variant}
        onDismiss={hideToast}
      />

      {/* Full-screen map */}
      <View style={styles.mapArea}>
        <CampusMap ref={campusMapRef} topPadding={0} locationTrackingEnabled={gpsTrackingEnabled} onUserMapDragStart={handleUserMapDragStart} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f8fbff',
  },
  mapArea: {
    ...StyleSheet.absoluteFillObject,
  },
});
