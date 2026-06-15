import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, useColorScheme, View } from 'react-native';

import { GlassSurface } from '../components/glass';
import { sheetAccent, sheetLabel, sheetSecondaryLabel, sheetSecondarySystemFill, sheetSelectionBg, sheetSeparator, sheetSystemFill } from '../theme/sheetSemanticColors';
import campusDataUntyped from '../data/campus-wgs84.json';
import { useMapStore } from '../store/mapStore';
import { useRouteStore } from '../store/routeStore';
import { useSavedPlacesStore } from '../store/savedPlacesStore';
import { SAVED_PLACE_COLOR_PALETTE } from '../types/savedPlaces';
import type { SavedCustomPin } from '../types/savedPlaces';
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
  const isMinimizedRef = useRef(false);

  // Track sheet detent position for collapsed vs expanded layout
  useEffect(() => {
    const unsubscribe = navigation.addListener('sheetDetentChange', (e) => {
      setCurrentDetentIndex(e.data.index);
      if (isMinimizedRef.current) {
        isMinimizedRef.current = false;
        navigation.setOptions({
          sheetAllowedDetents: [0.09, 0.3, 0.55, 1.0],
          sheetLargestUndimmedDetentIndex: 3,
          sheetInitialDetentIndex: e.data.index,
        });
      }
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    if (minimizeSheetsTick === lastMinimizedTickRef.current) {
      return;
    }

    lastMinimizedTickRef.current = minimizeSheetsTick;
    isMinimizedRef.current = true;
    // Restrict to the two smallest detents. Sheet snaps to smallest (0.09)
    // and the user can drag up to 0.3 but no further while minimized.
    // No restore timer, no sheetInitialDetentIndex — the sheetDetentChange
    // listener still drives currentDetentIndex locally for the pill row
    // style. Restricted detents stay in place until the user drags.
    navigation.setOptions({
      sheetAllowedDetents: [0.09, 0.3],
      sheetLargestUndimmedDetentIndex: 1,
    });
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

  const handleFindRoute = useCallback(() => {
    if (!featureIdForSave) return;
    useRouteStore.getState().setDestinationFeature(featureIdForSave);
    navigation.navigate('RoutePlan');
  }, [featureIdForSave, navigation]);

  const [originJustSet, setOriginJustSet] = useState(false);
  const originTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSetAsOrigin = useCallback(() => {
    if (!featureIdForSave) return;
    useRouteStore.getState().setOriginFromFeature(featureIdForSave);
    setOriginJustSet(true);
    if (originTimeoutRef.current) clearTimeout(originTimeoutRef.current);
    originTimeoutRef.current = setTimeout(() => setOriginJustSet(false), 1500);
  }, [featureIdForSave]);

  // ── Custom pin editor state ─────────────────────────────────────────────
  const [customPinState, setCustomPinState] = useState<{
    id: string | null;
    place: SavedCustomPin | null;
  }>(() => {
    const id = useSavedPlacesStore.getState().selectedSavedPlaceId;
    const place = id ? useSavedPlacesStore.getState().getSavedPlace(id) : undefined;
    return { id, place: place && place.type === 'custom' ? place : null };
  });

  useEffect(() => {
    const sync = () => {
      const id = useSavedPlacesStore.getState().selectedSavedPlaceId;
      const place = id ? useSavedPlacesStore.getState().getSavedPlace(id) : undefined;
      setCustomPinState({ id, place: place && place.type === 'custom' ? place : null });
    };
    sync();
    const unsub = useSavedPlacesStore.subscribe(sync);
    return unsub;
  }, []);

  const customPinPlace: SavedCustomPin | null = selectedFeatureId ? null : customPinState.place;

  const handleDeleteCustomPin = useCallback(() => {
    if (!customPinPlace) return;
    useSavedPlacesStore.getState().removeSavedPlace(customPinPlace.id);
    useSavedPlacesStore.getState().setSelectedSavedPlaceId(null);
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  }, [customPinPlace, navigation]);

  // Clean up store selection when dismissing
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', () => {
      setSelectedFeatureId(null);
      useSavedPlacesStore.getState().setSelectedSavedPlaceId(null);
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
      {customPinPlace ? (
        <>
          {/* Pill row — visible at all detents for custom pin */}
          <View style={[styles.pillRow, isCollapsed && styles.pillRowCollapsed]}>
            <View style={styles.pillCopy}>
              <Text style={[styles.pillTitle, { color: sheetLabel }]} numberOfLines={1}>
                {customPinPlace.name || '새 핀'}
              </Text>
              {!isCollapsed && (
                <Text style={[styles.pillSubtitle, { color: sheetSecondaryLabel }]} numberOfLines={1}>
                  커스텀 핀
                </Text>
              )}
            </View>

            <View style={[styles.floorBadge, { backgroundColor: sheetSelectionBg, borderColor: sheetSeparator }]}>
              <Text style={[styles.floorBadgeText, { color: sheetAccent(accentScheme) }]}>📍</Text>
            </View>

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

          {/* Custom pin editor — visible at medium+ detents */}
          {isMediumOrFull && (
            <GlassSurface variant="sheet" cornerRadius={20} style={[styles.detailCard, { borderColor: sheetSeparator }]}>
              <Text style={[styles.editorSectionTitle, { color: sheetSecondaryLabel }]}>이름</Text>
              <TextInput
                value={customPinPlace.name}
                onChangeText={(text) => useSavedPlacesStore.getState().updateCustomPin(customPinPlace.id, { name: text })}
                placeholder="이름 입력"
                placeholderTextColor={sheetSecondaryLabel}
                style={[
                  styles.nameInput,
                  { color: sheetLabel, backgroundColor: sheetSecondarySystemFill, borderColor: sheetSeparator },
                ]}
                accessibilityLabel="커스텀 핀 이름"
              />

              <Text style={[styles.editorSectionTitle, { color: sheetSecondaryLabel }]}>색상</Text>
              <View style={styles.colorRow}>
                {SAVED_PLACE_COLOR_PALETTE.map((c) => {
                  const selected = customPinPlace.color === c;
                  return (
            <Pressable
                      key={c}
                      accessibilityRole="button"
                      accessibilityLabel={`색상 ${c}`}
                      onPress={() => useSavedPlacesStore.getState().updateCustomPin(customPinPlace.id, { color: c })}
                      style={[
                        styles.colorSwatch,
                        { backgroundColor: c },
                        selected && { borderWidth: 2, borderColor: sheetAccent(accentScheme) },
                      ]}
                    />
                  );
                })}
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="삭제"
                onPress={handleDeleteCustomPin}
                style={({ pressed }) => [
                  styles.deleteButton,
                  { backgroundColor: sheetSystemFill },
                  pressed && styles.closeButtonPressed,
                ]}
              >
                <Text style={[styles.deleteButtonText, { color: sheetAccent(accentScheme) }]}>삭제</Text>
              </Pressable>
            </GlassSurface>
          )}
        </>
      ) : (
        <>
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

      {featureIdForSave && isMediumOrFull && (
        <View style={styles.actionRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="출발지로 설정"
            onPress={handleSetAsOrigin}
            style={({ pressed }) => [
              styles.originButton,
              { borderColor: sheetSeparator },
              originJustSet
                ? { backgroundColor: sheetSelectionBg, borderColor: sheetAccent(accentScheme) }
                : { backgroundColor: sheetSecondarySystemFill },
              pressed && styles.closeButtonPressed,
            ]}
          >
            <Text style={styles.actionButtonEmoji}>🟢</Text>
            <Text
              style={[
                styles.actionButtonText,
                { color: originJustSet ? sheetAccent(accentScheme) : sheetLabel },
              ]}
            >
              {originJustSet ? '출발지로 설정됨' : '출발지로 설정'}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="길찾기"
            onPress={handleFindRoute}
            style={({ pressed }) => [
              styles.routeButton,
              { backgroundColor: sheetAccent(accentScheme) },
              pressed && styles.closeButtonPressed,
            ]}
          >
            <Text style={styles.routeButtonEmoji}>🔍</Text>
            <Text style={styles.routeButtonText}>길찾기</Text>
          </Pressable>
        </View>
      )}

      {bottomSheetRoom && (
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

      {!bottomSheetRoom && (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: sheetSecondaryLabel }]}>공간 정보를 불러올 수 없습니다.</Text>
        </View>
      )}
        </>
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
  // ── Custom pin editor ───────────────────────────────────
  editorSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  nameInput: {
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 15,
    fontWeight: '600',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  colorSwatch: {
    borderRadius: 14,
    height: 24,
    width: 24,
  },
  deleteButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    borderRadius: 12,
    marginTop: 8,
    paddingVertical: 12,
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  // ── Action row (출발지/길찾기) ──────────────────
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  originButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    paddingVertical: 12,
    flex: 1,
  },
  routeButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    paddingVertical: 12,
    flex: 1,
  },
  actionButtonEmoji: {
    fontSize: 13,
    includeFontPadding: false,
    lineHeight: 16,
  },
  routeButtonEmoji: {
    fontSize: 13,
    includeFontPadding: false,
    lineHeight: 16,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '700',
    includeFontPadding: false,
  },
  routeButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    includeFontPadding: false,
    textAlign: 'center',
  },
});
