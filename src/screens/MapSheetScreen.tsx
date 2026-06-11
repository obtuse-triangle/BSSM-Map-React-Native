import { useCallback, useMemo } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BG_NEAR_WHITE, BORDER_DEFAULT, PRIMARY_BLUE, TEXT_DARK, TEXT_LIGHT } from '../theme';
import { MAP_STYLES } from '../constants/mapStyles';
import { bssmFloorMap } from '../constants/bssmFloorMap';
import campusDataUntyped from '../data/campus-wgs84.json';
import { BleWclStatusCard } from '../components/map/BleWclStatusCard';
import { GlassSurface } from '../components/glass';
import { SearchBar } from '../components/map/SearchBar';
import { useSearchBar } from '../hooks/useSearchBar';
import { useMapStore, type CampusFeatureCategory } from '../store/mapStore';
import { usePositionStore } from '../store/positionStore';
import { useBleLocationStore } from '../store/bleLocationStore';
import type { CampusGeoJSON } from '../types/geojson';
import type { Floor, FloorElement } from '../types/floorMap';
import { getFeatureById, getFeatureCentroid } from '../utils/geoJsonHelpers';
import { getSelectedFloor } from '../utils/floorMap';

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
  } = useMapStore();

  const allCategories = useMapStore((s) => s.allCategories);
  const { position, status: positionStatus, error: positionError } = usePositionStore();

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

  const selectedFloor = useMemo(
    () => getSelectedFloor(bssmFloorMap, selectedFloorKey),
    [selectedFloorKey],
  );

  const currentPosition = useMemo(() => {
    if (!selectedFloorKey || !position || position.floorKey !== selectedFloorKey) {
      return null;
    }
    return position;
  }, [position, selectedFloorKey]);

  const statusForSelectedFloor = currentPosition !== null || positionStatus !== 'success' ? positionStatus : 'idle';

  const selectedFeature = useMemo(() => {
    if (!selectedFeatureId) return null;
    return getFeatureById(campusData, selectedFeatureId) ?? null;
  }, [selectedFeatureId]);

  const bottomSheetFloor = useMemo<Floor | undefined>(() => {
    if (!selectedFeature) return undefined;
    return {
      key: String(selectedFeature.properties.level),
      label: `${selectedFeature.properties.level}F`,
      elements: [],
    } as Floor;
  }, [selectedFeature]);

  const bottomSheetRoom = useMemo<FloorElement | null>(() => {
    if (!selectedFeature) return null;
    const centroid = getFeatureCentroid(selectedFeature);
    return {
      id: Number(selectedFeature.id) || 0,
      name: selectedFeature.properties.name_ko || selectedFeature.properties.name,
      x: 0, y: 0, width: 0, height: 0,
      interactive: selectedFeature.properties.interactive,
      _geojsonMeta: {
        category: selectedFeature.properties.category,
        centroid: `[${centroid[0].toFixed(5)}, ${centroid[1].toFixed(5)}]`,
      },
    } as FloorElement & { _geojsonMeta?: { category: string; centroid: string } };
  }, [selectedFeature]);

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
    setBleCardVisible(true);

    if (!isContinuousScanning) {
      startContinuousScan();
      startMotionTracking();
    }
  }, [bleCardVisible, setBleCardVisible, dismissCard, isContinuousScanning, startContinuousScan, startMotionTracking]);

  const handleDismissSettings = useCallback(() => {
    setSettingsVisible(false);
  }, [setSettingsVisible]);

  const showPlaceDetail = selectedFeatureId !== null && selectedFeature !== null;
  const showBle = bleCardVisible;
  const showSettings = settingsVisible;

  return (
    <View style={styles.container}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Search Bar */}
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

        {/* Position status helper text */}
        <Text style={styles.helperText}>
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

        {/* Settings Panel */}
        {showSettings && (
          <GlassSurface variant="modal" cornerRadius={20} style={styles.settingsCard}>
            <Text style={styles.settingsTitle}>지도 설정</Text>

            <Text style={styles.settingsSectionTitle}>배경 지도</Text>
            <View style={styles.baseLayerRow}>
              {BASE_LAYER_OPTIONS.map((opt) => {
                const active = baseLayer === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setBaseLayer(opt.key)}
                    style={[styles.baseLayerButton, active && styles.baseLayerButtonActive]}
                  >
                    <Text style={styles.baseLayerIcon}>{opt.icon}</Text>
                    <Text style={[styles.baseLayerLabel, active && styles.baseLayerLabelActive]}>{opt.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.settingsSectionTitle}>카테고리 표시</Text>
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
              onPress={handleDismissSettings}
              style={styles.settingsCloseButton}
            >
              <Text style={styles.settingsCloseText}>닫기</Text>
            </Pressable>
          </GlassSurface>
        )}

        {/* Place Detail Card */}
        {showPlaceDetail && !showSettings && (
          <GlassSurface variant="sheet" cornerRadius={20} style={styles.placeDetailCard}>
            <View style={styles.placeDetailHeader}>
              <View style={styles.placeDetailCopy}>
                <Text style={styles.placeDetailTitle} numberOfLines={1}>
                  {bottomSheetRoom?.name?.trim() || (bottomSheetFloor ? `${bottomSheetFloor.label} 정보` : '공간 정보')}
                </Text>
                <Text style={styles.placeDetailSummary} numberOfLines={2}>
                  {bottomSheetRoom
                    ? `층 ${bottomSheetFloor?.label ?? '알 수 없음'} · 영역과 좌표를 아래에서 확인할 수 있습니다.`
                    : '교실을 탭하면 공간 정보가 아래에 표시됩니다.'}
                </Text>
              </View>
              {bottomSheetRoom && bottomSheetFloor && (
                <View style={styles.floorPill}>
                  <Text style={styles.floorPillText}>{bottomSheetFloor.label}</Text>
                </View>
              )}
            </View>

            {bottomSheetRoom && (
              <View style={styles.placeDetailSection}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>층</Text>
                  <Text style={styles.detailValue}>{bottomSheetFloor?.label ?? '알 수 없음'}</Text>
                </View>
                {(bottomSheetRoom as any)._geojsonMeta && (
                  <>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>종류</Text>
                      <Text style={styles.detailValue}>{(bottomSheetRoom as any)._geojsonMeta.category}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>좌표</Text>
                      <Text style={styles.detailValue}>{(bottomSheetRoom as any)._geojsonMeta.centroid}</Text>
                    </View>
                  </>
                )}
              </View>
            )}

            {!bottomSheetRoom && (
              <Text style={styles.emptyText}>교실을 선택하면 층 정보와 영역 좌표가 표시됩니다.</Text>
            )}
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

        {/* Empty state when nothing active */}
        {!showPlaceDetail && !showBle && !showSettings && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>BSSM 학교 지도</Text>
            <Text style={styles.emptyStateText}>
              검색하거나 지도에서 교실을 탭하여 정보를 확인하세요.
            </Text>
            <Text style={styles.emptyStateHint}>
              ⌖ 현재 위치 찾기 · BLE 실내 측위 · 지도 스타일 변경
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    gap: 12,
    paddingBottom: 24,
  },
  searchRow: {
    flexDirection: 'row',
    zIndex: 20,
  },
  helperText: {
    color: '#64748b',
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
    color: TEXT_DARK,
    fontSize: 18,
    fontWeight: '800',
  },
  settingsSectionTitle: {
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
  settingsCloseButton: {
    alignItems: 'center',
    backgroundColor: PRIMARY_BLUE,
    borderRadius: 14,
    paddingVertical: 12,
  },
  settingsCloseText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  // ── Place Detail ────────────────────────────────
  placeDetailCard: {
    gap: 12,
    padding: 18,
  },
  placeDetailHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
  },
  placeDetailCopy: {
    flex: 1,
    gap: 10,
  },
  placeDetailTitle: {
    color: '#0f172a',
    fontSize: 17,
    fontWeight: '800',
  },
  placeDetailSummary: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 18,
  },
  floorPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  floorPillText: {
    color: '#1d4ed8',
    fontSize: 11,
    fontWeight: '800',
  },
  placeDetailSection: {
    gap: 8,
  },
  detailRow: {
    backgroundColor: '#f8fbff',
    borderColor: '#e2e8f0',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  detailLabel: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '700',
    minWidth: 38,
  },
  detailValue: {
    color: '#0f172a',
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  emptyText: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 20,
  },
  // ── Empty State ─────────────────────────────────
  emptyState: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 20,
  },
  emptyStateTitle: {
    color: TEXT_DARK,
    fontSize: 16,
    fontWeight: '800',
  },
  emptyStateText: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  emptyStateHint: {
    color: TEXT_LIGHT,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
});
