import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { bssmFloorMap } from '../constants/bssmFloorMap';
import campusDataUntyped from '../data/campus-wgs84.json';
import CampusMap, { type CampusMapHandle } from '../components/map/CampusMap';
import { PlaceDetailBottomSheet, SHEET_HEIGHT } from '../components/map/PlaceDetailBottomSheet';
import { ZoomControls } from '../components/map/ZoomControls';
import type { RootStackParamList } from '../navigation/types';
import type { Floor, FloorElement } from '../types/floorMap';
import type { CampusGeoJSON } from '../types/geojson';
import { getAccessPointsForFloor } from '../utils/accessPoint';
import { getFeatureById, getFeatureCentroid, getInteractiveFeatures, getLevelKeys } from '../utils/geoJsonHelpers';
import { useMapStore, type CampusFeatureCategory, type MapBaseLayer } from '../store/mapStore';
import { usePositionStore } from '../store/positionStore';
import { getSelectedFloor } from '../utils/floorMap';

const campusData = campusDataUntyped as unknown as CampusGeoJSON;

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

const BASE_LAYER_OPTIONS: { key: MapBaseLayer; label: string; icon: string }[] = [
  { key: 'osm', label: '일반 지도', icon: '🗺' },
  { key: 'satellite', label: '위성', icon: '🛰' },
  { key: 'design', label: '설계도', icon: '▦' },
];

type MapScreenProps = NativeStackScreenProps<RootStackParamList, 'Map'>;
const MAP_TOP_CHROME_GAP = 8;

export function MapScreen({ navigation }: MapScreenProps) {
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState('');
  const [topChromeHeight, setTopChromeHeight] = useState(0);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const campusMapRef = useRef<CampusMapHandle>(null);
  const topObstructionHeight = topChromeHeight > 0 ? topChromeHeight + MAP_TOP_CHROME_GAP : insets.top + 12;

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
  const { position, status, error, locateCurrentPosition } = usePositionStore();

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

  const statusForSelectedFloor = currentPosition !== null || status !== 'success' ? status : 'idle';

  const levels = useMemo(() => getLevelKeys(campusData), []);
  const searchableFeatures = useMemo(() => getInteractiveFeatures(campusData), []);

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

  const searchResults = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return [];
    }
    return searchableFeatures.filter((feature) => {
      const searchableLabel = `${feature.properties.name} ${feature.properties.name_ko}`.toLowerCase();
      return searchableLabel.includes(normalizedQuery);
    });
  }, [searchQuery, searchableFeatures]);

  const isLocateDisabled = status === 'loading' || userCoordinates === null;

  const handleLocate = useCallback(() => {
    if (userCoordinates) {
      campusMapRef.current?.flyToUser();
      return;
    }
    if (!selectedFloorKey || accessPoints.length === 0) {
      return;
    }
    void locateCurrentPosition({ floorKey: selectedFloorKey, accessPoints });
  }, [accessPoints, locateCurrentPosition, selectedFloorKey, userCoordinates]);

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

  const baseLayerIcon = baseLayer === 'satellite' ? '🛰' : baseLayer === 'design' ? '▦' : '⚙';

  return (
    <View style={styles.screen}>
      <View onLayout={handleTopChromeLayout} style={[styles.topChrome, { paddingTop: insets.top + 12 }]} pointerEvents="box-none">
        <View style={styles.topChromeContent}>
          <View style={styles.searchAndActionsRow}>
            <View style={styles.searchField}>
              <Text style={styles.searchIcon}>⌕</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="never"
                placeholder="현재 층 교실 검색"
                placeholderTextColor="#94a3b8"
                returnKeyType="search"
                selectionColor="#1d4ed8"
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="검색어 지우기"
                  onPress={() => setSearchQuery('')}
                  style={({ pressed }) => [styles.clearButton, pressed && styles.iconActionButtonPressed]}
                >
                  <Text style={styles.clearButtonText}>×</Text>
                </Pressable>
              ) : null}
            </View>

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
                    onPress={() => setSelectedLevel(level)}
                    style={({ pressed }) => [styles.levelButton, selected && styles.levelButtonSelected, pressed && styles.levelButtonPressed]}
                  >
                    <Text style={[styles.levelButtonText, selected && styles.levelButtonTextSelected]}>{level}F</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {searchResults.length > 0 ? (
            <View style={styles.searchResultsCard}>
              <Text style={styles.searchResultsTitle}>검색 결과</Text>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
                style={styles.searchResultsList}
              >
                {searchResults.map((feature) => {
                  const featureKey = feature.properties.id ?? String(feature.id);
                  const selected = featureKey === selectedFeature?.properties?.id;
                  return (
                    <Pressable
                      key={featureKey}
                      accessibilityRole="button"
                      onPress={() => handleSelectSearchResult(featureKey)}
                      style={({ pressed }) => [
                        styles.searchResultRow,
                        selected && styles.searchResultRowSelected,
                        pressed && styles.searchResultRowPressed,
                      ]}
                    >
                      <Text style={[styles.searchResultName, selected && styles.searchResultNameSelected]} numberOfLines={1}>
                        {feature.properties.name_ko || feature.properties.name}
                      </Text>
                      <Text style={[styles.searchResultMeta, selected && styles.searchResultMetaSelected]}>
                        {selected ? '선택됨' : `L${feature.properties.level} · ${feature.properties.category}`}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : searchQuery.trim().length > 0 ? (
            <View style={styles.searchResultsCard}>
              <Text style={styles.searchResultsTitle}>검색 결과</Text>
              <Text style={styles.searchResultsEmpty}>현재 층에서 일치하는 교실이 없습니다.</Text>
            </View>
          ) : null}

          <Text style={styles.mapHelperText}>
            {statusForSelectedFloor === 'loading'
              ? '현재 위치를 계산하는 중입니다.'
              : statusForSelectedFloor === 'success' && currentPosition
                ? `현재 위치 x ${currentPosition.x.toFixed(1)}% · y ${currentPosition.y.toFixed(1)}%`
                : statusForSelectedFloor === 'error'
                  ? error ?? '현재 위치를 찾지 못했습니다.'
                  : '현재 층에서 AP를 눌러 위치를 계산할 수 있습니다.'}
          </Text>
        </View>
      </View>

      <View style={styles.mapArea}>
        <CampusMap ref={campusMapRef} topPadding={topObstructionHeight} />
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
  },
  searchField: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#d8e2ef',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  searchIcon: {
    color: '#94a3b8',
    fontSize: 16,
    fontWeight: '800',
  },
  searchInput: {
    color: '#0f172a',
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: 0,
  },
  clearButton: {
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  clearButtonText: {
    color: '#1d4ed8',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 18,
  },
  iconActionButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#d8e2ef',
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
    backgroundColor: '#f8fafc',
    opacity: 0.55,
  },
  iconActionGlyph: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '800',
  },
  iconActionGlyphDisabled: {
    color: '#94a3b8',
  },
  locateButton: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
  },
  searchResultsCard: {
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderColor: '#d8e2ef',
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
    maxHeight: 188,
    padding: 14,
  },
  searchResultsTitle: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '800',
  },
  searchResultsList: {
    flexGrow: 0,
  },
  searchResultRow: {
    backgroundColor: '#f8fbff',
    borderColor: '#e2e8f0',
    borderRadius: 14,
    borderWidth: 1,
    gap: 2,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchResultRowSelected: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
  },
  searchResultRowPressed: {
    opacity: 0.88,
  },
  searchResultName: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '700',
  },
  searchResultNameSelected: {
    color: '#1d4ed8',
  },
  searchResultMeta: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
  },
  searchResultMetaSelected: {
    color: '#1d4ed8',
  },
  searchResultsEmpty: {
    color: '#64748b',
    fontSize: 13,
    lineHeight: 18,
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
    borderColor: '#d8e2ef',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
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
    backgroundColor: '#1d4ed8',
    borderColor: '#1d4ed8',
  },
  levelButtonPressed: {
    opacity: 0.86,
  },
  levelButtonText: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '800',
  },
  levelButtonTextSelected: {
    color: '#ffffff',
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
    backgroundColor: '#ffffff',
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
    color: '#0f172a',
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
    gap: 10,
  },
  baseLayerButton: {
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    gap: 4,
    paddingVertical: 10,
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
    color: '#1d4ed8',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    backgroundColor: '#f8fafc',
    borderLeftWidth: 3,
    borderColor: '#e2e8f0',
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
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '600',
  },
  categoryChipTextHidden: {
    color: '#94a3b8',
  },
  modalCloseButton: {
    alignItems: 'center',
    backgroundColor: '#1d4ed8',
    borderRadius: 14,
    paddingVertical: 12,
  },
  modalCloseText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
