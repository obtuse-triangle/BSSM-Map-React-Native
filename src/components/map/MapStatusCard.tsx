import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card } from '../../components/common';
import type { IndoorPositionStatus } from '../../types/position';
import type { IndoorPosition } from '../../types/position';
import { formatToggleLabel } from '../../utils/accessibilityLabels';
import { BG_BLUE_LIGHT, BG_WHITE, BORDER_BLUE_LIGHT, BORDER_LIGHT, PRIMARY_BLUE, TEXT_DARK, TEXT_MEDIUM, TEXT_SECONDARY } from '../../theme';

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

type MapStatusCardProps = {
  apCount: number;
  showApMarkers: boolean;
  status: IndoorPositionStatus;
  position: IndoorPosition | null;
  error: string | null;
  onLocateCurrentPosition: () => void;
  onToggleApMarkers: () => void;
};

const getStatusLabel = (status: IndoorPositionStatus): string => {
  switch (status) {
    case 'loading':
      return '측정 중';
    case 'success':
      return '성공';
    case 'error':
      return '오류';
    default:
      return '대기';
  }
};

export function MapStatusCard({
  apCount,
  showApMarkers,
  status,
  position,
  error,
  onLocateCurrentPosition,
  onToggleApMarkers,
}: MapStatusCardProps) {
  const statusLabel = getStatusLabel(status);
  const locateTitle = apCount === 0 ? 'AP 없음' : status === 'loading' ? '찾는 중...' : '현재 위치 찾기';
  const locateDisabled = status === 'loading' || apCount === 0;
  const helperText =
    apCount === 0
      ? '이 층에는 위치 계산에 사용할 수 있는 AP가 없습니다.'
      : status === 'loading'
        ? '선택한 층의 AP로 RTT 신호를 시뮬레이션하고 있습니다.'
        : status === 'success' && position
          ? `${position.precision === 'limited' ? '제한 정밀도 · ' : ''}x ${position.x.toFixed(1)}% · y ${position.y.toFixed(1)}% · 정확도 ±${position.accuracyMeters.toFixed(1)}m${position.precision === 'limited' ? ' · 층/교실 정밀도 보장 안 됨' : ''}`
          : status === 'error'
            ? error ?? '현재 위치를 찾지 못했습니다.'
            : '현재 층의 AP를 기반으로 위치를 계산합니다.';

  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>현재 위치</Text>
          <Text style={styles.subtitle}>AP {apCount}개 · {showApMarkers ? 'AP 표시 중' : 'AP 숨김'}</Text>
        </View>
        <View style={[styles.badge, status === 'loading' && styles.badgeLoading, status === 'error' && styles.badgeError, status === 'success' && styles.badgeSuccess]}>
          <Text style={styles.badgeText}>{statusLabel}</Text>
        </View>
      </View>

      <Text style={styles.helper}>{helperText}</Text>

      <View style={styles.actionsRow}>
        <Button variant="primary" title={locateTitle} onPress={onLocateCurrentPosition} disabled={locateDisabled} style={{ borderRadius: 16 }} />

        <Pressable
          accessibilityLabel={formatToggleLabel('AP 위치 표시', showApMarkers)}
          accessibilityState={{ selected: showApMarkers }}
          accessibilityRole="button"
          hitSlop={HIT_SLOP}
          onPress={onToggleApMarkers}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
        >
          <Text style={styles.secondaryButtonText}>{showApMarkers ? 'AP 숨기기' : 'AP 표시'}</Text>
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: BG_WHITE,
    borderColor: BORDER_LIGHT,
    borderRadius: 24,
    borderWidth: 1,
    gap: 12,
    padding: 18,
  },
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
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#dbeafe',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
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
  badgeText: {
    color: PRIMARY_BLUE,
    fontSize: 11,
    fontWeight: '800',
  },
  helper: {
    color: TEXT_MEDIUM,
    fontSize: 13,
    lineHeight: 19,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: BG_BLUE_LIGHT,
    borderColor: BORDER_BLUE_LIGHT,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  secondaryButtonText: {
    color: PRIMARY_BLUE,
    fontSize: 14,
    fontWeight: '800',
  },
  buttonPressed: {
    opacity: 0.88,
  },
});
