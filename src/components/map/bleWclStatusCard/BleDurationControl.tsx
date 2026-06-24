/**
 * Scan-duration stepper control for the BLE WCL status card.
 *
 * Renders a labelled row with − / value / + buttons to adjust the
 * single-shot BLE scan duration. The parent computes the displayed
 * value (`scanDurationSeconds`) and the disabled states
 * (`canDecrease` / `canIncrease`) and passes callback functions
 * that encapsulate the step logic.
 *
 * Behaviour is preserved verbatim from the inline block that previously
 * lived at lines 276-324 of `BleWclStatusCard.tsx`.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  BG_BLUE_LIGHT,
  BG_NEAR_WHITE,
  BORDER_BLUE_LIGHT,
  BORDER_DEFAULT,
  PRIMARY_BLUE,
  TEXT_DARK,
  TEXT_LIGHT,
  TEXT_SECONDARY,
} from '../../../theme';

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

export type BleDurationControlProps = {
  scanDurationSeconds: number;
  canDecrease: boolean;
  canIncrease: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
};

export function BleDurationControl({
  scanDurationSeconds,
  canDecrease,
  canIncrease,
  onDecrease,
  onIncrease,
}: BleDurationControlProps) {
  return (
    <View style={styles.durationRow}>
      <Text style={styles.detailLabel}>스캔 시간</Text>
      <View style={styles.durationControl}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="스캔 시간 줄이기"
          hitSlop={HIT_SLOP}
          disabled={!canDecrease}
          onPress={onDecrease}
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
          onPress={onIncrease}
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
  );
}

const styles = StyleSheet.create({
  durationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 20,
  },
  durationControl: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  durationButton: {
    alignItems: 'center',
    backgroundColor: BG_BLUE_LIGHT,
    borderColor: BORDER_BLUE_LIGHT,
    borderRadius: 12,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  durationButtonDisabled: {
    backgroundColor: BG_NEAR_WHITE,
    borderColor: BORDER_DEFAULT,
    opacity: 0.5,
  },
  durationButtonPressed: {
    opacity: 0.8,
  },
  durationButtonText: {
    color: PRIMARY_BLUE,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 22,
  },
  durationButtonTextDisabled: {
    color: TEXT_LIGHT,
  },
  durationValue: {
    color: TEXT_DARK,
    fontSize: 15,
    fontWeight: '800',
    minWidth: 36,
    textAlign: 'center',
  },
});
