/**
 * Scanning and continuous-active indicator texts for the BLE WCL status card.
 *
 * Renders one or both helper-text lines depending on the current scan mode:
 *   - `status === 'scanning'`       → "BLE 스캔 중... (iOS 지연 가능)"
 *   - `isContinuousScanning === true` → "실시간 모니터링 중... (N개 비콘 감지)"
 *
 * The parent decides whether to render this component (via an `||` guard),
 * but the component internally decides which text(s) to show based on
 * the individual props. This preserves the original behaviour where the
 * two texts were independent and could theoretically both appear.
 *
 * Behaviour is preserved verbatim from the inline block that previously
 * lived at lines 175-185 of `BleWclStatusCard.tsx`.
 */

import { Text } from 'react-native';

import { sharedStyles } from './sharedStyles';

export type BleStatusIndicatorsProps = {
  status: string;
  isContinuousScanning: boolean;
  detectedBeaconCount: number;
};

export function BleStatusIndicators({
  status,
  isContinuousScanning,
  detectedBeaconCount,
}: BleStatusIndicatorsProps) {
  return (
    <>
      {status === 'scanning' ? (
        <Text style={sharedStyles.helper}>
          BLE 스캔 중... (iOS 지연 가능)
        </Text>
      ) : null}

      {isContinuousScanning ? (
        <Text style={sharedStyles.helper}>
          실시간 모니터링 중... ({detectedBeaconCount}개 비콘 감지)
        </Text>
      ) : null}
    </>
  );
}
