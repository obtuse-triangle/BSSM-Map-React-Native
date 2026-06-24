import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card } from '../components/common';
import { FeedbackStateCard } from '../components/feedback/FeedbackStateCard';
import type { RootStackParamList } from '../navigation/types';
import { useDebugStore } from '../store/debugStore';
import { usePositionStore } from '../store/positionStore';
import { BG_BLUE_LIGHT, BG_WHITE, BORDER_BLUE_LIGHT, BORDER_LIGHT, PRIMARY_BLUE, STATUS_ERROR, STATUS_SUCCESS, TEXT_DARK, TEXT_MEDIUM, TEXT_SECONDARY } from '../theme';

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

type DebugRttScreenProps = NativeStackScreenProps<RootStackParamList, 'DebugRtt'>;

const formatPoint = (point: { x: number; y: number } | null): string => {
  return point ? `x ${point.x.toFixed(1)}% · y ${point.y.toFixed(1)}%` : '—';
};

const formatPosition = (position: { x: number; y: number; accuracyMeters: number } | null): string => {
  return position ? `${formatPoint(position)} · ±${position.accuracyMeters.toFixed(1)}m` : '—';
};

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card style={styles.summaryCard}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </Card>
  );
}

export function DebugRttScreen({ navigation }: DebugRttScreenProps) {
  const insets = useSafeAreaInsets();
  const { status, error, lastMeasurementCount, lastValidMeasurementCount } = usePositionStore();
  const { lastFloorKey, lastAccessPoints, lastScanResult, lastPosition } = useDebugStore();

  const accessPointById = useMemo(
    () => new Map(lastAccessPoints.map((accessPoint) => [accessPoint.id, accessPoint])),
    [lastAccessPoints],
  );

  const hasScanData = lastScanResult !== null;

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <Button variant="secondary" title="← 지도" onPress={() => navigation.goBack()} style={{ borderRadius: 16 }} />
        <View style={styles.headerCopy}>
          <Text style={styles.screenTitle}>Debug RTT</Text>
          <Text style={styles.screenSubtitle}>최근 RTT 측정, 참조 위치, 추정 위치를 확인합니다.</Text>
        </View>
        <Pressable accessibilityRole="button" hitSlop={HIT_SLOP} onPress={() => navigation.navigate('Home')} style={({ pressed }) => [styles.homeButton, pressed && styles.pressed]}>
          <Text style={styles.homeButtonText}>홈</Text>
        </Pressable>
      </View>

      {status === 'loading' ? (
        <FeedbackStateCard title="측정 중" message="현재 위치를 계산하는 중입니다." variant="loading" />
      ) : null}

      {status === 'error' ? (
        <FeedbackStateCard title="측정 실패" message={error ?? '현재 위치를 계산하지 못했습니다.'} variant="error" />
      ) : null}

      <View style={styles.contentBlock}>
        <View style={styles.summaryGrid}>
          <SummaryCard label="마지막 층" value={lastFloorKey ?? '—'} />
          <SummaryCard label="AP 개수" value={String(lastAccessPoints.length)} />
          <SummaryCard label="측정 개수" value={String(lastMeasurementCount)} />
          <SummaryCard label="유효 측정" value={String(lastValidMeasurementCount)} />
          <SummaryCard label="참조 위치" value={formatPoint(hasScanData ? lastScanResult.referencePosition : null)} />
          <SummaryCard label="추정 위치" value={formatPosition(lastPosition)} />
        </View>

        {lastPosition?.precision === 'limited' ? (
          <FeedbackStateCard
            title="제한 정밀도 모드"
            message={lastPosition.precisionNotes.join(' ')}
            variant="info"
          />
        ) : null}

        <View style={styles.measurementHeader}>
          <Text style={styles.sectionTitle}>AP 측정값</Text>
          <Text style={styles.sectionCaption}>측정값은 map-percent 기준으로 해석됩니다.</Text>
        </View>

        {hasScanData ? (
          <View style={styles.measurementList}>
            {lastScanResult.measurements.map((measurement) => {
              const accessPoint = accessPointById.get(measurement.accessPointId);

              return (
                <View key={measurement.accessPointId} style={styles.measurementRow}>
                  <View style={styles.measurementCopy}>
                    <Text style={styles.measurementTitle}>{accessPoint?.roomName ?? measurement.ssid}</Text>
                    <Text style={styles.measurementSubtitle}>
                      {measurement.ssid} · {measurement.bssid}
                    </Text>
                  </View>
                  <View style={styles.measurementMetrics}>
                    <Text style={styles.measurementMetric}>거리 {measurement.distanceMeters.toFixed(2)}m</Text>
                    <Text style={styles.measurementMetric}>RSSI {measurement.rssiDbm}dBm</Text>
                    <Text style={[styles.measurementMetric, measurement.isValid ? styles.metricValid : styles.metricInvalid]}>
                      {measurement.isValid ? '유효' : '무효'}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <FeedbackStateCard
            title="RTT 스캔 기록이 없습니다."
            message="지도 화면에서 현재 위치 찾기를 실행하면 최근 측정값과 추정 위치를 확인할 수 있습니다."
            variant="empty"
            actionLabel="지도로 이동"
            onAction={() => navigation.navigate('Map')}
            secondaryActionLabel="홈으로"
            onSecondaryAction={() => navigation.navigate('Home')}
          />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
    paddingHorizontal: 16,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },

  homeButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: BG_BLUE_LIGHT,
    borderColor: BORDER_BLUE_LIGHT,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  homeButtonText: {
    color: PRIMARY_BLUE,
    fontSize: 14,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.86,
  },
  headerCopy: {
    flex: 1,
    gap: 4,
  },
  screenTitle: {
    color: TEXT_DARK,
    fontSize: 24,
    fontWeight: '800',
  },
  screenSubtitle: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 19,
  },
  contentBlock: {
    gap: 14,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  summaryCard: {
    backgroundColor: BG_WHITE,
    borderColor: BORDER_LIGHT,
    borderRadius: 20,
    borderWidth: 1,
    flexBasis: '48%',
    flexGrow: 1,
    gap: 4,
    padding: 14,
  },
  summaryLabel: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontWeight: '700',
  },
  summaryValue: {
    color: TEXT_DARK,
    fontSize: 14,
    fontWeight: '800',
  },
  sectionTitle: {
    color: TEXT_DARK,
    fontSize: 16,
    fontWeight: '800',
  },
  sectionCaption: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    lineHeight: 16,
  },
  measurementHeader: {
    gap: 4,
  },
  measurementList: {
    gap: 10,
  },
  measurementRow: {
    backgroundColor: BG_WHITE,
    borderColor: BORDER_LIGHT,
    borderRadius: 20,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  measurementCopy: {
    gap: 4,
  },
  measurementTitle: {
    color: TEXT_DARK,
    fontSize: 14,
    fontWeight: '800',
  },
  measurementSubtitle: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    lineHeight: 16,
  },
  measurementMetrics: {
    gap: 4,
  },
  measurementMetric: {
    color: TEXT_MEDIUM,
    fontSize: 12,
    fontWeight: '700',
  },
  metricValid: {
    color: STATUS_SUCCESS,
  },
  metricInvalid: {
    color: STATUS_ERROR,
  },
});
