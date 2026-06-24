import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { FloorKey, FloorListItem } from '../../types/floorMap';
import { BG_BLUE_LIGHT, BG_WHITE, BORDER_BLUE_LIGHT, BORDER_LIGHT, PRIMARY_BLUE, TEXT_DARK, TEXT_SECONDARY } from '../../theme';

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

type FloorSelectorProps = {
  floors: FloorListItem[];
  selectedFloorKey: FloorKey | null;
  onSelectFloor: (floorKey: FloorKey) => void;
};

export function FloorSelector({ floors, selectedFloorKey, onSelectFloor }: FloorSelectorProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>층</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {floors.map(({ floorKey, floor }) => {
          const selected = floorKey === selectedFloorKey;

          return (
            <Pressable
              key={floorKey}
              accessibilityRole="button"
              accessibilityLabel={`${floor.label} 선택`}
              hitSlop={HIT_SLOP}
              onPress={() => onSelectFloor(floorKey)}
              style={({ pressed }) => [styles.button, selected && styles.buttonSelected, pressed && styles.buttonPressed]}
            >
              <Text style={[styles.buttonLabel, selected && styles.buttonLabelSelected]}>{floor.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-start',
    alignItems: 'center',
    // one-off: near-white with slight transparency
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderColor: BORDER_LIGHT,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    shadowColor: TEXT_DARK,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  label: {
    color: TEXT_SECONDARY,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  scrollContent: {
    alignItems: 'center',
    gap: 6,
  },
  button: {
    alignItems: 'center',
    backgroundColor: BG_BLUE_LIGHT,
    borderColor: BORDER_BLUE_LIGHT,
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 48,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  buttonSelected: {
    backgroundColor: PRIMARY_BLUE,
    borderColor: PRIMARY_BLUE,
  },
  buttonPressed: {
    opacity: 0.86,
  },
  buttonLabel: {
    color: PRIMARY_BLUE,
    fontSize: 12,
    fontWeight: '800',
  },
  buttonLabelSelected: {
    color: BG_WHITE,
  },
});
