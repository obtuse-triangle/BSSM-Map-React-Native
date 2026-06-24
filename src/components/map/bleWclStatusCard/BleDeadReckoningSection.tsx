/**
 * Dead-reckoning position display for the BLE WCL status card.
 *
 * Renders the estimated DR coordinates, error margin, confidence bar,
 * and step count. When `drPosition` is null it shows a fallback message
 * indicating that a BLE scan is needed for position correction.
 *
 * The confidence bar uses the signal-strength colour ramp
 * (#16a34a / #ca8a04 / #dc2626) — these are domain-preserve colours,
 * NOT ui-chrome tokens, and match the RSSI indicators in
 * `bleWclFormatters.ts`.
 *
 * Behaviour is preserved verbatim from the inline block that previously
 * lived at lines 220-262 of `BleWclStatusCard.tsx`.
 */

import { StyleSheet, Text, View } from 'react-native';
import { BORDER_DEFAULT, TEXT_DARK, TEXT_SECONDARY } from '../../../theme';

export type BleDeadReckoningSectionProps = {
  drPosition: { lat: number; lng: number; confidence: number } | null;
  drErrorMeters: number;
  drStepsSinceLastBle: number;
};

export function BleDeadReckoningSection({
  drPosition,
  drErrorMeters,
  drStepsSinceLastBle,
}: BleDeadReckoningSectionProps) {
  return (
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
  );
}

const styles = StyleSheet.create({
  drSection: {
    backgroundColor: '#f0fdf4', // preserve — light green, no exact token
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  drTitle: {
    color: TEXT_DARK,
    fontSize: 12,
    fontWeight: '700',
  },
  drPositionText: {
    color: '#334155', // preserve — no exact token (TEXT_MEDIUM #475569 ≠ #334155)
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  drErrorText: {
    color: TEXT_SECONDARY,
    fontSize: 11,
  },
  drConfidenceBar: {
    height: 4,
    borderRadius: 2,
    backgroundColor: BORDER_DEFAULT,
    overflow: 'hidden',
  },
  drConfidenceFill: {
    height: '100%',
    borderRadius: 2,
  },
  drStepsText: {
    color: TEXT_SECONDARY,
    fontSize: 11,
  },
});
