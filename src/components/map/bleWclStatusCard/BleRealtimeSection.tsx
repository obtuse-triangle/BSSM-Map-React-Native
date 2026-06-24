/**
 * Real-time WCL position display for the BLE WCL status card.
 *
 * Renders latitude, longitude, confidence, accuracy, used-AP count,
 * and an update-counter / age row when a continuous (realtime) scan
 * is active.
 *
 * Behaviour is preserved verbatim from the inline block that previously
 * lived at lines 152-191 of `BleWclStatusCard.tsx`.
 */

import { StyleSheet, Text, View } from 'react-native';
import { TEXT_DARK, TEXT_SECONDARY } from '../../../theme';

export type BleRealtimeSectionProps = {
  latitude: number;
  longitude: number;
  confidence: number;
  accuracyMeters: number;
  usedApCount: number;
  updateCount: number;
  ageLabel: string;
};

export function BleRealtimeSection({
  latitude,
  longitude,
  confidence,
  accuracyMeters,
  usedApCount,
  updateCount,
  ageLabel,
}: BleRealtimeSectionProps) {
  return (
    <View style={styles.realtimeSection}>
      <Text style={styles.realtimeSectionTitle}>실시간 WCL 위치</Text>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>위도</Text>
        <Text style={styles.detailValueMono}>
          {latitude.toFixed(6)}°
        </Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>경도</Text>
        <Text style={styles.detailValueMono}>
          {longitude.toFixed(6)}°
        </Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>신뢰도</Text>
        <Text style={styles.detailValue}>
          {(confidence * 100).toFixed(0)}%
        </Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>정확도</Text>
        <Text style={styles.detailValue}>
          ±{accuracyMeters.toFixed(1)}m
        </Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>사용 AP</Text>
        <Text style={styles.detailValue}>{usedApCount}개</Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>업데이트</Text>
        <Text style={styles.detailValue}>
          {updateCount}번째 · {ageLabel}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  realtimeSection: {
    backgroundColor: '#f0fdf4', // preserve — light green, no exact token
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  realtimeSectionTitle: {
    color: TEXT_DARK,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 20,
  },
  detailValue: {
    color: TEXT_DARK,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
    flexShrink: 1,
  },
  detailValueMono: {
    color: TEXT_DARK,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
    fontFamily: 'monospace',
  },
});
