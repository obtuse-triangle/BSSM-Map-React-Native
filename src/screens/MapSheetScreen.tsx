import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MAP_STYLES } from '../constants/mapStyles';
import campusDataUntyped from '../data/campus-wgs84.json';
import { BleWclStatusCard } from '../components/map/BleWclStatusCard';
import { GlassSurface } from '../components/glass';
import { SearchBar } from '../components/map/SearchBar';
import { useSearchBar } from '../hooks/useSearchBar';
import { useMapStore, type CampusFeatureCategory } from '../store/mapStore';
import { usePositionStore } from '../store/positionStore';
import { useBleLocationStore } from '../store/bleLocationStore';
import type { CampusGeoJSON } from '../types/geojson';
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
    bleCardVisible,
    settingsVisible,
    setBleCardVisible,
    setSettingsVisible,
    setPendingFlyToFeatureId,
    requestShowAttribution,
  } = useMapStore();

  const allCategories = useMapStore((s) => s.allCategories);
  const { position, status: positionStatus, error: positionError } = usePositionStore();

  const levels = useMemo(() => getLevelKeys(campusData), []);
  const isLocateDisabled = positionStatus === 'loading';
  const baseLayerIcon = MAP_STYLES.find((s) => s.id === baseLayer)?.icon ?? '⚙';
  const isDarkMap = useMemo(() => MAP_STYLES.find((s) => s.id === baseLayer)?.theme === 'dark', [baseLayer]);

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
  } = useBleLocationStore();

  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'MapSheet'>>();
  const [currentDetentIndex, setCurrentDetentIndex] = useState(1);

  // Sync sheetAllowedDetents with BLE/settings visibility.
  // When BLE or settings is open, remove both collapsed detents (0.06, 0.12) so iOS
  // auto-snaps to medium (0.5). Restore all detents when both are hidden.
  // Always set sheetLargestUndimmedDetentIndex to the last index to prevent out-of-bounds crash.
  useEffect(() => {
    if (bleCardVisible || settingsVisible) {
      navigation.setOptions({
        sheetAllowedDetents: [0.5, 1.0],
        sheetLargestUndimmedDetentIndex: 1,
      });
    } else {
      navigation.setOptions({
        sheetAllowedDetents: [0.06, 0.12, 0.5, 1.0],
        sheetLargestUndimmedDetentIndex: 3,
      });
    }
  }, [bleCardVisible, settingsVisible, navigation]);

  // Track sheet detent position for search bar visibility and dynamic corner radius
  useEffect(() => {
    const unsubscribe = navigation.addListener('sheetDetentChange', (e) => {
      setCurrentDetentIndex(e.data.index);
    });
    return unsubscribe;
  }, [navigation]);

  const isFullDetent = useMemo(() => {
    const maxDetent = bleCardVisible || settingsVisible ? 1 : 3;
    return currentDetentIndex === maxDetent;
  }, [currentDetentIndex, bleCardVisible, settingsVisible]);

  const mergedBlockOpacity = useRef(new Animated.Value(1)).current;

  // Fade mergedBlock in/out when transitioning to/from full detent
  useEffect(() => {
    Animated.timing(mergedBlockOpacity, {
      toValue: isFullDetent ? 0 : 1,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [isFullDetent, mergedBlockOpacity]);

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
      setSelectedFeatureId(featureId);
      // Signal MapScreen to fly to this feature
      setPendingFlyToFeatureId(featureId);
      setSearchQuery('');
      Keyboard.dismiss();
    },
    [selectedLevel, setSelectedFeatureId, setSelectedLevel, setPendingFlyToFeatureId, setSearchQuery],
  );

  const handleBleScan = useCallback(() => {
    if (bleCardVisible) {
      setBleCardVisible(false);
      dismissCard();
      return;
    }
    // Mutual exclusion: close settings when opening BLE
    setSettingsVisible(false);
    setBleCardVisible(true);

    if (!isContinuousScanning) {
      startContinuousScan();
      startMotionTracking();
    }
  }, [bleCardVisible, setBleCardVisible, dismissCard, isContinuousScanning, startContinuousScan, startMotionTracking, setSettingsVisible]);

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
      navigation.navigate('PlaceDetailSheet');
    }
  }, [selectedFeatureId, isFocused, navigation, setBleCardVisible, setSettingsVisible]);

  const showBle = bleCardVisible;
  const showSettings = settingsVisible;

  const mergedBlockChildren = (
    <>
      {/* Row 1: Bar buttons */}
      <View style={styles.barRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isLocateDisabled ? '현재 위치 찾기 불가' : '현재 위치 찾기'}
          disabled={isLocateDisabled}
          onPress={handleLocate}
          style={({ pressed }) => [styles.barButton, pressed && { backgroundColor: isDarkMap ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
        >
          <Text style={[styles.barButtonGlyph, { color: isDarkMap ? '#f1f5f9' : '#0f172a' }, isLocateDisabled && { color: isDarkMap ? '#64748b' : '#94a3b8', opacity: 0.55 }]}>⌖</Text>
        </Pressable>

        <View style={[styles.barDivider, { backgroundColor: isDarkMap ? 'rgba(255,255,255,0.12)' : '#e2e8f0' }]} />

        {Platform.OS === 'ios' ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isContinuousScanning ? 'BLE WCL 실시간 스캔 중지' : 'BLE WCL 실시간 스캔 시작'}
              onPress={handleBleScan}
              style={({ pressed }) => [
                styles.barButton,
                pressed && { backgroundColor: isDarkMap ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' },
                bleCardVisible && styles.barButtonActive,
              ]}
            >
              <Text style={[styles.barButtonBleLabel, { color: isDarkMap ? '#60a5fa' : '#1d4ed8' }]}>BLE</Text>
            </Pressable>
            <View style={[styles.barDivider, { backgroundColor: isDarkMap ? 'rgba(255,255,255,0.12)' : '#e2e8f0' }]} />
          </>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="지도 설정"
          onPress={handleToggleSettings}
          style={({ pressed }) => [
            styles.barButton,
            pressed && { backgroundColor: isDarkMap ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' },
            settingsVisible && styles.barButtonActive,
          ]}
        >
          <Text style={[styles.barButtonGlyph, { color: isDarkMap ? '#f1f5f9' : '#0f172a' }]}>{baseLayerIcon}</Text>
        </Pressable>

        <View style={[styles.barDivider, { backgroundColor: isDarkMap ? 'rgba(255,255,255,0.12)' : '#e2e8f0' }]} />

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
                  <Text style={[styles.levelButtonText, { color: isDarkMap ? '#f1f5f9' : '#0f172a' }, selected && { color: isDarkMap ? '#60a5fa' : '#1d4ed8' }]}>
                    {level}F
                  </Text>
                </Pressable>
            );
          })}
        </View>

        <View style={[styles.barDivider, { backgroundColor: isDarkMap ? 'rgba(255,255,255,0.12)' : '#e2e8f0' }]} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="지도 정보"
          onPress={() => requestShowAttribution()}
          style={({ pressed }) => [
            styles.barButton,
            pressed && { backgroundColor: isDarkMap ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' },
          ]}
        >
          <Text style={[styles.barButtonGlyph, { color: isDarkMap ? '#f1f5f9' : '#0f172a' }]}>ⓘ</Text>
        </Pressable>
      </View>

      {/* Row 2: Search bar */}
      <View style={styles.searchRow}>
        <SearchBar
            containerStyle={{ flex: 1 }}
            insets={{ top: 0, bottom: 0, left: 0, right: 0 }}
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
      </View>
    </>
  );

  return (
    <View style={styles.container}>
      {/* Merged glass bar + search bar — one unified block at top of sheet */}
      <Animated.View style={{ opacity: mergedBlockOpacity }}>
        {isFullDetent ? (
          <View style={styles.mergedBlock}>
            {mergedBlockChildren}
          </View>
        ) : (
          <GlassSurface variant="control" cornerRadius={0} style={styles.mergedBlock}>
            {mergedBlockChildren}
          </GlassSurface>
        )}
      </Animated.View>

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
          return msg ? <Text style={[styles.helperText, { color: isDarkMap ? '#94a3b8' : '#64748b' }]}>{msg}</Text> : null;
        })()}

        {/* Empty state — shown when BLE and settings are both closed */}
        {!showBle && !showSettings && (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyStateTitle, { color: isDarkMap ? '#f1f5f9' : '#0f172a' }]}>BSSM 학교 지도</Text>
            <Text style={[styles.emptyStateText, { color: isDarkMap ? '#cbd5e1' : '#475569' }]}>
              검색하거나 지도에서 교실을 탭하여 정보를 확인하세요.
            </Text>
            <Text style={[styles.emptyStateHint, { color: isDarkMap ? '#64748b' : '#94a3b8' }]}>
              ⌖ 현재 위치 찾기 · BLE 실내 측위 · 지도 스타일 변경
            </Text>
          </View>
        )}

        {/* Settings Panel */}
        {showSettings && (
          <GlassSurface variant="modal" cornerRadius={20} style={styles.settingsCard}>
            <Text style={[styles.settingsTitle, { color: isDarkMap ? '#f1f5f9' : '#0f172a' }]}>지도 설정</Text>

            <Text style={[styles.settingsSectionTitle, { color: isDarkMap ? '#94a3b8' : '#64748b' }]}>배경 지도</Text>
            <View style={styles.baseLayerRow}>
              {BASE_LAYER_OPTIONS.map((opt) => {
                const active = baseLayer === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setBaseLayer(opt.key)}
                    style={[
                      styles.baseLayerButton,
                      { backgroundColor: isDarkMap ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderColor: isDarkMap ? 'rgba(255,255,255,0.12)' : '#e2e8f0' },
                      active && { backgroundColor: isDarkMap ? 'rgba(59,130,246,0.25)' : 'rgba(59,130,246,0.08)', borderColor: isDarkMap ? 'rgba(59,130,246,0.4)' : 'rgba(59,130,246,0.2)' },
                    ]}
                  >
                    <Text style={styles.baseLayerIcon}>{opt.icon}</Text>
                    <Text style={[styles.baseLayerLabel, { color: isDarkMap ? '#94a3b8' : '#64748b' }, active && { color: isDarkMap ? '#60a5fa' : '#1d4ed8' }]}>{opt.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.settingsSectionTitle, { color: isDarkMap ? '#94a3b8' : '#64748b' }]}>카테고리 표시</Text>
            <View style={styles.categoryGrid}>
              {allCategories().map((cat) => {
                const hidden = hiddenCategories.has(cat);
                return (
                  <Pressable
                    key={cat}
                    hitSlop={HIT_SLOP}
                    onPress={() => toggleCategory(cat)}
                    style={[
                      styles.categoryChip,
                      { backgroundColor: isDarkMap ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderColor: isDarkMap ? 'rgba(255,255,255,0.12)' : '#e2e8f0', borderLeftColor: CATEGORY_COLORS[cat] },
                      hidden && { backgroundColor: isDarkMap ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', opacity: 0.55 },
                    ]}
                  >
                    <Text style={[styles.categoryChipText, { color: isDarkMap ? '#f1f5f9' : '#0f172a' }, hidden && { color: isDarkMap ? '#64748b' : '#94a3b8' }]}>
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
    overflow: 'hidden',
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
  barButton: {
    alignItems: 'center',
    borderRadius: 16,
    height: 40,
    justifyContent: 'center',
    minWidth: 40,
    paddingHorizontal: 6,
  },
  barButtonActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
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
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
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
