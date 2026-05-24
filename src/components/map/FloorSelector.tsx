import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { FloorKey, FloorListItem } from '../../types/floorMap';

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
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderColor: '#d8e2ef',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  label: {
    color: '#64748b',
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
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 48,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  buttonSelected: {
    backgroundColor: '#1d4ed8',
    borderColor: '#1d4ed8',
  },
  buttonPressed: {
    opacity: 0.86,
  },
  buttonLabel: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '800',
  },
  buttonLabelSelected: {
    color: '#ffffff',
  },
});
