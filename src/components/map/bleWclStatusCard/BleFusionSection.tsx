/**
 * Fusion state display for the BLE WCL status card.
 *
 * Renders the fusion source, confidence, particle count, accuracy,
 * inferred zone, and any unavailable-reason message. The parent
 * decides whether to render this section via an `||` guard.
 *
 * Behaviour is preserved verbatim from the inline block that previously
 * lived at lines 264-312 of `BleWclStatusCard.tsx`.
 */

import { StyleSheet, Text, View } from 'react-native';
import { BG_BLUE_LIGHT, TEXT_DARK, TEXT_SECONDARY } from '../../../theme';

import type { FusionState } from '../../../types/fusion';

export type BleFusionSectionProps = {
  fusionState: FusionState | null;
  fusionUnavailableReason: string | null;
};

export function BleFusionSection({
  fusionState,
  fusionUnavailableReason,
}: BleFusionSectionProps) {
  return (
    <View style={styles.fusionSection}>
      <Text style={styles.fusionTitle}>융합 상태</Text>

      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>소스</Text>
        <Text style={styles.detailValue}>
          {fusionState?.source ? fusionState.source.toUpperCase() : 'UNAVAILABLE'}
        </Text>
      </View>

      {fusionState !== null ? (
        <>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>신뢰도</Text>
            <Text style={styles.detailValue}>
              {fusionState.confidence.toFixed(2)} ({fusionState.confidenceLevel})
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>파티클 수</Text>
            <Text style={styles.detailValue}>{fusionState.particleCount}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>정확도</Text>
            <Text style={styles.detailValue}>{fusionState.accuracyMeters.toFixed(1)}m</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>추정 영역</Text>
            <Text style={styles.detailValue}>
              {fusionState.inferredZone?.zoneNameKo ?? fusionState.inferredZone?.zoneName ?? '알 수 없음'}
              {' '}
              ({fusionState.inferredZone?.category ?? 'unknown'})
            </Text>
          </View>
        </>
      ) : null}

      {fusionUnavailableReason !== null ? (
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>사용 불가</Text>
          <Text style={styles.detailValue}>{fusionUnavailableReason}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fusionSection: {
    backgroundColor: BG_BLUE_LIGHT,
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  fusionTitle: {
    color: TEXT_DARK,
    fontSize: 12,
    fontWeight: '700',
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
});
