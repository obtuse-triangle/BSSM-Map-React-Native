/**
 * Pure helpers for the BLE WCL status card.
 *
 * Pure means: no React, no hooks, no side effects beyond module-load-time
 * constant materialisation.
 *
 * Exports are grouped:
 *   - Status label / threshold / duration constants
 *   - Lookup tables derived from `BLE_AP_FIXTURES`
 *   - Formatting helpers (RSSI colour, age label, identifier truncation)
 *   - Batch → per-beacon stats aggregator (fallback path when the
 *     continuous-scan buffer is unavailable)
 *
 * These were extracted verbatim from `BleWclStatusCard.tsx` as part of
 * Task 8 to keep the main card file under the 800-line ceiling. Rendering
 * logic (subcomponents) lives in sibling files in the same folder.
 */

import { BLE_AP_FIXTURES } from '../../constants/bleAccessPoints';
import { MAX_SAMPLE_AGE_MS } from '../../constants/bleConfig';
import type { ArubaBleObservation } from '../../services/location/bleWclProvider';
import type { BeaconStats, BleWclScanStatus } from '../../store/bleLocationStore';

/** Korean label per scan status — rendered inside the header badge. */
export const STATUS_LABELS: Record<BleWclScanStatus, string> = {
  idle: '대기',
  scanning: '스캔 중',
  success: '성공',
  error: '오류',
};

/**
 * Set of lowercase BLE identifiers that map to a known AP fixture.
 * Used by the beacon stats table to dim rows that don't correspond to
 * any configured AP (i.e. stray peripherals from the scan window).
 */
export const knownBleIdentifiers = new Set<string>();
for (const ap of BLE_AP_FIXTURES) {
  if (ap.bleIdentifier) knownBleIdentifiers.add(ap.bleIdentifier.toLowerCase());
}

/**
 * Lowercase BLE identifier → human-readable AP label.
 * Drives the "비콘 ID" column in the stats table.
 */
export const BLE_AP_LABEL_LOOKUP = new Map(
  BLE_AP_FIXTURES.filter((ap) => ap.bleIdentifier).map((ap) => [
    ap.bleIdentifier.toLowerCase(),
    ap.label,
  ] as const),
);

/** Latest-sample age (ms) beyond which a result is flagged STALE. */
export const STALE_THRESHOLD_MS = MAX_SAMPLE_AGE_MS;

/** Scan-duration control bounds — used by the ± stepper. */
export const MIN_SCAN_DURATION_MS = 3_000;
export const MAX_SCAN_DURATION_MS = 30_000;
export const DURATION_STEP_MS = 1_000;

/**
 * Colour ramp for the RSSI cell in the beacon stats table.
 *   > -60 dBm  : strong (green)
 *   > -80 dBm  : fair  (amber)
 *   otherwise  : weak  (red)
 */
export function rssiColor(rssi: number): string {
  if (rssi > -60) return '#16a34a';
  if (rssi > -80) return '#ca8a04';
  return '#dc2626';
}

/**
 * "X초 전" / "Y분 Z초 전" label for a wall-clock timestamp.
 * Used by the realtime section's "업데이트" row.
 */
export function formatAge(observedAt: number): string {
  const seconds = Math.round((Date.now() - observedAt) / 1000);
  if (seconds < 60) return `${seconds}초 전`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}분 ${seconds % 60}초 전`;
}

/** Truncate a long BLE peripheral identifier with an ellipsis. */
export function truncateIdentifier(id: string, maxLen = 24): string {
  if (id.length <= maxLen) return id;
  return id.slice(0, maxLen) + '…';
}

/**
 * Compute per-beacon aggregated stats from raw batch observations.
 * Used when continuous stats are unavailable.
 */
export function computeStatsFromBatch(
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
