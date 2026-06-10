import { useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BLE_AP_FIXTURES } from '../../constants/bleAccessPoints';
import { MAX_SAMPLE_AGE_MS } from '../../constants/bleConfig';
import { GlassSurface } from '../glass';
import type { BleWclResult, ArubaBleObservation } from '../../services/location/bleWclProvider';
import type { BleWclScanStatus, BeaconStats } from '../../store/bleLocationStore';

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

type BleWclStatusCardProps = {
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
};

const STATUS_LABELS: Record<BleWclScanStatus, string> = {
  idle: '대기',
  scanning: '스캔 중',
  success: '성공',
  error: '오류',
};

const knownBleIdentifiers = new Set<string>();
for (const ap of BLE_AP_FIXTURES) {
  if (ap.bleIdentifier) knownBleIdentifiers.add(ap.bleIdentifier.toLowerCase());
}

const STALE_THRESHOLD_MS = MAX_SAMPLE_AGE_MS;
const MIN_SCAN_DURATION_MS = 3_000;
const MAX_SCAN_DURATION_MS = 30_000;
const DURATION_STEP_MS = 1_000;

const BLE_AP_LABEL_LOOKUP = new Map(
  BLE_AP_FIXTURES.filter((ap) => ap.bleIdentifier).map((ap) => [
    ap.bleIdentifier.toLowerCase(),
    ap.label,
  ] as const),
);

const BLE_WCL_BLUE = '#2979FF';

function rssiColor(rssi: number): string {
  if (rssi > -60) return '#16a34a';
  if (rssi > -80) return '#ca8a04';
  return '#dc2626';
}

function formatAge(observedAt: number): string {
  const seconds = Math.round((Date.now() - observedAt) / 1000);
  if (seconds < 60) return `${seconds}초 전`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}분 ${seconds % 60}초 전`;
}

function truncateIdentifier(id: string, maxLen = 24): string {
  if (id.length <= maxLen) return id;
  return id.slice(0, maxLen) + '…';
}

/**
 * Compute per-beacon aggregated stats from raw batch observations.
 * Used when continuous stats are unavailable.
 */
function computeStatsFromBatch(
  observations: ArubaBleObservation[],
): BeaconStats[] {
  const grouped = new Map<string, ArubaBleObservation[]>();
  for (const obs of observations) {
    const list = grouped.get(obs.bleIdentifier);
    if (list) {
      list.push(obs);
    } else {
      grouped.set(obs.bleIdentifier, [obs]);
    }
  }

  const result: BeaconStats[] = [];
  for (const [, group] of grouped) {
    group.sort((a, b) => a.observedAt - b.observedAt);

    const rssiValues = group.map((o) => o.rssi);
    const rssiMin = Math.min(...rssiValues);
    const rssiMax = Math.max(...rssiValues);
    const rssiAvg =
      rssiValues.reduce((s, v) => s + v, 0) / rssiValues.length;
    const first = group[0];
    const last = group[group.length - 1];

    let totalInterval = 0;
    for (let i = 1; i < group.length; i++) {
      totalInterval += group[i].observedAt - group[i - 1].observedAt;
    }
    const avgIntervalMs =
      group.length > 1 ? totalInterval / (group.length - 1) : 0;

    result.push({
      bleIdentifier: last.bleIdentifier,
      manufacturerId: last.manufacturerId,
      observations: group.length,
      rssiMin,
      rssiMax,
      rssiAvg,
      firstSeen: first.observedAt,
      lastSeen: last.observedAt,
      avgIntervalMs,
      lastRssi: last.rssi,
    });
  }

  result.sort((a, b) => b.lastRssi - a.lastRssi);
  return result;
}

export function BleWclStatusCard({
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
    <GlassSurface variant="status" cornerRadius={24} style={styles.card}>
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
            ? '⚠ 감지된 AP가 3개 미만입니다.\n스캔 시간을 늘리거나 다른 위치에서 시도하세요.'
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
        <View style={styles.statsSection}>
          <Text style={styles.statsSectionTitle}>
            감지된 비콘: {displayBeacons.length}개
          </Text>

          {/* Table header */}
          <View style={styles.statsHeaderRow}>
            <Text style={[styles.statsHeaderCell, styles.colId]}>비콘 ID</Text>
            <Text style={[styles.statsHeaderCell, styles.colRssi]}>RSSI</Text>
            <Text style={[styles.statsHeaderCell, styles.colSmall]}>평균</Text>
            <Text style={[styles.statsHeaderCell, styles.colSmall]}>최소</Text>
            <Text style={[styles.statsHeaderCell, styles.colSmall]}>최대</Text>
            <Text style={[styles.statsHeaderCell, styles.colInterval]}>
              마지막
            </Text>
          </View>

          {/* Table rows */}
          {displayBeacons.map((beacon) => {
            const normalizedIdentifier = beacon.bleIdentifier.toLowerCase();
            const displayName =
              BLE_AP_LABEL_LOOKUP.get(normalizedIdentifier) ??
              truncateIdentifier(beacon.bleIdentifier, 22);
            const weightPercent =
              apContributionWeightLookup.get(displayName.toLowerCase()) ??
              apContributionWeightLookup.get(normalizedIdentifier) ??
              null;
            const ageSeconds = Math.round((Date.now() - beacon.lastSeen) / 1000);
            const isStale = ageSeconds > STALE_THRESHOLD_MS / 1000;
            const isUnmapped = !knownBleIdentifiers.has(normalizedIdentifier);
            const isDimmed = isStale || isUnmapped;
            const cellStyle = isDimmed
              ? [styles.statsCell, styles.statsCellDimmed]
              : styles.statsCell;

            return (
              <View key={beacon.bleIdentifier} style={styles.statsRow}>
                {weightPercent !== null ? (
                  <View
                    pointerEvents="none"
                    style={[
                      styles.weightBar,
                      {
                        width: `${weightPercent}%` as `${number}%`,
                      },
                    ]}
                  />
                ) : null}
                <Text
                  style={[cellStyle, styles.colId]}
                  numberOfLines={1}
                >
                  {displayName}
                </Text>
                <Text
                  style={[
                    cellStyle,
                    styles.colRssi,
                    { color: rssiColor(beacon.lastRssi) },
                  ]}
                >
                  {beacon.lastRssi}
                </Text>
                <Text style={[cellStyle, styles.colSmall]}>
                  {beacon.rssiAvg.toFixed(0)}
                </Text>
                <Text style={[cellStyle, styles.colSmall]}>
                  {beacon.rssiMin}
                </Text>
                <Text style={[cellStyle, styles.colSmall]}>
                  {beacon.rssiMax}
                </Text>
                <Text style={[cellStyle, styles.colInterval]}>
                  {ageSeconds}초 전
                </Text>
              </View>
            );
          })}
        </View>
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

      {/* ── Actions ─────────────────────────────── */}
      <View style={styles.actionsRow}>
        {!isContinuousScanning ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="실시간 스캔 시작"
            hitSlop={HIT_SLOP}
            onPress={onStartContinuousScan}
            style={({ pressed }) => [
              styles.startButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.startButtonText}>● 스캔 시작</Text>
          </Pressable>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            status === 'scanning' ? 'BLE 스캔 중' : 'BLE 다시 스캔'
          }
          hitSlop={HIT_SLOP}
          disabled={status === 'scanning'}
          onPress={onStartScan}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.buttonPressed,
            status === 'scanning' && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.primaryButtonText}>
            {status === 'scanning' ? '스캔 중...' : 'BLE 다시 스캔'}
          </Text>
        </Pressable>

        {!isContinuousScanning && status !== 'scanning' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="BLE 상태 카드 닫기"
            hitSlop={HIT_SLOP}
            onPress={onDismiss}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.secondaryButtonText}>✕ 닫기</Text>
          </Pressable>
        ) : null}

        {!isMotionActive ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="DR 시작"
            hitSlop={HIT_SLOP}
            onPress={onStartMotionTracking}
            style={({ pressed }) => [
              styles.motionButton,
              styles.motionStartButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.motionButtonText}>DR 시작</Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="DR 중지"
            hitSlop={HIT_SLOP}
            onPress={onStopMotionTracking}
            style={({ pressed }) => [
              styles.motionButton,
              styles.motionStopButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.motionButtonText}>DR 중지</Text>
          </Pressable>
        )}
      </View>
    </GlassSurface>
  );
}

const PADDING = 18;
const COL_GAP = 4;

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
  // ── Beacon stats table ───────────────────────
  statsSection: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  statsSectionTitle: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  statsHeaderRow: {
    flexDirection: 'row',
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    gap: COL_GAP,
  },
  statsHeaderCell: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  statsRow: {
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: COL_GAP,
    position: 'relative',
  },
  statsCell: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'monospace',
    color: '#334155',
  },
  statsCellDimmed: {
    opacity: 0.35,
  },
  colId: {
    flex: 1,
  },
  colRssi: {
    width: 36,
    textAlign: 'right',
    fontWeight: '800',
  },
  colSmall: {
    width: 28,
    textAlign: 'right',
  },
  colInterval: {
    width: 44,
    textAlign: 'right',
  },
  weightBar: {
    backgroundColor: BLE_WCL_BLUE,
    borderRadius: 2,
    bottom: 0,
    left: 0,
    opacity: 0.12,
    position: 'absolute',
    top: 0,
  },
  // ── Actions ──────────────────────────────────
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  startButton: {
    alignItems: 'center',
    backgroundColor: '#16a34a',
    borderRadius: 16,
    flex: 1,
    paddingVertical: 13,
  },
  startButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
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
  // ── DR section ──────────────────────────────
  drSection: {
    backgroundColor: '#f0fdf4',
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  drTitle: {
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
  // ── Motion tracking buttons ─────────────────
  motionButton: {
    alignItems: 'center',
    borderRadius: 16,
    flex: 1,
    paddingVertical: 13,
  },
  motionStartButton: {
    backgroundColor: '#16a34a',
  },
  motionStopButton: {
    backgroundColor: '#dc2626',
  },
  motionButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
});
