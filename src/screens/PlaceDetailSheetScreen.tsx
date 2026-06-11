import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';

import { GlassSurface } from '../components/glass';
import { adaptiveBadgeText, adaptiveDivider, adaptivePressed, adaptiveSelectionBg, adaptiveSelectionBorder, adaptiveText, adaptiveTextBody, adaptiveTextSecondary } from '../theme';
import campusDataUntyped from '../data/campus-wgs84.json';
import { useMapStore } from '../store/mapStore';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import type { CampusGeoJSON } from '../types/geojson';
import type { Floor, FloorElement } from '../types/floorMap';
import { getFeatureById, getFeatureCentroid } from '../utils/geoJsonHelpers';

const campusData = campusDataUntyped as unknown as CampusGeoJSON;

export function PlaceDetailSheetScreen() {
  const scheme = useColorScheme();
  const { selectedFeatureId, setSelectedFeatureId } = useMapStore();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'PlaceDetailSheet'>>();
  const [currentDetentIndex, setCurrentDetentIndex] = useState(1);

  // Track sheet detent position for collapsed vs expanded layout
  useEffect(() => {
    const unsubscribe = navigation.addListener('sheetDetentChange', (e) => {
      setCurrentDetentIndex(e.data.index);
    });
    return unsubscribe;
  }, [navigation]);

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
          <Text style={[styles.pillTitle, { color: adaptiveText(scheme) }]} numberOfLines={1}>
            {roomName}
          </Text>
          {!isCollapsed && floorLabel && (
            <Text style={[styles.pillSubtitle, { color: adaptiveTextSecondary(scheme) }]} numberOfLines={1}>
              {floorLabel} · {category ?? '공간'}
            </Text>
          )}
        </View>

        {floorLabel && (
          <View style={[styles.floorBadge, { backgroundColor: adaptiveSelectionBg(scheme), borderColor: adaptiveSelectionBorder(scheme) }]}>
            <Text style={[styles.floorBadgeText, { color: adaptiveBadgeText(scheme) }]}>{floorLabel}</Text>
          </View>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="닫기"
          onPress={handleDismiss}
          style={styles.closeButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <GlassSurface variant="control" cornerRadius={14} style={[styles.closeButtonInner, { backgroundColor: adaptivePressed(scheme) }]}>
            <Text style={[styles.closeButtonText, { color: adaptiveTextSecondary(scheme) }]}>✕</Text>
          </GlassSurface>
        </Pressable>
      </View>

      {/* Detail card — visible at medium+ detents */}
      {isMediumOrFull && bottomSheetRoom && (
        <GlassSurface variant="sheet" cornerRadius={20} style={[styles.detailCard, { borderColor: adaptiveDivider(scheme) }]}>
          <View style={[styles.detailRow, { backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.2)', borderColor: adaptiveDivider(scheme) }]}>
            <Text style={[styles.detailLabel, { color: adaptiveTextSecondary(scheme) }]}>층</Text>
            <Text style={[styles.detailValue, { color: adaptiveText(scheme) }]}>{floorLabel ?? '알 수 없음'}</Text>
          </View>
          {category && (
            <View style={[styles.detailRow, { backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.2)', borderColor: adaptiveDivider(scheme) }]}>
              <Text style={[styles.detailLabel, { color: adaptiveTextSecondary(scheme) }]}>종류</Text>
              <Text style={[styles.detailValue, { color: adaptiveText(scheme) }]}>{category}</Text>
            </View>
          )}
          {centroid && (
            <View style={[styles.detailRow, { backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.2)', borderColor: adaptiveDivider(scheme) }]}>
              <Text style={[styles.detailLabel, { color: adaptiveTextSecondary(scheme) }]}>좌표</Text>
              <Text style={[styles.detailValue, { color: adaptiveText(scheme) }]}>{centroid}</Text>
            </View>
          )}
        </GlassSurface>
      )}

      {/* Empty state when no room data (medium+) */}
      {isMediumOrFull && !bottomSheetRoom && (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: adaptiveTextBody(scheme) }]}>공간 정보를 불러올 수 없습니다.</Text>
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
    alignSelf: 'center',
  },
  closeButtonInner: {
    alignItems: 'center',
    borderRadius: 14,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  closeButtonText: {
    fontSize: 13,
    fontWeight: '700',
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
