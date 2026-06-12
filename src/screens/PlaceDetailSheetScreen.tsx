import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';

import { GlassSurface } from '../components/glass';
import { sheetAccent, sheetLabel, sheetSecondaryLabel, sheetSecondarySystemFill, sheetSelectionBg, sheetSeparator, sheetSystemFill } from '../theme/sheetSemanticColors';
import campusDataUntyped from '../data/campus-wgs84.json';
import { useMapStore } from '../store/mapStore';
import { useSavedPlacesStore } from '../store/savedPlacesStore';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import type { CampusGeoJSON } from '../types/geojson';
import type { Floor, FloorElement } from '../types/floorMap';
import { getFeatureById, getFeatureCentroid } from '../utils/geoJsonHelpers';

const campusData = campusDataUntyped as unknown as CampusGeoJSON;

export function PlaceDetailSheetScreen() {
  const { selectedFeatureId, setSelectedFeatureId, minimizeSheetsTick } = useMapStore();
  const accentScheme = useColorScheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'PlaceDetailSheet'>>();
  const [currentDetentIndex, setCurrentDetentIndex] = useState(1);
  const lastMinimizedTickRef = useRef(minimizeSheetsTick);

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
      sheetAllowedDetents: [0.09, 0.3, 0.55, 1.0],
      sheetInitialDetentIndex: 0,
    });
    setCurrentDetentIndex(0);
  }, [minimizeSheetsTick, navigation]);

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

  // ── Save / unsave state ────────────────────────────────────────────
  const featureIdForSave = selectedFeature && selectedFeature.properties.interactive
    ? String(selectedFeature.id)
    : null;

  const [isSaved, setIsSaved] = useState<boolean>(
    featureIdForSave ? useSavedPlacesStore.getState().isCampusFeatureSaved(featureIdForSave) : false,
  );

  useEffect(() => {
    if (!featureIdForSave) {
      setIsSaved(false);
      return;
    }
    setIsSaved(useSavedPlacesStore.getState().isCampusFeatureSaved(featureIdForSave));
    const unsub = useSavedPlacesStore.subscribe((state) => {
      setIsSaved(state.isCampusFeatureSaved(featureIdForSave));
    });
    return unsub;
  }, [featureIdForSave]);

  const handleToggleSave = useCallback(() => {
    if (!selectedFeature || !featureIdForSave) return;
    const feature = selectedFeature;

    if (isSaved) {
      useSavedPlacesStore.getState().removeSavedPlace(`campus:${featureIdForSave}`);
      return;
    }

    const snapshot = {
      featureId: featureIdForSave,
      name: feature.properties.name,
      nameKo: feature.properties.name_ko,
      category: feature.properties.category,
      level: feature.properties.level,
      coordinates: getFeatureCentroid(feature),
    };
    useSavedPlacesStore.getState().hydrateSavedCampusPlace(snapshot);
  }, [selectedFeature, featureIdForSave, isSaved]);

  // Clean up store selection when dismissing
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', () => {
      setSelectedFeatureId(null);
    });
    return unsubscribe;
  }, [navigation, setSelectedFeatureId]);

  const handleDismiss = useCallback(() => {
    setSelectedFeatureId(null);
    navigation.goBack();
  }, [setSelectedFeatureId, navigation]);

  const isCollapsed = currentDetentIndex === 0;
  const isMediumOrFull = currentDetentIndex >= 1;

  const roomName = bottomSheetRoom?.name?.trim() || (bottomSheetFloor ? `${bottomSheetFloor.label} 정보` : '공간 정보');
  const floorLabel = bottomSheetFloor?.label ?? null;
  const category = (bottomSheetRoom as any)?._geojsonMeta?.category ?? null;
  const centroid = (bottomSheetRoom as any)?._geojsonMeta?.centroid ?? null;

  return (
    <View style={styles.container}>
      {/* Pill row — visible at all detents */}
      <View style={[styles.pillRow, isCollapsed && styles.pillRowCollapsed]}>
        <View style={styles.pillCopy}>
          <Text style={[styles.pillTitle, { color: sheetLabel }]} numberOfLines={1}>
            {roomName}
          </Text>
          {!isCollapsed && floorLabel && (
            <Text style={[styles.pillSubtitle, { color: sheetSecondaryLabel }]} numberOfLines={1}>
              {floorLabel} · {category ?? '공간'}
            </Text>
          )}
        </View>

        {floorLabel && (
          <View style={[styles.floorBadge, { backgroundColor: sheetSelectionBg, borderColor: sheetSeparator }]}>
            <Text style={[styles.floorBadgeText, { color: sheetAccent(accentScheme) }]}>{floorLabel}</Text>
          </View>
        )}

        {featureIdForSave && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isSaved ? '저장됨' : '저장'}
            onPress={handleToggleSave}
            style={({ pressed }) => [
              styles.saveButton,
              { backgroundColor: sheetSystemFill },
              pressed && styles.closeButtonPressed,
            ]}
            hitSlop={{ top: 7, bottom: 7, left: 7, right: 7 }}
          >
            <Text style={[styles.saveButtonText, { color: isSaved ? sheetAccent(accentScheme) : sheetSecondaryLabel }]}>
              {isSaved ? '★' : '☆'}
            </Text>
          </Pressable>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="닫기"
          onPress={handleDismiss}
          style={({ pressed }) => [
            styles.closeButton,
            { backgroundColor: sheetSystemFill },
            pressed && styles.closeButtonPressed,
          ]}
          hitSlop={{ top: 7, bottom: 7, left: 7, right: 7 }}
        >
          <Text style={[styles.closeButtonText, { color: sheetSecondaryLabel }]}>×</Text>
        </Pressable>
      </View>

      {/* Detail card — visible at medium+ detents */}
      {isMediumOrFull && bottomSheetRoom && (
        <GlassSurface variant="sheet" cornerRadius={20} style={[styles.detailCard, { borderColor: sheetSeparator }]}>
          <View style={[styles.detailRow, { backgroundColor: sheetSecondarySystemFill, borderColor: sheetSeparator }]}>
            <Text style={[styles.detailLabel, { color: sheetSecondaryLabel }]}>층</Text>
            <Text style={[styles.detailValue, { color: sheetLabel }]}>{floorLabel ?? '알 수 없음'}</Text>
          </View>
          {category && (
            <View style={[styles.detailRow, { backgroundColor: sheetSecondarySystemFill, borderColor: sheetSeparator }]}>
              <Text style={[styles.detailLabel, { color: sheetSecondaryLabel }]}>종류</Text>
              <Text style={[styles.detailValue, { color: sheetLabel }]}>{category}</Text>
            </View>
          )}
          {centroid && (
            <View style={[styles.detailRow, { backgroundColor: sheetSecondarySystemFill, borderColor: sheetSeparator }]}>
              <Text style={[styles.detailLabel, { color: sheetSecondaryLabel }]}>좌표</Text>
              <Text style={[styles.detailValue, { color: sheetLabel }]}>{centroid}</Text>
            </View>
          )}
        </GlassSurface>
      )}

      {/* Empty state when no room data (medium+) */}
      {isMediumOrFull && !bottomSheetRoom && (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: sheetSecondaryLabel }]}>공간 정보를 불러올 수 없습니다.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  // ── Pill row ────────────────────────────────────
  pillRow: {
    alignItems: 'center',
    borderCurve: 'continuous',
    flexDirection: 'row',
    gap: 10,
    overflow: 'visible',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  pillRowCollapsed: {
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  pillCopy: {
    flex: 1,
  },
  pillTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  pillSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  floorBadge: {
    alignSelf: 'center',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  floorBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  closeButton: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: 15,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  closeButtonPressed: {
    opacity: 0.6,
  },
  closeButtonText: {
    fontSize: 18,
    fontWeight: '400',
    includeFontPadding: false,
    textAlign: 'center',
  },
  saveButton: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: 15,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    includeFontPadding: false,
    textAlign: 'center',
  },
  // ── Detail card ─────────────────────────────────
  detailCard: {
    borderWidth: 1,
    gap: 16,
    margin: 16,
    padding: 20,
  },
  detailRow: {
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '700',
    minWidth: 38,
  },
  detailValue: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  emptyContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});
