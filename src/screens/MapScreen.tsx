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
import { getFeatureById, getLevelKeys } from '../utils/geoJsonHelpers';
import { useMapStore } from '../store/mapStore';
import { usePositionStore } from '../store/positionStore';
import { useBleLocationStore } from '../store/bleLocationStore';
import { getSelectedFloor } from '../utils/floorMap';
import { usePermissions } from '../hooks/usePermissions';
import { useToast } from '../hooks/useToast';
import { ToastCard } from '../components/feedback/ToastCard';
import { GlassSurface } from '../components/glass';

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

  // Watch for pending fly-to feature from MapSheet
  useEffect(() => {
    if (pendingFlyToFeatureId) {
      campusMapRef.current?.flyToFeature(pendingFlyToFeatureId);
      setPendingFlyToFeatureId(null);
    }
  }, [pendingFlyToFeatureId, setPendingFlyToFeatureId]);

  const clearPendingBleFly = useCallback(() => {
    pendingFlyToBleRef.current = false;
    flyToBleUnsubRef.current?.();
    flyToBleUnsubRef.current = null;
  }, []);

  const flyToBleResult = useCallback(
    (result: typeof bleResult | null) => {
      if (!result || !pendingFlyToBleRef.current) return false;
      pendingFlyToBleRef.current = false;
      flyToBleUnsubRef.current?.();
      flyToBleUnsubRef.current = null;
      campusMapRef.current?.flyToCoordinates([result.longitude, result.latitude]);
      return true;
    },
    [],
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

      {/* Floating glass button bar just above the sheet */}
      <View style={styles.glassBarContainer} pointerEvents="box-none">
        <GlassSurface variant="control" cornerRadius={22} style={styles.glassBar}>
          {/* Locate */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isLocateDisabled ? '현재 위치 찾기 불가' : '현재 위치 찾기'}
            disabled={isLocateDisabled}
            onPress={handleLocate}
            style={({ pressed }) => [
              styles.barButton,
              pressed && styles.barButtonPressed,
            ]}
          >
            <Text style={[styles.barButtonGlyph, isLocateDisabled && styles.barButtonDisabled]}>⌖</Text>
          </Pressable>

          <View style={styles.barDivider} />

          {/* BLE */}
          {Platform.OS === 'ios' ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isContinuousScanning ? 'BLE WCL 실시간 스캔 중지' : 'BLE WCL 실시간 스캔 시작'}
                onPress={handleBleScan}
                style={({ pressed }) => [
                  styles.barButton,
                  pressed && styles.barButtonPressed,
                ]}
              >
                <Text style={[styles.barButtonBleLabel, bleCardVisible && styles.barButtonBleActive]}>BLE</Text>
              </Pressable>
              <View style={styles.barDivider} />
            </>
          ) : null}

          {/* Base layer / Settings */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="지도 설정"
            onPress={handleSettingsToggle}
            style={({ pressed }) => [
              styles.barButton,
              pressed && styles.barButtonPressed,
            ]}
          >
            <Text style={styles.barButtonGlyph}>{baseLayerIcon}</Text>
          </Pressable>

          <View style={styles.barDivider} />

          {/* Floor level selector */}
          <View style={styles.levelRow}>
            {levels.map((level) => {
              const selected = level === selectedLevel;
              return (
                <Pressable
                  key={level}
                  accessibilityRole="button"
                  accessibilityLabel={`${level}층 선택`}
                  hitSlop={HIT_SLOP}
                  onPress={() => setSelectedLevel(level)}
                  style={[styles.levelButton, selected && styles.levelButtonSelected]}
                >
                  <Text style={[styles.levelButtonText, selected && styles.levelButtonTextSelected]}>
                    {level}F
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </GlassSurface>
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
  glassBarContainer: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 10,
    zIndex: 10,
  },
  glassBar: {
    alignItems: 'center',
    borderRadius: 22,
    flexDirection: 'row',
    paddingHorizontal: 6,
    paddingVertical: 6,
    gap: 2,
  },
  barButton: {
    alignItems: 'center',
    borderRadius: 16,
    height: 40,
    justifyContent: 'center',
    minWidth: 40,
    paddingHorizontal: 6,
  },
  barButtonPressed: {
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  barButtonGlyph: {
    color: TEXT_DARK,
    fontSize: 18,
    fontWeight: '800',
  },
  barButtonDisabled: {
    color: TEXT_LIGHT,
    opacity: 0.55,
  },
  barButtonBleLabel: {
    color: PRIMARY_BLUE,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  barButtonBleActive: {
    color: BG_WHITE,
  },
  barDivider: {
    backgroundColor: '#e2e8f0',
    height: 24,
    width: 1,
  },
  levelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
  },
  levelButton: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 999,
    minWidth: 36,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  levelButtonSelected: {
    backgroundColor: PRIMARY_BLUE,
  },
  levelButtonText: {
    color: TEXT_DARK,
    fontSize: 12,
    fontWeight: '800',
  },
  levelButtonTextSelected: {
    color: BG_WHITE,
  },
});
