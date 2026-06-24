/**
 * Error message block for the BLE WCL status card.
 *
 * Renders the scan error text with special formatting when the error
 * indicates insufficient APs (fewer than 2 detected). The parent
 * decides whether to render this component (when status === 'error').
 *
 * Behaviour is preserved verbatim from the inline block that previously
 * lived at lines 261-274 of `BleWclStatusCard.tsx`.
 */

import { Text } from 'react-native';

import { sharedStyles } from './sharedStyles';

export type BleErrorBlockProps = {
  error: string;
  isInsufficientAps: boolean;
};

export function BleErrorBlock({ error, isInsufficientAps }: BleErrorBlockProps) {
  return (
    <Text
      style={[
        sharedStyles.helper,
        isInsufficientAps && sharedStyles.insufficientWarning,
      ]}
      numberOfLines={isInsufficientAps ? 4 : 3}
    >
      {isInsufficientAps
        ? '⚠ 감지된 AP가 2개 미만입니다.\n스캔 시간을 늘리거나 다른 위치에서 시도하세요.'
        : error}
    </Text>
  );
}
