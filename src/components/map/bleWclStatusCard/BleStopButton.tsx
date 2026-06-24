/**
 * Stop-continuous-scan button for the BLE WCL status card.
 *
 * Renders a red-tinted pressable that calls `onPress` to stop the
 * ongoing realtime BLE scan. Only rendered by the parent when
 * `isContinuousScanning` is true.
 *
 * Behaviour is preserved verbatim from the inline block that previously
 * lived at lines 159-173 of `BleWclStatusCard.tsx`.
 */

import { Pressable, StyleSheet, Text } from 'react-native';
import { STATUS_ERROR } from '../../../theme';

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

export type BleStopButtonProps = {
  onPress: () => void;
};

export function BleStopButton({ onPress }: BleStopButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="실시간 스캔 중지"
      hitSlop={HIT_SLOP}
      onPress={onPress}
      style={({ pressed }) => [
        styles.stopButton,
        pressed && styles.buttonPressed,
      ]}
    >
      <Text style={styles.stopButtonText}>■ 중지</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stopButton: {
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    borderColor: '#fecaca',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
  },
  stopButtonText: {
    color: STATUS_ERROR,
    fontSize: 14,
    fontWeight: '800',
  },
  buttonPressed: {
    opacity: 0.88,
  },
});
