import { useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassSurface } from '../glass';
import type { BleWclResult, ArubaBleObservation } from '../../services/location/bleWclProvider';
import type { BeaconStats, BleWclScanStatus } from '../../store/bleLocationStore';
import type { FusionState } from '../../types/fusion';
import { BleActionButtons } from './BleActionButtons';
import { BleBeaconStatsTable } from './BleBeaconStatsTable';
import {
  DURATION_STEP_MS,
  MAX_SCAN_DURATION_MS,
  MIN_SCAN_DURATION_MS,
  STATUS_LABELS,
  STALE_THRESHOLD_MS,
  computeStatsFromBatch,
  formatAge,
} from './bleWclFormatters';

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

type BleWclStatusCardProps = {
  colorScheme: 'dark' | 'light';
  status: BleWclScanStatus;
  result: BleWclResult | null;
  error: string | null;
  onStartScan: () => void;
  onDismiss: () => void;
  scanDurationMs: number;
  onSetScanDuration: (ms: number) => void;
  debugObservations: ArubaBleObservation[];

  // Continuous (realtime) scan
  beaconStats: Record<string, BeaconStats>;
  isContinuousScanning: boolean;
  onStartContinuousScan: () => void;
  onStopContinuousScan: () => void;

  // Dead Reckoning
  drPosition: { lat: number; lng: number; confidence: number } | null;
  drStepsSinceLastBle: number;
  isMotionActive: boolean;
  drErrorMeters: number;
  onStartMotionTracking: () => void;
  onStopMotionTracking: () => void;

  fusionState: FusionState | null;
  fusionUnavailableReason: string | null;
};

export function BleWclStatusCard({
  colorScheme,
  status,
  result,
  error,
  onStartScan,
  onDismiss,
  scanDurationMs,
  onSetScanDuration,
  debugObservations,
  beaconStats,
  isContinuousScanning,
  onStartContinuousScan,
  onStopContinuousScan,
  drPosition,
  drStepsSinceLastBle,
  isMotionActive,
  drErrorMeters,
  onStartMotionTracking,
  onStopMotionTracking,
  fusionState,
  fusionUnavailableReason,
}: BleWclStatusCardProps) {
  if (status === 'idle' && !isContinuousScanning) {
    return null;
  }

  const isStale =
    result !== null && result.latestSampleAgeMs > STALE_THRESHOLD_MS;
  const isInsufficientAps =
    status === 'error' && error !== null && error.includes('INSUFFICIENT_APS');
  const scanDurationSeconds = Math.round(scanDurationMs / 1000);
  const canDecrease = scanDurationMs > MIN_SCAN_DURATION_MS;
  const canIncrease = scanDurationMs < MAX_SCAN_DURATION_MS;
  const apContributionWeightLookup = useMemo(() => {
    const lookup = new Map<string, number>();
    for (const contribution of result?.apContributions ?? []) {
      lookup.set(contribution.label.toLowerCase(), contribution.weightPercent);
      lookup.set(contribution.id.toLowerCase(), contribution.weightPercent);
    }
    return lookup;
  }, [result?.apContributions]);

  // ── Unified beacon display list ────────────────────────────────────
  const displayBeacons = useMemo(() => {
    const continuousEntries = Object.values(beaconStats);
    if (continuousEntries.length > 0) {
      return [...continuousEntries].sort((a, b) => b.lastRssi - a.lastRssi);
    }
    if (debugObservations.length > 0) {
      return computeStatsFromBatch(debugObservations);
    }
    return [];
  }, [beaconStats, debugObservations]);

  // ── Real-time update counter ───────────────────────────
  const realtimeUpdateCountRef = useRef(0);
  const lastComputedAtRef = useRef<number | null>(null);
  const isRealtimeActive = isContinuousScanning && status === 'success' && result !== null;
  if (isRealtimeActive) {
    if (lastComputedAtRef.current !== result.computedAt) {
      lastComputedAtRef.current = result.computedAt;
      realtimeUpdateCountRef.current += 1;
    }
  } else if (!isContinuousScanning) {
    lastComputedAtRef.current = null;
    realtimeUpdateCountRef.current = 0;
  }

  return (
    <GlassSurface variant="status" cornerRadius={24} colorScheme={colorScheme} style={styles.card}>
      {/* ── Header ─────────────────────────────── */}
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>BLE 실시간 모니터링</Text>
          <Text style={styles.subtitle}>foreground-only · iOS 지연 가능</Text>
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
              status === 'scanning' && styles.badgeLoading,
              status === 'success' && styles.badgeSuccess,
              status === 'error' && styles.badgeError,
            ]}
          >
            <Text style={styles.badgeText}>{STATUS_LABELS[status]}</Text>
          </View>
        </View>
      </View>

      {/* ── Stop button (when continuous) ──────── */}
      {isContinuousScanning ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="실시간 스캔 중지"
          hitSlop={HIT_SLOP}
          onPress={onStopContinuousScan}
          style={({ pressed }) => [
            styles.stopButton,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.stopButtonText}>■ 중지</Text>
        </Pressable>
      ) : null}

      {/* ── Scanning indicator ──────────────────── */}
      {status === 'scanning' ? (
        <Text style={styles.helper}>BLE 스캔 중... (iOS 지연 가능)</Text>
      ) : null}

      {/* ── Continuous active indicator ─────────── */}
      {isContinuousScanning ? (
        <Text style={styles.helper}>
          실시간 모니터링 중... ({displayBeacons.length}개 비콘 감지)
        </Text>
      ) : null}

      {/* ── Real-time position (continuous) ───────── */}
      {isContinuousScanning && status === 'success' && result !== null ? (
        <View style={styles.realtimeSection}>
          <Text style={styles.realtimeSectionTitle}>실시간 WCL 위치</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>위도</Text>
            <Text style={styles.detailValueMono}>
              {result.latitude.toFixed(6)}°
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>경도</Text>
            <Text style={styles.detailValueMono}>
              {result.longitude.toFixed(6)}°
            </Text>
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
            <Text style={styles.detailLabel}>사용 AP</Text>
            <Text style={styles.detailValue}>{result.usedApCount}개</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>업데이트</Text>
            <Text style={styles.detailValue}>
              {realtimeUpdateCountRef.current}번째 · {formatAge(result.computedAt)}
            </Text>
          </View>
        </View>
      ) : null}

      {/* ── Success details (batch) ──────────────── */}
      {status === 'success' && result !== null && !isContinuousScanning ? (
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
      ) : null}

      {/* ── Error message ──────────────────────── */}
      {status === 'error' && error !== null ? (
        <Text
          style={[
            styles.helper,
            isInsufficientAps && styles.insufficientWarning,
          ]}
          numberOfLines={isInsufficientAps ? 4 : 3}
        >
          {isInsufficientAps
            ? '⚠ 감지된 AP가 2개 미만입니다.\n스캔 시간을 늘리거나 다른 위치에서 시도하세요.'
            : error}
        </Text>
      ) : null}

      {/* ── Scan duration control ──────────────── */}
      <View style={styles.durationRow}>
        <Text style={styles.detailLabel}>스캔 시간</Text>
        <View style={styles.durationControl}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="스캔 시간 줄이기"
            hitSlop={HIT_SLOP}
            disabled={!canDecrease}
            onPress={() => onSetScanDuration(scanDurationMs - DURATION_STEP_MS)}
            style={({ pressed }) => [
              styles.durationButton,
              !canDecrease && styles.durationButtonDisabled,
              pressed && canDecrease && styles.durationButtonPressed,
            ]}
          >
            <Text
              style={[
                styles.durationButtonText,
                !canDecrease && styles.durationButtonTextDisabled,
              ]}
            >
              −
            </Text>
          </Pressable>
          <Text style={styles.durationValue}>{scanDurationSeconds}초</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="스캔 시간 늘리기"
            hitSlop={HIT_SLOP}
            disabled={!canIncrease}
            onPress={() => onSetScanDuration(scanDurationMs + DURATION_STEP_MS)}
            style={({ pressed }) => [
              styles.durationButton,
              !canIncrease && styles.durationButtonDisabled,
              pressed && canIncrease && styles.durationButtonPressed,
            ]}
          >
            <Text
              style={[
                styles.durationButtonText,
                !canIncrease && styles.durationButtonTextDisabled,
              ]}
            >
              +
            </Text>
          </Pressable>
        </View>
      </View>

      {/* ── Beacon stats table ─────────────────── */}
      {displayBeacons.length > 0 ? (
        <BleBeaconStatsTable
          displayBeacons={displayBeacons}
          apContributionWeightLookup={apContributionWeightLookup}
        />
      ) : null}

      {/* ── DR position display ─────────────────── */}
      {isMotionActive ? (
        <View style={styles.drSection}>
          <Text style={styles.drTitle}>DR 위치 추정</Text>

          {drPosition !== null ? (
            <>
              <Text style={styles.drPositionText}>
                ({drPosition.lat.toFixed(6)}, {drPosition.lng.toFixed(6)})
              </Text>
              <Text style={styles.drErrorText}>
                ±{drErrorMeters.toFixed(1)}m
              </Text>

              {/* Confidence bar */}
              <View style={styles.drConfidenceBar}>
                <View
                  style={[
                    styles.drConfidenceFill,
                    {
                      width: `${Math.round(drPosition.confidence * 100)}%` as `${number}%`,
                      backgroundColor:
                        drPosition.confidence >= 0.7
                          ? '#16a34a'
                          : drPosition.confidence >= 0.3
                            ? '#ca8a04'
                            : '#dc2626',
                    },
                  ]}
                />
              </View>

              <Text style={styles.drStepsText}>
                {drStepsSinceLastBle}걸음 (BLE 보정 없음)
              </Text>
            </>
          ) : (
            <Text style={styles.drStepsText}>
              BLE 스캔으로 위치 보정이 필요합니다
            </Text>
          )}
        </View>
      ) : null}

      {fusionState !== null || fusionUnavailableReason !== null ? (
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
      ) : null}

      {/* ── Actions ─────────────────────────────── */}
      <BleActionButtons
        status={status}
        isContinuousScanning={isContinuousScanning}
        onStartContinuousScan={onStartContinuousScan}
        onStopContinuousScan={onStopContinuousScan}
        onStartScan={onStartScan}
        onDismiss={onDismiss}
        isMotionActive={isMotionActive}
        onStartMotionTracking={onStartMotionTracking}
        onStopMotionTracking={onStopMotionTracking}
      />
    </GlassSurface>
  );
}

const PADDING = 18;

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    gap: 12,
    padding: PADDING,
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
    color: '#1d4ed8',
    fontSize: 11,
    fontWeight: '800',
  },
  badgeTextScanning: {
    color: '#16a34a',
  },
  badgeTextStale: {
    color: '#d97706',
  },
  helper: {
    color: '#334155',
    fontSize: 13,
    lineHeight: 19,
  },
  insufficientWarning: {
    color: '#d97706',
    fontWeight: '600',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    color: '#64748b',
    fontSize: 13,
    lineHeight: 20,
  },
  detailValue: {
    color: '#0f172a',
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
  // ── Stop button ─────────────────────────────
  stopButton: {
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    borderColor: '#fecaca',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
  },
  stopButtonText: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '800',
  },
  // ── Duration control ─────────────────────────
  durationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  durationControl: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  durationButton: {
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderRadius: 12,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  durationButtonDisabled: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
    opacity: 0.5,
  },
  durationButtonPressed: {
    opacity: 0.8,
  },
  durationButtonText: {
    color: '#1d4ed8',
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 22,
  },
  durationButtonTextDisabled: {
    color: '#94a3b8',
  },
  durationValue: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '800',
    minWidth: 36,
    textAlign: 'center',
  },
  // ── DR section ──────────────────────────────
  drSection: {
    backgroundColor: '#f0fdf4',
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  fusionSection: {
    backgroundColor: '#eff6ff',
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  drTitle: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '700',
  },
  fusionTitle: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '700',
  },
  drPositionText: {
    color: '#334155',
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  drErrorText: {
    color: '#64748b',
    fontSize: 11,
  },
  drConfidenceBar: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e2e8f0',
    overflow: 'hidden',
  },
  drConfidenceFill: {
    height: '100%',
    borderRadius: 2,
  },
  drStepsText: {
    color: '#64748b',
    fontSize: 11,
  },
  // ── Real-time WCL position ─────────────────────
  realtimeSection: {
    backgroundColor: '#f0fdf4',
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  realtimeSectionTitle: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  detailValueMono: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
    fontFamily: 'monospace',
  },
  // Shared pressed feedback used by the stop button.
  // BleActionButtons owns its own `buttonPressed` style.
  buttonPressed: {
    opacity: 0.88,
  },
});
