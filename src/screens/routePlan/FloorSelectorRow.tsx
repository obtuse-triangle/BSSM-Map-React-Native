import { Pressable, Text, View, useColorScheme } from 'react-native';
import { styles, HIT_SLOP } from './routePlanStyles';
import {
  sheetAccent,
  sheetSecondaryLabel,
} from '../../theme/sheetSemanticColors';

interface FloorSelectorRowProps {
  levels: number[];
  selectedLevel: number;
  onSelectLevel: (level: number) => void;
}

export function FloorSelectorRow({
  levels,
  selectedLevel,
  onSelectLevel,
}: FloorSelectorRowProps) {
  const scheme = useColorScheme();
  return (
    <View style={styles.floorSelectorRow}>
      {levels.map((level) => {
        const selected = level === selectedLevel;
        return (
          <Pressable
            key={level}
            accessibilityRole="button"
            accessibilityLabel={`${level}층 선택`}
            accessibilityState={{ selected }}
            hitSlop={HIT_SLOP}
            onPress={() => onSelectLevel(level)}
            style={[
              styles.floorSelectorButton,
              selected && styles.floorSelectorButtonActive,
            ]}
          >
            <Text
              style={[
                styles.floorSelectorButtonText,
                { color: sheetSecondaryLabel },
                selected && { color: sheetAccent(scheme), fontWeight: '800' },
              ]}
            >
              {level}F
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
