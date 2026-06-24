/**
 * Per-beacon aggregated statistics table for the BLE WCL status card.
 *
 * Pure presentational subcomponent. Renders the six-column layout
 * (ID, RSSI, avg, min, max, last-seen age) using the same column widths,
 * dimmed-state rules, and AP-weight background bar that the inline
 * version had inside `BleWclStatusCard.tsx` prior to Task 8.
 *
 * Data shape:
 *   - `displayBeacons` — sorted list of `BeaconStats` (either continuous
 *     aggregated stats or the batch fallback). Caller decides which.
 *   - `apContributionWeightLookup` — keyed by lowercase AP label or
 *     lowercase `bleIdentifier`, value is `weightPercent` from
 *     `BleWclResult.apContributions`. Used to draw the soft blue
 *     background bar on rows that contributed to the WCL centroid.
 */

import { StyleSheet, Text, View } from 'react-native';

import type { BeaconStats } from '../../store/bleLocationStore';
import { BG_NEAR_WHITE, BORDER_DEFAULT, TEXT_DARK, TEXT_LIGHT } from '../../theme';
import {
  BLE_AP_LABEL_LOOKUP,
  STALE_THRESHOLD_MS,
  knownBleIdentifiers,
  rssiColor,
  truncateIdentifier,
} from './bleWclFormatters';

const COL_GAP = 4;
const BLE_WCL_BLUE = '#2979FF';

export type BleBeaconStatsTableProps = {
  displayBeacons: BeaconStats[];
  apContributionWeightLookup: Map<string, number>;
};

export function BleBeaconStatsTable({
  displayBeacons,
  apContributionWeightLookup,
}: BleBeaconStatsTableProps) {
  return (
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
  );
}

const styles = StyleSheet.create({
  statsSection: {
    backgroundColor: BG_NEAR_WHITE,
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  statsSectionTitle: {
    color: TEXT_DARK,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  statsHeaderRow: {
    flexDirection: 'row',
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_DEFAULT,
    gap: COL_GAP,
  },
  statsHeaderCell: {
    color: TEXT_LIGHT,
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
    color: '#334155', // preserve — no exact token (TEXT_MEDIUM #475569 ≠ #334155)
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
});
