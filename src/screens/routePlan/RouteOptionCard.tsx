import { Pressable, Text, View } from 'react-native';
import type { RouteOption } from '../../types/routing';
import { styles, HIT_SLOP } from './routePlanStyles';
import {
  sheetLabel,
  sheetSecondaryLabel,
  sheetSecondarySystemFill,
  sheetSelectionBg,
  sheetSeparator,
  sheetSystemFill,
  sheetTertiaryLabel,
} from '../../theme/sheetSemanticColors';
import {
  formatRouteSummary,
  getRouteBadgeText,
} from '../../utils/accessibilityLabels';

interface RouteOptionCardProps {
  option: RouteOption;
  index: number;
  isSelected: boolean;
  onSelect: (index: number) => void;
  swatchColor: string;
}

export function RouteOptionCard({
  option,
  index,
  isSelected,
  onSelect,
  swatchColor,
}: RouteOptionCardProps) {
  if (!option.result.ok) {
    return (
      <View
        style={[
          styles.optionCard,
          { backgroundColor: sheetSecondarySystemFill, borderColor: sheetSeparator },
        ]}
      >
        <Text style={[styles.optionLabel, { color: sheetLabel }]}>
          {option.label}
        </Text>
        <Text style={[styles.optionErrorText, { color: sheetTertiaryLabel }]}>
          경로를 찾을 수 없습니다
        </Text>
      </View>
    );
  }

  const minutes = Math.round(option.result.estimatedTimeSeconds / 60);
  const meters = Math.round(option.result.totalDistanceMeters);
  const badgeText = getRouteBadgeText(option.result);
  const stats = option.result.connectorStats;
  const connectorsParts: string[] = [];
  if (stats) {
    if (stats.elevatorRideCount > 0) {
      connectorsParts.push(`엘리베이터 ${stats.elevatorRideCount}회`);
    }
    const totalStairs = stats.stairAscentFloors + stats.stairDescentFloors;
    if (totalStairs > 0) {
      connectorsParts.push(`계단 ${totalStairs}층`);
    }
  }
  const effortScore = option.result.effortScore;
  const effortLabel =
    effortScore === undefined
      ? null
      : effortScore < 1.5
        ? '낮은 노력'
        : effortScore < 3
          ? '보통 노력'
          : '높은 노력';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${option.label}, ${formatRouteSummary(option.result)}`}
      accessibilityState={{ selected: isSelected }}
      hitSlop={HIT_SLOP}
      onPress={() => onSelect(index)}
      style={({ pressed }) => [
        styles.optionCard,
        {
          backgroundColor: isSelected ? sheetSelectionBg : sheetSecondarySystemFill,
          borderColor: isSelected ? swatchColor : sheetSeparator,
        },
        pressed && { opacity: 0.88 },
      ]}
    >
      <View style={styles.optionHeaderRow}>
        <View style={styles.optionLabelGroup}>
          <View style={[styles.routeSwatch, { backgroundColor: swatchColor }]} />
          <Text
            style={[
              styles.optionLabel,
              { color: sheetLabel },
              isSelected && { color: swatchColor },
            ]}
          >
            {option.label}
          </Text>
        </View>
        {badgeText ? (
          <View style={[styles.warningBadge, { backgroundColor: sheetSystemFill }]}>
            <Text style={[styles.warningBadgeText, { color: sheetSecondaryLabel }]}>
              {badgeText}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.optionMetricsRow}>
        <Text
          style={[
            styles.optionTime,
            { color: sheetLabel },
            isSelected && { color: swatchColor },
          ]}
        >
          {minutes}분
        </Text>
        <Text
          style={[
            styles.optionDistance,
            { color: sheetSecondaryLabel },
            isSelected && { color: swatchColor },
          ]}
        >
          {meters}m
        </Text>
      </View>
      {(effortLabel || connectorsParts.length > 0) && (
        <View style={styles.tradeoffRow}>
          {effortLabel && (
            <Text style={[styles.tradeoffText, { color: sheetTertiaryLabel }]}>
              {effortLabel}
            </Text>
          )}
          {connectorsParts.map((part) => (
            <Text key={part} style={[styles.tradeoffText, { color: sheetTertiaryLabel }]}>
              {part}
            </Text>
          ))}
        </View>
      )}
    </Pressable>
  );
}
