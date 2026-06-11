import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { GlassSurface } from '../glass';
import type { Floor, FloorElement } from '../../types/floorMap';

type PlaceDetailBottomSheetProps = {
  floor: Floor | undefined;
  room: FloorElement | null;
};

export const SHEET_HEIGHT = 272;
export const COLLAPSED_VISIBLE_HEIGHT = 128;
const COLLAPSED_TRANSLATE_Y = SHEET_HEIGHT - COLLAPSED_VISIBLE_HEIGHT;
const SNAP_THRESHOLD = COLLAPSED_TRANSLATE_Y / 2;
const SNAP_VELOCITY_THRESHOLD = 900;

const SPRING_CONFIG = {
  damping: 22,
  mass: 0.9,
  stiffness: 220,
} as const;

const clamp = (value: number, min: number, max: number) => {
  'worklet';

  return Math.min(Math.max(value, min), max);
};

const formatPercent = (value: number): string => {
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`;
};

export function PlaceDetailBottomSheet({ floor, room }: PlaceDetailBottomSheetProps) {
  const roomName = room?.name.trim();
  const floorLabel = floor?.label ?? '알 수 없음';
  const title = roomName || (floor ? `${floor.label} 정보` : '공간 정보');
  const summaryText = room
    ? `층 ${floorLabel} · 영역과 좌표를 아래에서 확인할 수 있습니다.`
    : '교실을 탭하면 공간 정보가 아래에 표시됩니다.';
  const translateY = useSharedValue(COLLAPSED_TRANSLATE_Y);
  const dragStartY = useSharedValue(COLLAPSED_TRANSLATE_Y);

  const gesture = useMemo(() => {
    return Gesture.Pan()
      .minDistance(4)
      .onStart(() => {
        dragStartY.value = translateY.value;
      })
      .onUpdate((event) => {
        translateY.value = clamp(dragStartY.value + event.translationY, 0, COLLAPSED_TRANSLATE_Y);
      })
      .onEnd((event) => {
        const projectedY = translateY.value + event.velocityY * 0.18;
        const targetY = projectedY > SNAP_THRESHOLD ? COLLAPSED_TRANSLATE_Y : 0;

        if (Math.abs(event.velocityY) > SNAP_VELOCITY_THRESHOLD) {
          translateY.value = withSpring(event.velocityY > 0 ? COLLAPSED_TRANSLATE_Y : 0, SPRING_CONFIG);
          return;
        }

        translateY.value = withSpring(targetY, SPRING_CONFIG);
      });
  }, [dragStartY, translateY]);

  const sheetStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
    };
  });

  const detailsStyle = useAnimatedStyle(() => {
    const progress = 1 - translateY.value / COLLAPSED_TRANSLATE_Y;

    return {
      opacity: interpolate(progress, [0, 1], [0, 1]),
      transform: [{ translateY: interpolate(progress, [0, 1], [10, 0]) }],
    };
  });

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.sheet, sheetStyle]}>
        <GlassSurface variant="sheet" cornerRadius={24} style={styles.sheetGlass}>
          <View style={styles.handleBar} />

          <View style={styles.headerRow}>
            <View style={styles.headerCopy}>
              <Text style={styles.sheetTitle} numberOfLines={1}>
                {title}
              </Text>
              <Text style={styles.summaryText} numberOfLines={2}>
                {summaryText}
              </Text>
            </View>

            {room ? (
              <View style={styles.floorPill}>
                <Text style={styles.floorPillText}>{floorLabel}</Text>
              </View>
            ) : null}
          </View>

          <Animated.View style={[styles.detailsSection, detailsStyle]}>
            {room ? (
              <View style={styles.detailsContainer}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>층</Text>
                  <Text style={styles.detailValue}>{floorLabel}</Text>
                </View>
                {(room as any)._geojsonMeta ? (
                  <>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>종류</Text>
                      <Text style={styles.detailValue}>{(room as any)._geojsonMeta.category}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>좌표</Text>
                      <Text style={styles.detailValue}>{(room as any)._geojsonMeta.centroid}</Text>
                    </View>
                  </>
                ) : (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>영역</Text>
                    <Text style={styles.detailValue}>
                      x {formatPercent(room.x)} · y {formatPercent(room.y)} · {formatPercent(room.width)} × {formatPercent(room.height)}
                    </Text>
                  </View>
                )}
              </View>
            ) : (
              <Text style={styles.emptyText}>교실을 선택하면 층 정보와 영역 좌표가 표시됩니다.</Text>
            )}
          </Animated.View>
        </GlassSurface>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: 12,
    height: SHEET_HEIGHT,
    width: '100%',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 18,
    overflow: 'hidden',
  },
  sheetGlass: {
    flex: 1,
    gap: 12,
    alignSelf: 'stretch',
    width: '100%',
  },
  handleBar: {
    alignSelf: 'center',
    backgroundColor: '#cbd5e1',
    borderRadius: 999,
    height: 4,
    width: 42,
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    gap: 10,
  },
  sheetTitle: {
    color: '#0f172a',
    fontSize: 17,
    fontWeight: '800',
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
  summaryText: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 18,
  },
  emptyText: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 20,
  },
  detailsContainer: {
    gap: 8,
  },
  detailsSection: {
    gap: 12,
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
});
