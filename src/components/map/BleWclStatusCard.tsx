import { useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';

import { GlassSurface } from '../glass';
import type { BleWclResult, ArubaBleObservation } from '../../services/location/bleWclProvider';
import type { BeaconStats, BleWclScanStatus } from '../../store/bleLocationStore';
import type { FusionState } from '../../types/fusion';
import { BleActionButtons } from './BleActionButtons';
import { BleBeaconStatsTable } from './BleBeaconStatsTable';
import { BleHeader } from './bleWclStatusCard/BleHeader';
import { BleStopButton } from './bleWclStatusCard/BleStopButton';
import { BleStatusIndicators } from './bleWclStatusCard/BleStatusIndicators';
import { BleBatchDetails } from './bleWclStatusCard/BleBatchDetails';
import { BleErrorBlock } from './bleWclStatusCard/BleErrorBlock';
import { BleDurationControl } from './bleWclStatusCard/BleDurationControl';
import { BleRealtimeSection } from './bleWclStatusCard/BleRealtimeSection';
import { BleDeadReckoningSection } from './bleWclStatusCard/BleDeadReckoningSection';
import { BleFusionSection } from './bleWclStatusCard/BleFusionSection';
import {
  DURATION_STEP_MS,
  MAX_SCAN_DURATION_MS,
  MIN_SCAN_DURATION_MS,
  STATUS_LABELS,
  STALE_THRESHOLD_MS,
  computeStatsFromBatch,
  formatAge,
} from './bleWclFormatters';

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
      <BleHeader
        title="BLE 실시간 모니터링"
        subtitle="foreground-only · iOS 지연 가능"
        statusLabel={STATUS_LABELS[status]}
        isScanning={status === 'scanning'}
        isSuccess={status === 'success'}
        isError={status === 'error'}
        isContinuousScanning={isContinuousScanning}
        isStale={isStale}
      />

      {/* ── Stop button (when continuous) ──────── */}
      {isContinuousScanning ? (
        <BleStopButton onPress={onStopContinuousScan} />
      ) : null}

      {/* ── Scanning / Continuous indicators ────── */}
      {(status === 'scanning' || isContinuousScanning) ? (
        <BleStatusIndicators
          status={status}
          isContinuousScanning={isContinuousScanning}
          detectedBeaconCount={displayBeacons.length}
        />
      ) : null}

      {/* ── Real-time position (continuous) ───────── */}
      {isContinuousScanning && status === 'success' && result !== null ? (
        <BleRealtimeSection
          latitude={result.latitude}
          longitude={result.longitude}
          confidence={result.confidence}
          accuracyMeters={result.accuracyMeters}
          usedApCount={result.usedApCount}
          updateCount={realtimeUpdateCountRef.current}
          ageLabel={formatAge(result.computedAt)}
        />
      ) : null}

      {/* ── Success details (batch) ──────────────── */}
      {status === 'success' && result !== null && !isContinuousScanning ? (
        <BleBatchDetails result={result} isStale={isStale} />
      ) : null}

      {/* ── Error message ──────────────────────── */}
      {status === 'error' && error !== null ? (
        <BleErrorBlock error={error} isInsufficientAps={isInsufficientAps} />
      ) : null}

      {/* ── Scan duration control ──────────────── */}
      <BleDurationControl
        scanDurationSeconds={scanDurationSeconds}
        canDecrease={canDecrease}
        canIncrease={canIncrease}
        onDecrease={() => onSetScanDuration(scanDurationMs - DURATION_STEP_MS)}
        onIncrease={() => onSetScanDuration(scanDurationMs + DURATION_STEP_MS)}
      />

      {/* ── Beacon stats table ─────────────────── */}
      {displayBeacons.length > 0 ? (
        <BleBeaconStatsTable
          displayBeacons={displayBeacons}
          apContributionWeightLookup={apContributionWeightLookup}
        />
      ) : null}

      {/* ── DR position display ─────────────────── */}
      {isMotionActive ? (
        <BleDeadReckoningSection
          drPosition={drPosition}
          drErrorMeters={drErrorMeters}
          drStepsSinceLastBle={drStepsSinceLastBle}
        />
      ) : null}

      {fusionState !== null || fusionUnavailableReason !== null ? (
        <BleFusionSection
          fusionState={fusionState}
          fusionUnavailableReason={fusionUnavailableReason}
        />
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
});
