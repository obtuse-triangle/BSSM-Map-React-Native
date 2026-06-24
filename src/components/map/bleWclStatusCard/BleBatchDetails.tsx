/**
 * Success batch details for the BLE WCL status card.
 *
 * Renders a block of detail rows (used AP count, confidence, accuracy,
 * latest sample age) and an optional stale-data warning. Only rendered
 * by the parent after a single-shot batch scan completes.
 *
 * Behaviour is preserved verbatim from the inline block that previously
 * lived at lines 228-259 of `BleWclStatusCard.tsx`.
 *
 * Note: detailRow / detailLabel / detailValue are defined locally here
 * even though the parent also carries them (for realtime / DR / fusion
 * sections in todo-3).
 */

import { StyleSheet, Text, View } from 'react-native';
import { TEXT_DARK, TEXT_SECONDARY } from '../../../theme';

import type { BleWclResult } from '../../../services/location/bleWclProvider';

export type BleBatchDetailsProps = {
  result: BleWclResult;
  isStale: boolean;
};

export function BleBatchDetails({ result, isStale }: BleBatchDetailsProps) {
  return (
    <>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>사용 AP</Text>
        <Text style={styles.detailValue}>{result.usedApCount}개</Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>신뢰도</Text>
        <Text style={styles.detailValue}>
          {(result.confidence * 100).toFixed(0)}%
        </Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>정확도</Text>
        <Text style={styles.detailValue}>
          ±{result.accuracyMeters.toFixed(1)}m
        </Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>최신 샘플</Text>
        <Text style={styles.detailValue}>
          {(result.latestSampleAgeMs / 1_000).toFixed(0)}초 전
        </Text>
      </View>
      {isStale ? (
        <Text style={styles.staleWarning}>
          위치 데이터가 오래되었습니다. 새로 스캔해주세요.
        </Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
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
  staleWarning: {
    color: '#d97706',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
});
