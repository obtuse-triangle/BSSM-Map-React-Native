import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

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
import { usePositionStore } from '../store/positionStore';
import { useBleLocationStore } from '../store/bleLocationStore';
import { getSelectedFloor } from '../utils/floorMap';
import { usePermissions } from '../hooks/usePermissions';
import { useToast } from '../hooks/useToast';
import { ToastCard } from '../components/feedback/ToastCard';

const campusData = campusDataUntyped as unknown as CampusGeoJSON;

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

type MapScreenProps = NativeStackScreenProps<RootStackParamList, 'Map'>;

export function MapScreen({ navigation }: MapScreenProps) {
  const [locationTrackingEnabled, setLocationTrackingEnabled] = React.useState(false);
  const campusMapRef = useRef<CampusMapHandle>(null);
  const pendingFlyToBleRef = useRef(false);
  const flyToBleUnsubRef = useRef<(() => void) | null>(null);

  const {
    selectedFloorKey,
    selectedLevel,
    selectedFeatureId,
    baseLayer,
    setSelectedLevel,
    setSelectedFeatureId,
    setBaseLayer,
    userCoordinates,
    bleCardVisible,
    settingsVisible,
    setBleCardVisible,
    setSettingsVisible,
    pendingFlyToFeatureId,
    setPendingFlyToFeatureId,
    showAttributionTick,
  } = useMapStore();

  const { position, status: positionStatus, error: positionError, locateCurrentPosition } = usePositionStore();

  const {
    status: bleStatus,
    result: bleResult,
    error: bleError,
    scanDurationMs,
    setScanDurationMs,
    debugObservations,
    clearResult,
    dismissCard,
    beaconStats,
    isContinuousScanning,
    startContinuousScan,
    stopContinuousScan,
    drPosition,
    drStepsSinceLastBle,
    isMotionActive,
    drErrorMeters,
    startMotionTracking,
    stopMotionTracking,
    currentHeading,
    fusionState,
    fusionUnavailableReason,
  } = useBleLocationStore();

  const { requestLocationPermission, requestPreciseLocation } = usePermissions();

  const { showToast, hideToast, visible: toastVisible, toastConfig } = useToast();

  useEffect(() => {
    if (positionError && locationTrackingEnabled) {
      showToast({ message: positionError, variant: 'error', duration: 4000 });
    }
  }, [positionError, locationTrackingEnabled, showToast]);

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
    if (userCoordinates) {
      campusMapRef.current?.flyToUser();
      return;
    }

    if (!locationTrackingEnabled) {
      const granted = await requestLocationPermission();
      if (!granted) return;

      await requestPreciseLocation();

      setLocationTrackingEnabled(true);
      showToast({ message: '위치 추적이 활성화되었습니다', variant: 'success' });
      return;
    }

    if (!selectedFloorKey || accessPoints.length === 0) return;
    void locateCurrentPosition({ floorKey: selectedFloorKey, accessPoints });
  }, [accessPoints, locateCurrentPosition, locationTrackingEnabled, selectedFloorKey, userCoordinates, requestLocationPermission, requestPreciseLocation, showToast]);

  // Watch for pending fly-to feature from MapSheet
  useEffect(() => {
    if (pendingFlyToFeatureId) {
      if (pendingFlyToFeatureId === '__locate__') {
        handleLocate();
      } else {
        campusMapRef.current?.flyToFeature(pendingFlyToFeatureId);
      }
      setPendingFlyToFeatureId(null);
    }
  }, [pendingFlyToFeatureId, setPendingFlyToFeatureId, handleLocate]);

  const attributionFirstRenderRef = useRef(true);
  useEffect(() => {
    if (attributionFirstRenderRef.current) {
      attributionFirstRenderRef.current = false;
      return;
    }
    campusMapRef.current?.showAttribution();
  }, [showAttributionTick]);

  const clearPendingBleFly = useCallback(() => {
    pendingFlyToBleRef.current = false;
    flyToBleUnsubRef.current?.();
    flyToBleUnsubRef.current = null;
  }, []);

  const flyToBleResult = useCallback(
    (result: typeof bleResult | null) => {
      if (!result || !pendingFlyToBleRef.current) {
        return false;
      }

      pendingFlyToBleRef.current = false;
      flyToBleUnsubRef.current?.();
      flyToBleUnsubRef.current = null;

      const fusion = useBleLocationStore.getState().fusionState;
      const zoneFloor = fusion?.inferredZone?.isInsideKnownZone
        ? parseInt(fusion.inferredZone.floorKey, 10)
        : NaN;
      if (!isNaN(zoneFloor) && zoneFloor !== selectedLevel) {
        setSelectedLevel(zoneFloor);
      }

      campusMapRef.current?.flyToCoordinates([result.longitude, result.latitude]);
      return true;
    },
    [selectedLevel, setSelectedLevel],
  );

  const handleBleScan = useCallback(() => {
    if (bleCardVisible) {
      setBleCardVisible(false);
      clearPendingBleFly();
      dismissCard();
      return;
    }
    setBleCardVisible(true);
    pendingFlyToBleRef.current = true;

    flyToBleUnsubRef.current?.();
    flyToBleUnsubRef.current = useBleLocationStore.subscribe(() => {
      flyToBleResult(useBleLocationStore.getState().result);
    });

    flyToBleResult(useBleLocationStore.getState().result);

    if (!isContinuousScanning) {
      startContinuousScan();
      startMotionTracking();
    }
  }, [bleCardVisible, clearPendingBleFly, dismissCard, flyToBleResult, isContinuousScanning, startContinuousScan, startMotionTracking, setBleCardVisible]);

  useEffect(() => clearPendingBleFly, [clearPendingBleFly]);

  const handleSettingsToggle = useCallback(() => {
    setSettingsVisible(!settingsVisible);
  }, [settingsVisible, setSettingsVisible]);

  const isLocateDisabled = positionStatus === 'loading' && locationTrackingEnabled;
  const baseLayerIcon = MAP_STYLES.find((s) => s.id === baseLayer)?.icon ?? '⚙';

  return (
    <View style={styles.screen}>
      <ToastCard
        visible={toastVisible}
        message={toastConfig?.message}
        variant={toastConfig?.variant}
        onDismiss={hideToast}
      />

      {/* Full-screen map */}
      <View style={styles.mapArea}>
        <CampusMap ref={campusMapRef} topPadding={0} locationTrackingEnabled={locationTrackingEnabled} />
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
