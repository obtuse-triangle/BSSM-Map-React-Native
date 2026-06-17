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
  accentColor: string;
}

export function RouteOptionCard({
  option,
  index,
  isSelected,
  onSelect,
  accentColor,
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
          borderColor: isSelected ? accentColor : sheetSeparator,
        },
        pressed && { opacity: 0.88 },
      ]}
    >
      <View style={styles.optionHeaderRow}>
        <Text
          style={[
            styles.optionLabel,
            { color: sheetLabel },
            isSelected && { color: accentColor },
          ]}
        >
          {option.label}
        </Text>
        {badgeText ? (
          <View
            style={[
              styles.warningBadge,
              { backgroundColor: sheetSystemFill },
            ]}
          >
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
            isSelected && { color: accentColor },
          ]}
        >
          {minutes}분
        </Text>
        <Text
          style={[
            styles.optionDistance,
            { color: sheetSecondaryLabel },
            isSelected && { color: accentColor },
          ]}
        >
          {meters}m
        </Text>
      </View>
    </Pressable>
  );
}
