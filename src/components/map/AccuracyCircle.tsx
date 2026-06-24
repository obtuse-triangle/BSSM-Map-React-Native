import { StyleSheet, View } from 'react-native';

import type { LayoutPoint } from '../../utils/coordinate';

type AccuracyCircleProps = {
  layout: LayoutPoint;
  radius: number;
};

export function AccuracyCircle({ layout, radius }: AccuracyCircleProps) {
  if (radius <= 0) {
    return null;
  }

  return (
    <View
      pointerEvents="none"
      style={[
        styles.circle,
        {
          left: layout.x - radius,
          top: layout.y - radius,
          width: radius * 2,
          height: radius * 2,
          borderRadius: radius,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  circle: {
    position: 'absolute',
    // map domain: accuracy circle paint (not UI chrome)
    borderColor: '#2563eb',
    borderWidth: 1.5,
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
  },
});
