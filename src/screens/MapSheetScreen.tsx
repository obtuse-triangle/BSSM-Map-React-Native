import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { MAP_STYLES } from '../constants/mapStyles';
import campusDataUntyped from '../data/campus-wgs84.json';
import { FeedbackStateCard } from '../components/feedback/FeedbackStateCard';
import { BleWclStatusCard } from '../components/map/BleWclStatusCard';
import { GlassSurface } from '../components/glass';
import { SearchBar } from '../components/map/SearchBar';
import { useSearchBar } from '../hooks/useSearchBar';
import { useMapStore, type CampusFeatureCategory } from '../store/mapStore';
import { usePositionStore } from '../store/positionStore';
import { useBleLocationStore } from '../store/bleLocationStore';
import {
  sheetAccent,
  sheetLabel,
  sheetSecondaryLabel,
  sheetSecondarySystemFill,
  sheetSeparator,
  sheetSystemFill,
  sheetTertiaryLabel,
  sheetSelectionBg,
} from '../theme/sheetSemanticColors';
import type { CampusFeature, CampusGeoJSON } from '../types/geojson';
import { getFeatureById, getLevelKeys } from '../utils/geoJsonHelpers';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

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

export function MapSheetScreen() {
  const sheetScheme = useColorScheme();
  const { searchQuery, setSearchQuery, searchResults } = useSearchBar();

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
    bleCardVisible,
    settingsVisible,
    setBleCardVisible,
    setSettingsVisible,
    setPendingFlyToFeatureId,
    requestShowAttribution,
    requestMinimizeSheets,
    bleTrackingEnabled,
    setBleTrackingEnabled,
    clearLocationSource,
    gpsTrackingEnabled,
    userCoordinates,
    minimizeSheetsTick,
  } = useMapStore();

  const allCategories = useMapStore((s) => s.allCategories);
  const { position, status: positionStatus, error: positionError } = usePositionStore();

  const levels = useMemo(() => getLevelKeys(campusData), []);
  const gpsSearching = gpsTrackingEnabled && !userCoordinates;
  const isLocateDisabled = positionStatus === 'loading' || gpsSearching;
  const baseLayerIcon = MAP_STYLES.find((s) => s.id === baseLayer)?.icon ?? '⚙';

  const handleLocate = useCallback(() => {
    setPendingFlyToFeatureId('__locate__');
  }, [setPendingFlyToFeatureId]);

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

  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'MapSheet'>>();
  const [currentDetentIndex, setCurrentDetentIndex] = useState(1);
  const lastMinimizedTickRef = useRef(minimizeSheetsTick);
  const prevBleVisibleRef = useRef(bleCardVisible);
  const prevSettingsVisibleRef = useRef(settingsVisible);

  // Track sheet detent position for collapsed vs expanded layout
  useEffect(() => {
    const unsubscribe = navigation.addListener('sheetDetentChange', (e) => {
      setCurrentDetentIndex(e.data.index);
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    if (minimizeSheetsTick === lastMinimizedTickRef.current) {
      return;
    }

    lastMinimizedTickRef.current = minimizeSheetsTick;
    navigation.setOptions({
      sheetAllowedDetents: [0.06],
      sheetLargestUndimmedDetentIndex: 0,
      sheetInitialDetentIndex: 0,
    });

    const restoreTimer = setTimeout(() => {
      navigation.setOptions({
        sheetAllowedDetents: [0.06, 0.12, 0.5, 1.0],
        sheetLargestUndimmedDetentIndex: 3,
      });
    }, 400);

    return () => clearTimeout(restoreTimer);
  }, [minimizeSheetsTick, navigation]);

  useEffect(() => {
    const bleJustOpened = bleCardVisible && !prevBleVisibleRef.current;
    const settingsJustOpened = settingsVisible && !prevSettingsVisibleRef.current;
    const bleJustClosed = !bleCardVisible && prevBleVisibleRef.current;
    const settingsJustClosed = !settingsVisible && prevSettingsVisibleRef.current;

    prevBleVisibleRef.current = bleCardVisible;
    prevSettingsVisibleRef.current = settingsVisible;

    if (bleJustOpened || settingsJustOpened) {
      navigation.setOptions({
        sheetAllowedDetents: [0.5],
        sheetLargestUndimmedDetentIndex: 0,
        sheetInitialDetentIndex: 0,
      });

      const restoreTimer = setTimeout(() => {
        navigation.setOptions({
          sheetAllowedDetents: [0.06, 0.12, 0.5, 1.0],
          sheetLargestUndimmedDetentIndex: 3,
        });
      }, 400);

      return () => clearTimeout(restoreTimer);
    }

    if (bleJustClosed || settingsJustClosed) {
      navigation.setOptions({
        sheetAllowedDetents: [0.06],
        sheetLargestUndimmedDetentIndex: 0,
        sheetInitialDetentIndex: 0,
      });

      const restoreTimer = setTimeout(() => {
        navigation.setOptions({
          sheetAllowedDetents: [0.06, 0.12, 0.5, 1.0],
          sheetLargestUndimmedDetentIndex: 3,
        });
      }, 400);

      return () => clearTimeout(restoreTimer);
    }
  }, [bleCardVisible, settingsVisible, navigation]);

  const currentPosition = useMemo(() => {
    if (!selectedFloorKey || !position || position.floorKey !== selectedFloorKey) {
      return null;
    }
    return position;
  }, [position, selectedFloorKey]);

  const statusForSelectedFloor = currentPosition !== null || positionStatus !== 'success' ? positionStatus : 'idle';

  const handleSelectSearchResult = useCallback(
    (featureId: string) => {
      const feature = getFeatureById(campusData, featureId);
      if (feature && feature.properties.level !== selectedLevel) {
        setSelectedLevel(feature.properties.level);
      }
      setSearchQuery('');
      setBleCardVisible(false);
      setSettingsVisible(false);
      Keyboard.dismiss();
      setSelectedFeatureId(featureId);
      // Signal MapScreen to fly to this feature
      setPendingFlyToFeatureId(featureId);
      requestMinimizeSheets();
    },
    [selectedLevel, setBleCardVisible, setSelectedFeatureId, setSelectedLevel, setSettingsVisible, setPendingFlyToFeatureId, setSearchQuery, requestMinimizeSheets],
  );

  const handleBleScan = useCallback(() => {
    if (bleTrackingEnabled) {
      // BLE OFF path
      setBleTrackingEnabled(false);
      setBleCardVisible(false);
      dismissCard();
      stopContinuousScan();
      stopMotionTracking();
      clearLocationSource('ble');
      return;
    }
    // BLE ON path
    setBleTrackingEnabled(true);
    setSettingsVisible(false);
    setBleCardVisible(true);
    if (!isContinuousScanning) {
      startContinuousScan();
      startMotionTracking();
    }
  }, [bleTrackingEnabled, setBleTrackingEnabled, setBleCardVisible, dismissCard, stopContinuousScan, stopMotionTracking, clearLocationSource, setSettingsVisible, isContinuousScanning, startContinuousScan, startMotionTracking]);

  const handleToggleSettings = useCallback(() => {
    if (settingsVisible) {
      setSettingsVisible(false);
    } else {
      // Mutual exclusion: close BLE when opening settings
      setBleCardVisible(false);
      setSettingsVisible(true);
    }
  }, [settingsVisible, setSettingsVisible, setBleCardVisible]);

  const isFocused = useIsFocused();

  // Navigate to PlaceDetailSheet when a feature is selected
  useEffect(() => {
    if (selectedFeatureId && isFocused) {
      // Close BLE/settings when showing place detail
      setBleCardVisible(false);
      setSettingsVisible(false);
      const navigationState = navigation.getState();
      const currentRouteName = navigationState.routes[navigationState.index]?.name;
      if (currentRouteName !== 'PlaceDetailSheet') {
        navigation.navigate('PlaceDetailSheet');
      }
    }
  }, [selectedFeatureId, isFocused, navigation, setBleCardVisible, setSettingsVisible]);

  const showBle = bleCardVisible && !settingsVisible;
  const showSettings = settingsVisible && !bleCardVisible;
  const mapCategories = allCategories();

  const mergedBlockChildren = (
    <>
      {/* Row 1: Bar buttons */}
      <View style={styles.barRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={gpsSearching ? 'GPS 위치 찾는 중' : gpsTrackingEnabled ? 'GPS 위치 추적 끄기' : 'GPS 위치 추적 켜기'}
          disabled={isLocateDisabled}
          onPress={handleLocate}
          style={({ pressed }) => [styles.barButton, pressed && { backgroundColor: sheetSystemFill }, gpsTrackingEnabled && styles.barButtonActive]}
        >
          <Text style={[styles.barButtonGlyph, { color: sheetLabel }, isLocateDisabled && { color: sheetTertiaryLabel, opacity: 0.55 }]}>⌖</Text>
        </Pressable>

        <View style={[styles.barDivider, { backgroundColor: sheetSeparator }]} />

        {Platform.OS === 'ios' ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={bleTrackingEnabled ? 'BLE WCL 실시간 스캔 중지' : 'BLE WCL 실시간 스캔 시작'}
              onPress={handleBleScan}
              style={({ pressed }) => [
                styles.barButton,
                pressed && { backgroundColor: sheetSystemFill },
                bleTrackingEnabled && styles.barButtonActive,
              ]}
            >
              <Text style={[styles.barButtonBleLabel, { color: sheetAccent(sheetScheme) }]}>BLE</Text>
            </Pressable>
            <View style={[styles.barDivider, { backgroundColor: sheetSeparator }]} />
          </>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="지도 설정"
          onPress={handleToggleSettings}
          style={({ pressed }) => [
            styles.barButton,
            pressed && { backgroundColor: sheetSystemFill },
            settingsVisible && styles.barButtonActive,
          ]}
        >
          <Text style={[styles.barButtonGlyph, { color: sheetLabel }]}>{baseLayerIcon}</Text>
        </Pressable>

        <View style={[styles.barDivider, { backgroundColor: sheetSeparator }]} />

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
                    <Text style={[styles.levelButtonText, { color: sheetLabel }, selected && { color: sheetAccent(sheetScheme) }]}>
                    {level}F
                  </Text>
                </Pressable>
            );
          })}
        </View>

        <View style={styles.infoGroup}>
          <View style={[styles.barDivider, { backgroundColor: sheetSeparator }]} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="지도 정보"
            onPress={() => requestShowAttribution()}
            style={({ pressed }) => [
              styles.barButton,
              pressed && { backgroundColor: sheetSystemFill },
            ]}
          >
            <Text style={[styles.barButtonGlyph, { color: sheetLabel }]}>ⓘ</Text>
          </Pressable>
        </View>
      </View>

      {/* Row 2: Search bar */}
        <View style={styles.searchRow}>
          <SearchBar
            containerStyle={{ flex: 1 }}
            useNativeSheetColors
            onBlur={() => {}}
            onClear={() => setSearchQuery('')}
            onFocus={() => {}}
            onSearchChange={setSearchQuery}
            searchQuery={searchQuery}
          />
      </View>
    </>
  );

  return (
    <View style={styles.container}>
      {/* Merged glass bar + search bar — one unified block at top of sheet */}
      <View style={styles.mergedBlock}>
        {mergedBlockChildren}
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Position status helper text */}
        {(() => {
          const msg = statusForSelectedFloor === 'loading'
            ? '현재 위치를 계산하는 중입니다.'
            : statusForSelectedFloor === 'success' && currentPosition
              ? `현재 위치 x ${currentPosition.x.toFixed(1)}% · y ${currentPosition.y.toFixed(1)}%`
              : statusForSelectedFloor === 'error'
                ? positionError ?? '현재 위치를 찾지 못했습니다.'
                : bleStatus === 'success' && bleResult
                  ? `BLE WCL 위치 확인됨 · ±${bleResult.accuracyMeters.toFixed(1)}m · 신뢰도 ${(bleResult.confidence * 100).toFixed(0)}%`
                  : null;
          return msg ? <Text style={[styles.helperText, { color: sheetSecondaryLabel }]}>{msg}</Text> : null;
        })()}

        {/* Empty state — shown when BLE and settings are both closed */}
        {!showBle && !showSettings && searchQuery.trim().length === 0 && (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyStateTitle, { color: sheetLabel }]}>BSSM 학교 지도</Text>
            <Text style={[styles.emptyStateText, { color: sheetSecondaryLabel }]}> 
              검색하거나 지도에서 교실을 탭하여 정보를 확인하세요.
            </Text>
            <Text style={[styles.emptyStateHint, { color: sheetTertiaryLabel }]}> 
              ⌖ 현재 위치 찾기 · BLE 실내 측위 · 지도 스타일 변경
            </Text>
          </View>
        )}

        {searchQuery.trim().length > 0 && searchResults.length > 0 && !showBle && !showSettings && (
          <>
            {searchResults.map((feature: CampusFeature) => {
              const featureKey = feature.properties.id ?? String(feature.id);
              const selected = featureKey === String(selectedFeatureId);
              return (
                <Pressable
                  key={featureKey}
                  accessibilityRole="button"
                  hitSlop={HIT_SLOP}
                  onPress={() => handleSelectSearchResult(featureKey)}
                  style={({ pressed }) => [
                    styles.searchResultRow,
                    selected && styles.searchResultRowSelected,
                    pressed && { opacity: 0.88 },
                  ]}
                >
                  <Text style={[styles.searchResultName, { color: sheetLabel }, selected && { color: sheetAccent(sheetScheme) }]} numberOfLines={1}>
                    {feature.properties.name_ko || feature.properties.name}
                  </Text>
                  <Text style={[styles.searchResultMeta, { color: sheetSecondaryLabel }, selected && { color: sheetAccent(sheetScheme) }]}>
                    {selected ? '선택됨' : `${feature.properties.level}층 · ${feature.properties.category}`}
                  </Text>
                </Pressable>
              );
            })}
          </>
        )}

        {searchQuery.trim().length > 0 && searchResults.length === 0 && !showBle && !showSettings && (
          <FeedbackStateCard title="검색 결과" message="현재 층에서 일치하는 교실이 없습니다." variant="empty" />
        )}

        {/* Settings Panel */}
        {showSettings && (
          <GlassSurface variant="modal" cornerRadius={20} style={styles.settingsCard}>
            <Text style={[styles.settingsTitle, { color: sheetLabel }]}>지도 설정</Text>

            <Text style={[styles.settingsSectionTitle, { color: sheetSecondaryLabel }]}>배경 지도</Text>
            <View style={styles.baseLayerRow}>
              {BASE_LAYER_OPTIONS.map((opt) => {
                const active = baseLayer === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setBaseLayer(opt.key)}
                    style={[
                      styles.baseLayerButton,
                      { backgroundColor: sheetSystemFill, borderColor: sheetSeparator },
                      active && { backgroundColor: sheetSelectionBg, borderColor: sheetAccent(sheetScheme) },
                    ]}
                  >
                    <Text style={[styles.baseLayerIcon, { color: sheetLabel }]}>{opt.icon}</Text>
                    <Text style={[styles.baseLayerLabel, { color: sheetSecondaryLabel }, active && { color: sheetAccent(sheetScheme) }]}>{opt.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.settingsSectionTitle, { color: sheetSecondaryLabel }]}>카테고리 표시</Text>
            <View style={styles.categoryGrid}>
              {mapCategories.map((cat) => {
                const hidden = hiddenCategories.has(cat);
                return (
                  <Pressable
                    key={cat}
                    hitSlop={HIT_SLOP}
                    onPress={() => toggleCategory(cat)}
                    style={[
                      styles.categoryChip,
                      { backgroundColor: sheetSystemFill, borderColor: sheetSeparator, borderLeftColor: CATEGORY_COLORS[cat] },
                      hidden && { backgroundColor: sheetSecondarySystemFill, opacity: 0.55 },
                    ]}
                  >
                    <Text style={[styles.categoryChipText, { color: sheetLabel }, hidden && { color: sheetTertiaryLabel }]}> 
                      {hidden ? '✕' : '✓'} {CATEGORY_LABELS[cat]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

          </GlassSurface>
        )}

        {/* BLE Status Card */}
        {showBle && (
          <BleWclStatusCard
            colorScheme={sheetScheme === 'dark' ? 'dark' : 'light'}
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
            fusionState={fusionState}
            fusionUnavailableReason={fusionUnavailableReason}
          />
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  mergedBlock: {
    overflow: 'visible',
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginTop: 0,
    marginBottom: 8,
    gap: 4,
    borderCurve: 'continuous',
  },
  barRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
  },
  infoGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
    marginLeft: 'auto',
  },
  barButton: {
    alignItems: 'center',
    borderRadius: 16,
    height: 40,
    justifyContent: 'center',
    minWidth: 40,
    paddingHorizontal: 6,
  },
  barButtonActive: {
    backgroundColor: sheetSelectionBg,
  },
  barButtonGlyph: {
    fontSize: 18,
    fontWeight: '800',
  },
  barButtonBleLabel: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  barDivider: {
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
    backgroundColor: sheetSelectionBg,
  },
  levelButtonText: {
    fontSize: 12,
    fontWeight: '800',
  },
  scrollContent: {
    gap: 12,
    paddingBottom: 24,
  },
  searchRow: {
    flexDirection: 'row',
    zIndex: 20,
  },
  searchRowCollapsed: {
    height: 0,
    overflow: 'hidden',
    opacity: 0,
  },
  helperText: {
    fontSize: 12,
    lineHeight: 16,
    paddingHorizontal: 4,
  },
  searchResultRow: {
    borderRadius: 14,
    gap: 2,
    marginHorizontal: 2,
    marginBottom: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchResultRowSelected: {
    backgroundColor: sheetSelectionBg,
  },
  searchResultName: {
    fontSize: 15,
    fontWeight: '700',
  },
  searchResultMeta: {
    fontSize: 12,
    fontWeight: '600',
  },
  // ── Settings ────────────────────────────────────
  settingsCard: {
    gap: 16,
    padding: 20,
  },
  settingsTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  settingsSectionTitle: {
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
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
    paddingVertical: 10,
    minWidth: 80,
    paddingHorizontal: 10,
  },
  baseLayerIcon: {
    fontSize: 22,
  },
  baseLayerLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    borderLeftWidth: 3,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  // ── Empty state ───────────────────────────────────
  emptyState: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 20,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  emptyStateText: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  emptyStateHint: {
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
});
