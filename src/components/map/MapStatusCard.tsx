import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { IndoorPositionStatus } from '../../types/position';
import type { IndoorPosition } from '../../types/position';
import { formatMapControlLabel, formatToggleLabel } from '../../utils/accessibilityLabels';

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
    <View style={styles.card}>
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
        <Pressable
          accessibilityLabel={formatMapControlLabel('locate')}
          accessibilityState={{ disabled: status === 'loading' || apCount === 0 }}
          accessibilityRole="button"
          hitSlop={HIT_SLOP}
          disabled={status === 'loading' || apCount === 0}
          onPress={onLocateCurrentPosition}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed, (status === 'loading' || apCount === 0) && styles.buttonDisabled]}
        >
          <Text style={styles.primaryButtonText}>{apCount === 0 ? 'AP 없음' : status === 'loading' ? '찾는 중...' : '현재 위치 찾기'}</Text>
        </Pressable>

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
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#d8e2ef',
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
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '800',
  },
  subtitle: {
    color: '#64748b',
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
    color: '#1d4ed8',
    fontSize: 11,
    fontWeight: '800',
  },
  helper: {
    color: '#334155',
    fontSize: 13,
    lineHeight: 19,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#1d4ed8',
    borderRadius: 16,
    flex: 1,
    paddingVertical: 13,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  secondaryButtonText: {
    color: '#1d4ed8',
    fontSize: 14,
    fontWeight: '800',
  },
  buttonPressed: {
    opacity: 0.88,
  },
  buttonDisabled: {
    opacity: 0.72,
  },
});
