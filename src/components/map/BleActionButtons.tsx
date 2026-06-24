/**
 * Action row at the bottom of the BLE WCL status card.
 *
 * Composes the four control buttons:
 *   - Start continuous scan  (hidden while already scanning)
 *   - Re-scan (disabled while a single-shot scan is in progress)
 *   - Dismiss  (hidden while continuous scan is active or scan in progress)
 *   - Start / stop motion (Dead Reckoning) tracking
 *
 * Behaviour is preserved verbatim from the inline block that previously
 * lived at the bottom of `BleWclStatusCard.tsx`. Same accessibility labels,
 * hit-slop, disabled rules, and visual style.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { BleWclScanStatus } from '../../store/bleLocationStore';
import {
  BG_BLUE_LIGHT,
  BORDER_BLUE_LIGHT,
  PRIMARY_BLUE,
  STATUS_ERROR,
  STATUS_SUCCESS,
} from '../../theme';

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

export type BleActionButtonsProps = {
  status: BleWclScanStatus;
  isContinuousScanning: boolean;
  onStartContinuousScan: () => void;
  onStopContinuousScan: () => void;
  onStartScan: () => void;
  onDismiss: () => void;
  isMotionActive: boolean;
  onStartMotionTracking: () => void;
  onStopMotionTracking: () => void;
};

export function BleActionButtons({
  status,
  isContinuousScanning,
  onStartContinuousScan,
  onStopContinuousScan,
  onStartScan,
  onDismiss,
  isMotionActive,
  onStartMotionTracking,
  onStopMotionTracking,
}: BleActionButtonsProps) {
  return (
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
  );
}

const styles = StyleSheet.create({
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  startButton: {
    alignItems: 'center',
    backgroundColor: STATUS_SUCCESS,
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
    backgroundColor: PRIMARY_BLUE,
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
  buttonDisabled: {
    opacity: 0.72,
  },
  motionButton: {
    alignItems: 'center',
    borderRadius: 16,
    flex: 1,
    paddingVertical: 13,
  },
  motionStartButton: {
    backgroundColor: STATUS_SUCCESS,
  },
  motionStopButton: {
    backgroundColor: STATUS_ERROR,
  },
  motionButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
});
