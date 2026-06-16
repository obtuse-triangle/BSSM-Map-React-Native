import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { FloorElement } from '../../types/floorMap';
import type { LayoutRect } from '../../utils/coordinate';
import { formatRoomA11yLabel } from '../../utils/accessibilityLabels';

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

type RoomBlockProps = {
  element: FloorElement;
  floorKey?: string | number | null;
  layout: LayoutRect;
  selected: boolean;
  onPress: (element: FloorElement) => void;
};

export function RoomBlock({ element, floorKey, layout, selected, onPress }: RoomBlockProps) {
  const label = element.name.trim();
  const interactive = element.interactive === true;
  const labelStyle = [styles.label, selected && styles.labelSelected];
  const blockStyle = [
    styles.block,
    {
      left: layout.x,
      top: layout.y,
      width: layout.width,
      height: layout.height,
    },
    interactive ? styles.interactive : styles.static,
    selected && styles.selected,
  ];

  if (!interactive) {
    return (
      <View style={blockStyle}>
        {label ? (
          <Text adjustsFontSizeToFit ellipsizeMode="clip" minimumFontScale={0.72} numberOfLines={1} style={labelStyle}>
            {label}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityLabel={formatRoomA11yLabel(element, floorKey)}
      accessibilityState={{ selected }}
      accessibilityRole="button"
      hitSlop={HIT_SLOP}
      onPress={() => onPress(element)}
      style={({ pressed }) => [...blockStyle, pressed && styles.pressed]}
    >
      {label ? (
        <Text adjustsFontSizeToFit ellipsizeMode="clip" minimumFontScale={0.72} numberOfLines={1} style={labelStyle}>
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  block: {
    position: 'absolute',
    borderRadius: 2,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 2,
    paddingVertical: 1,
  },
  interactive: {
    backgroundColor: '#dbeafe',
    borderColor: '#60a5fa',
    borderWidth: 1,
  },
  static: {
    backgroundColor: '#e2e8f0',
    borderColor: '#cbd5e1',
    borderWidth: 1,
  },
  selected: {
    backgroundColor: '#1d4ed8',
    borderColor: '#1d4ed8',
  },
  pressed: {
    opacity: 0.88,
  },
  label: {
    color: '#0f172a',
    fontSize: 11,
    fontWeight: '700',
    includeFontPadding: false,
    lineHeight: 12,
    textAlignVertical: 'center',
    textAlign: 'center',
  },
  labelSelected: {
    color: '#ffffff',
  },
});
