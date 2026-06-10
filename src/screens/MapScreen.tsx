import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BG_NEAR_WHITE, BG_WHITE, BORDER_DEFAULT, BORDER_LIGHT, PRIMARY_BLUE, TEXT_DARK, TEXT_LIGHT } from '../theme';

import { bssmFloorMap } from '../constants/bssmFloorMap';
import { MAP_STYLES } from '../constants/mapStyles';
import campusDataUntyped from '../data/campus-wgs84.json';
import CampusMap, { type CampusMapHandle } from '../components/map/CampusMap';
import { PlaceDetailBottomSheet, SHEET_HEIGHT } from '../components/map/PlaceDetailBottomSheet';
import { ZoomControls } from '../components/map/ZoomControls';
import type { RootStackParamList } from '../navigation/types';
import type { Floor, FloorElement } from '../types/floorMap';
import type { CampusGeoJSON } from '../types/geojson';
import { getAccessPointsForFloor } from '../utils/accessPoint';
import { getFeatureById, getFeatureCentroid, getLevelKeys } from '../utils/geoJsonHelpers';
import { useMapStore, type CampusFeatureCategory, type MapBaseLayer } from '../store/mapStore';
import { usePositionStore } from '../store/positionStore';
import { useBleLocationStore } from '../store/bleLocationStore';
import { BleWclStatusCard } from '../components/map/BleWclStatusCard';
import { getSelectedFloor } from '../utils/floorMap';
import { SearchBar } from '../components/map/SearchBar';
import { useSearchBar } from '../hooks/useSearchBar';
import { usePermissions } from '../hooks/usePermissions';
import { useToast } from '../hooks/useToast';
import { ToastCard } from '../components/feedback/ToastCard';

const campusData = campusDataUntyped as unknown as CampusGeoJSON;

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

const CATEGORY_LABELS: Record<CampusFeatureCategory, string> = {
  classroom: '교실',
  corridor: '복도',
  elevator: '엘리베이터',
  facility: '시설',
  restroom: '화장실',
  room: '방',
  stair: '계단',
  structural: '구조',
};

const CATEGORY_COLORS: Record<CampusFeatureCategory, string> = {
  classroom: '#D4E8FC',
  corridor: '#F5F5F5',
  elevator: '#CFD8DC',
  facility: '#C8E6C9',
  restroom: '#B3E5FC',
  room: '#FFF9C4',
  stair: '#D7CCC8',
  structural: '#EEEEEE',
};

const BASE_LAYER_OPTIONS = MAP_STYLES.map((s) => ({ key: s.id, label: s.label, icon: s.icon }));

type MapScreenProps = NativeStackScreenProps<RootStackParamList, 'Map'>;
const MAP_TOP_CHROME_GAP = 8;

export function MapScreen({ navigation }: MapScreenProps) {
  const insets = useSafeAreaInsets();
  const [topChromeHeight, setTopChromeHeight] = useState(0);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [locationTrackingEnabled, setLocationTrackingEnabled] = useState(false);
  const [bleCardVisible, setBleCardVisible] = useState(false);
  const campusMapRef = useRef<CampusMapHandle>(null);
  const pendingFlyToBleRef = useRef(false);
  const flyToBleUnsubRef = useRef<(() => void) | null>(null);
  const topObstructionHeight = topChromeHeight > 0 ? topChromeHeight + MAP_TOP_CHROME_GAP : insets.top + 12;

  const { searchQuery, setSearchQuery, searchResults, isSearchFocused, setIsSearchFocused } = useSearchBar();

  const {
    selectedFloorKey,
    selectedLevel,
    selectedFeatureId,
    baseLayer,
    hiddenCategories,
    setSelectedLevel,
    setSelectedFeatureId,
    setBaseLayer,
    toggleCategory,
    userCoordinates,
  } = useMapStore();

  const allCategories = useMapStore((s) => s.allCategories);
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
      showToast({ message: positionError, variant: 'error', duration: 4000 })
    }
  }, [positionError, locationTrackingEnabled, showToast])

  const selectedFloor = useMemo(
    () => getSelectedFloor(bssmFloorMap, selectedFloorKey),
    [selectedFloorKey],
  );

  const accessPoints = useMemo(() => {
    if (!selectedFloorKey || !selectedFloor) {
      return [];
    }
    return getAccessPointsForFloor(selectedFloorKey, selectedFloor);
  }, [selectedFloor, selectedFloorKey]);

  const currentPosition = useMemo(() => {
    if (!selectedFloorKey || !position || position.floorKey !== selectedFloorKey) {
      return null;
    }
    return position;
  }, [position, selectedFloorKey]);

  const statusForSelectedFloor = currentPosition !== null || positionStatus !== 'success' ? positionStatus : 'idle';

  const levels = useMemo(() => getLevelKeys(campusData), []);

  const selectedFeature = useMemo(() => {
    if (!selectedFeatureId) {
      return null;
    }
    return getFeatureById(campusData, selectedFeatureId) ?? null;
  }, [selectedFeatureId]);

  const bottomSheetFloor = useMemo<Floor | undefined>(() => {
    if (!selectedFeature) {
      return undefined;
    }
    return {
      key: String(selectedFeature.properties.level),
      label: `${selectedFeature.properties.level}F`,
      elements: [],
    } as Floor;
  }, [selectedFeature]);

  const bottomSheetRoom = useMemo<FloorElement | null>(() => {
    if (!selectedFeature) {
      return null;
    }
    const centroid = getFeatureCentroid(selectedFeature);
    return {
      id: Number(selectedFeature.id) || 0,
      name: selectedFeature.properties.name_ko || selectedFeature.properties.name,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      interactive: selectedFeature.properties.interactive,
      _geojsonMeta: {
        category: selectedFeature.properties.category,
        centroid: `[${centroid[0].toFixed(5)}, ${centroid[1].toFixed(5)}]`,
      },
    } as FloorElement & { _geojsonMeta?: { category: string; centroid: string } };
  }, [selectedFeature]);

  const isLocateDisabled = positionStatus === 'loading' && locationTrackingEnabled;

  const clearPendingBleFly = useCallback(() => {
    pendingFlyToBleRef.current = false;
    flyToBleUnsubRef.current?.();
    flyToBleUnsubRef.current = null;
  }, []);

  const flyToBleResult = useCallback(
    (result: typeof bleResult | null) => {
      if (__DEV__) {
        console.log('[MapScreen] BLE fly check:', {
          pendingFlyToBle: pendingFlyToBleRef.current,
          hasResult: result !== null,
          coordinates: result ? [result.longitude, result.latitude] : null,
        });
      }

      if (!result || !pendingFlyToBleRef.current) {
        return false;
      }

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
  }, [bleCardVisible, clearPendingBleFly, dismissCard, flyToBleResult, isContinuousScanning, startContinuousScan, startMotionTracking]);

  useEffect(() => {
    if (__DEV__) {
      console.log('[MapScreen] BLE fly effect:', {
        pendingFlyToBle: pendingFlyToBleRef.current,
        bleResult,
      });
    }
  }, [bleResult]);

  useEffect(() => clearPendingBleFly, [clearPendingBleFly]);

  const handleLocate = useCallback(async () => {
    if (userCoordinates) {
      campusMapRef.current?.flyToUser();
      return;
    }

    if (!locationTrackingEnabled) {
      const granted = await requestLocationPermission();
      if (!granted) {
        return;
      }

      await requestPreciseLocation();

      setLocationTrackingEnabled(true);
      showToast({ message: '위치 추적이 활성화되었습니다', variant: 'success' });
      return;
    }

    if (!selectedFloorKey || accessPoints.length === 0) {
      return;
    }
    void locateCurrentPosition({ floorKey: selectedFloorKey, accessPoints });
  }, [accessPoints, locateCurrentPosition, locationTrackingEnabled, selectedFloorKey, userCoordinates, requestLocationPermission, requestPreciseLocation, showToast]);

  const handleSelectSearchResult = useCallback(
    (featureId: string) => {
      const feature = getFeatureById(campusData, featureId);
      if (feature && feature.properties.level !== selectedLevel) {
        setSelectedLevel(feature.properties.level);
      }
      setSelectedFeatureId(featureId);
      campusMapRef.current?.flyToFeature(featureId);
      setSearchQuery('');
      Keyboard.dismiss();
    },
    [selectedLevel, setSelectedFeatureId, setSelectedLevel],
  );

  const handleTopChromeLayout = useCallback(
    (event: LayoutChangeEvent) => {
      if (searchQuery.trim().length > 0) {
        return;
      }
      const nextHeight = Math.ceil(event.nativeEvent.layout.height);
      setTopChromeHeight((currentHeight) => (currentHeight === nextHeight ? currentHeight : nextHeight));
    },
    [searchQuery],
  );

  const baseLayerIcon = MAP_STYLES.find((s) => s.id === baseLayer)?.icon ?? '⚙';

  return (
    <View style={styles.screen}>
      <ToastCard visible={toastVisible} message={toastConfig?.message} variant={toastConfig?.variant} onDismiss={hideToast} />
      <View onLayout={handleTopChromeLayout} style={[styles.topChrome, { paddingTop: insets.top + 12 }]} pointerEvents="box-none">
        <View style={styles.topChromeContent}>
          <View style={styles.searchAndActionsRow}>
            <SearchBar
              containerStyle={{ flex: 1 }}
              insets={insets}
              isSearchFocused={isSearchFocused}
              onBlur={() => setIsSearchFocused(false)}
              onClear={() => setSearchQuery('')}
              onFocus={() => setIsSearchFocused(true)}
              onResultSelect={handleSelectSearchResult}
              onSearchChange={setSearchQuery}
              searchQuery={searchQuery}
              searchResults={searchResults}
              selectedFeatureId={selectedFeatureId}
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isLocateDisabled ? '현재 위치 찾기 불가' : '현재 위치 찾기'}
              disabled={isLocateDisabled}
              onPress={handleLocate}
              style={({ pressed }) => [
                styles.iconActionButton,
                isLocateDisabled && styles.iconActionButtonDisabled,
                !isLocateDisabled && styles.locateButton,
                pressed && !isLocateDisabled && styles.iconActionButtonPressed,
              ]}
            >
              <Text style={[styles.iconActionGlyph, isLocateDisabled && styles.iconActionGlyphDisabled]}>⌖</Text>
            </Pressable>

            {Platform.OS === 'ios' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isContinuousScanning ? 'BLE WCL 실시간 스캔 중지' : 'BLE WCL 실시간 스캔 시작'}
                onPress={handleBleScan}
                style={({ pressed }) => [
                  styles.iconActionButton,
                  bleCardVisible && styles.bleButtonActive,
                  pressed && styles.iconActionButtonPressed,
                ]}
              >
                <Text style={[styles.bleButtonLabel, bleCardVisible && styles.bleButtonLabelActive]}>
                  BLE
                </Text>
              </Pressable>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="지도 설정"
              onPress={() => setSettingsVisible(true)}
              style={({ pressed }) => [
                styles.iconActionButton,
                pressed && styles.iconActionButtonPressed,
              ]}
            >
              <Text style={styles.iconActionGlyph}>{baseLayerIcon}</Text>
            </Pressable>
          </View>

          <View style={styles.levelSelector}>
            <Text style={styles.levelSelectorLabel}>층</Text>
            <View style={styles.levelButtonsRow}>
              {levels.map((level) => {
                const selected = level === selectedLevel;
                return (
                  <Pressable
                    key={level}
                    accessibilityRole="button"
                    accessibilityLabel={`${level}층 선택`}
                    hitSlop={HIT_SLOP}
                    onPress={() => setSelectedLevel(level)}
                    style={({ pressed }) => [styles.levelButton, selected && styles.levelButtonSelected, pressed && styles.levelButtonPressed]}
                  >
                    <Text style={[styles.levelButtonText, selected && styles.levelButtonTextSelected]}>{level}F</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>


          <Text style={styles.mapHelperText}>
            {statusForSelectedFloor === 'loading'
              ? '현재 위치를 계산하는 중입니다.'
              : statusForSelectedFloor === 'success' && currentPosition
                ? `현재 위치 x ${currentPosition.x.toFixed(1)}% · y ${currentPosition.y.toFixed(1)}%`
                : statusForSelectedFloor === 'error'
                  ? positionError ?? '현재 위치를 찾지 못했습니다.'
                  : bleStatus === 'success' && bleResult
                    ? `BLE WCL 위치 확인됨 · ±${bleResult.accuracyMeters.toFixed(1)}m · 신뢰도 ${(bleResult.confidence * 100).toFixed(0)}%`
                    : '현재 층에서 AP를 눌러 위치를 계산할 수 있습니다.'}
          </Text>

          {bleCardVisible && (
          <BleWclStatusCard
            status={bleStatus}
            result={bleResult}
            error={bleError}
            onStartScan={handleBleScan}
            onDismiss={() => { setBleCardVisible(false); dismissCard(); }}
            scanDurationMs={scanDurationMs}
            onSetScanDuration={setScanDurationMs}
            debugObservations={debugObservations}
            beaconStats={beaconStats}
            isContinuousScanning={isContinuousScanning}
            onStartContinuousScan={startContinuousScan}
            onStopContinuousScan={stopContinuousScan}
            drPosition={drPosition}
            drStepsSinceLastBle={drStepsSinceLastBle}
            isMotionActive={isMotionActive}
            drErrorMeters={drErrorMeters}
            onStartMotionTracking={startMotionTracking}
            onStopMotionTracking={stopMotionTracking}
          />
          )}
        </View>
      </View>

      <View onTouchStart={() => Keyboard.dismiss()} style={styles.mapArea}>
        <CampusMap ref={campusMapRef} topPadding={topObstructionHeight} locationTrackingEnabled={locationTrackingEnabled} />
        <ZoomControls
          onReset={() => campusMapRef.current?.resetView()}
          onZoomIn={() => campusMapRef.current?.zoomIn()}
          onZoomOut={() => campusMapRef.current?.zoomOut()}
          style={{ top: topObstructionHeight + 16 }}
        />
      </View>

      <View style={styles.bottomSheetContainer} pointerEvents="box-none">
        <PlaceDetailBottomSheet floor={bottomSheetFloor} room={bottomSheetRoom} />
      </View>

      <Modal visible={settingsVisible} transparent animationType="fade" onRequestClose={() => setSettingsVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setSettingsVisible(false)}>
          <Pressable style={[styles.modalCard, { marginTop: insets.top + 60 }]} onPress={() => {}}>
            <Text style={styles.modalTitle}>지도 설정</Text>

            <Text style={styles.modalSectionTitle}>배경 지도</Text>
            <View style={styles.baseLayerRow}>
              {BASE_LAYER_OPTIONS.map((opt) => {
                const active = baseLayer === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => { setBaseLayer(opt.key); }}
                    style={[styles.baseLayerButton, active && styles.baseLayerButtonActive]}
                  >
                    <Text style={styles.baseLayerIcon}>{opt.icon}</Text>
                    <Text style={[styles.baseLayerLabel, active && styles.baseLayerLabelActive]}>{opt.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.modalSectionTitle}>카테고리 표시</Text>
            <View style={styles.categoryGrid}>
              {allCategories().map((cat) => {
                const hidden = hiddenCategories.has(cat);
                return (
                  <Pressable
                    key={cat}
                    hitSlop={HIT_SLOP}
                    onPress={() => toggleCategory(cat)}
                    style={[styles.categoryChip, { borderLeftColor: CATEGORY_COLORS[cat] }, hidden && styles.categoryChipHidden]}
                  >
                    <Text style={[styles.categoryChipText, hidden && styles.categoryChipTextHidden]}>
                      {hidden ? '✕' : '✓'} {CATEGORY_LABELS[cat]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              hitSlop={HIT_SLOP}
              onPress={() => setSettingsVisible(false)}
              style={styles.modalCloseButton}
            >
              <Text style={styles.modalCloseText}>닫기</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f8fbff',
  },
  topChrome: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 3,
  },
  topChromeContent: {
    gap: 10,
    paddingHorizontal: 16,
  },
  searchAndActionsRow: {
    flexDirection: 'row',
    gap: 10,
    zIndex: 20,
  },
  iconActionButton: {
    alignItems: 'center',
    backgroundColor: BG_WHITE,
    borderColor: BORDER_LIGHT,
    borderRadius: 18,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  iconActionButtonPressed: {
    opacity: 0.86,
  },
  iconActionButtonDisabled: {
    backgroundColor: BG_NEAR_WHITE,
    opacity: 0.55,
  },
  iconActionGlyph: {
    color: TEXT_DARK,
    fontSize: 18,
    fontWeight: '800',
  },
  iconActionGlyphDisabled: {
    color: TEXT_LIGHT,
  },
  locateButton: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
  },
  bleButtonLabel: {
    color: PRIMARY_BLUE,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  bleButtonActive: {
    backgroundColor: PRIMARY_BLUE,
    borderColor: PRIMARY_BLUE,
  },
  bleButtonLabelActive: {
    color: BG_WHITE,
  },
  mapHelperText: {
    color: '#64748b',
    fontSize: 12,
    lineHeight: 16,
  },
  levelSelector: {
    alignSelf: 'flex-start',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderColor: BORDER_LIGHT,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    shadowColor: TEXT_DARK,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    zIndex: 1,
  },
  levelSelectorLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  levelButtonsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  levelButton: {
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 48,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  levelButtonSelected: {
    backgroundColor: PRIMARY_BLUE,
    borderColor: PRIMARY_BLUE,
  },
  levelButtonPressed: {
    opacity: 0.86,
  },
  levelButtonText: {
    color: PRIMARY_BLUE,
    fontSize: 12,
    fontWeight: '800',
  },
  levelButtonTextSelected: {
    color: BG_WHITE,
  },
  mapArea: {
    ...StyleSheet.absoluteFillObject,
  },
  bottomSheetContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: SHEET_HEIGHT,
    overflow: 'hidden',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalCard: {
    backgroundColor: BG_WHITE,
    borderRadius: 20,
    marginHorizontal: 20,
    padding: 20,
    gap: 16,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  modalTitle: {
    color: TEXT_DARK,
    fontSize: 18,
    fontWeight: '800',
  },
  modalSectionTitle: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  baseLayerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  baseLayerButton: {
    alignItems: 'center',
    backgroundColor: BG_NEAR_WHITE,
    borderColor: BORDER_DEFAULT,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
    paddingVertical: 10,
    minWidth: 80,
    paddingHorizontal: 10,
  },
  baseLayerButtonActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#93c5fd',
  },
  baseLayerIcon: {
    fontSize: 22,
  },
  baseLayerLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
  },
  baseLayerLabelActive: {
    color: PRIMARY_BLUE,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    backgroundColor: BG_NEAR_WHITE,
    borderLeftWidth: 3,
    borderColor: BORDER_DEFAULT,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  categoryChipHidden: {
    backgroundColor: '#f1f5f9',
    opacity: 0.55,
  },
  categoryChipText: {
    color: TEXT_DARK,
    fontSize: 12,
    fontWeight: '600',
  },
  categoryChipTextHidden: {
    color: TEXT_LIGHT,
  },
  modalCloseButton: {
    alignItems: 'center',
    backgroundColor: PRIMARY_BLUE,
    borderRadius: 14,
    paddingVertical: 12,
  },
  modalCloseText: {
    color: BG_WHITE,
    fontSize: 15,
    fontWeight: '700',
  },
});
