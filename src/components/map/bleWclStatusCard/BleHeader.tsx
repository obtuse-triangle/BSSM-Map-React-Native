/**
 * Header row for the BLE WCL status card.
 *
 * Renders the title, subtitle, and a badge group that conditionally
 * shows a "실시간" (realtime) badge, a "STALE" badge, and the
 * current scan-status badge (대기 / 스캔 중 / 성공 / 오류).
 *
 * Behaviour is preserved verbatim from the inline block that previously
 * lived at lines 122-157 of `BleWclStatusCard.tsx`.
 */

import { StyleSheet, Text, View } from 'react-native';
import { PRIMARY_BLUE, STATUS_SUCCESS, TEXT_DARK, TEXT_SECONDARY } from '../../../theme';

export type BleHeaderProps = {
  title: string;
  subtitle: string;
  statusLabel: string;
  isScanning: boolean;
  isSuccess: boolean;
  isError: boolean;
  isContinuousScanning: boolean;
  isStale: boolean;
};

export function BleHeader({
  title,
  subtitle,
  statusLabel,
  isScanning,
  isSuccess,
  isError,
  isContinuousScanning,
  isStale,
}: BleHeaderProps) {
  return (
    <View style={styles.headerRow}>
      <View style={styles.headerCopy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      <View style={styles.badgeGroup}>
        {isContinuousScanning ? (
          <View style={[styles.badge, styles.badgeScanning]}>
            <Text style={[styles.badgeText, styles.badgeTextScanning]}>
              실시간
            </Text>
          </View>
        ) : null}

        {isStale ? (
          <View style={[styles.badge, styles.badgeStale]}>
            <Text style={[styles.badgeText, styles.badgeTextStale]}>
              STALE
            </Text>
          </View>
        ) : null}

        <View
          style={[
            styles.badge,
            isScanning && styles.badgeLoading,
            isSuccess && styles.badgeSuccess,
            isError && styles.badgeError,
          ]}
        >
          <Text style={styles.badgeText}>{statusLabel}</Text>
        </View>
      </View>
    </View>
  );
}

const PADDING = 18;

const styles = StyleSheet.create({
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: TEXT_DARK,
    fontSize: 16,
    fontWeight: '800',
  },
  subtitle: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    lineHeight: 16,
  },
  badgeGroup: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#dbeafe',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeScanning: {
    backgroundColor: '#dcfce7',
  },
  badgeLoading: {
    backgroundColor: '#fef3c7',
  },
  badgeSuccess: {
    backgroundColor: '#dcfce7',
  },
  badgeError: {
    backgroundColor: '#fee2e2',
  },
  badgeStale: {
    backgroundColor: '#fef3c7',
  },
  badgeText: {
    color: PRIMARY_BLUE,
    fontSize: 11,
    fontWeight: '800',
  },
  badgeTextScanning: {
    color: STATUS_SUCCESS,
  },
  badgeTextStale: {
    color: '#d97706',
  },
});
