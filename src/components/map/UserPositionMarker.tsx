import { StyleSheet, Text, View } from 'react-native';

import type { LayoutPoint } from '../../utils/coordinate';

type UserPositionMarkerProps = {
  layout: LayoutPoint;
};

export function UserPositionMarker({ layout }: UserPositionMarkerProps) {
  return (
    <View
      pointerEvents="none"
      style={[
        styles.container,
        {
          left: layout.x - 12,
          top: layout.y - 12,
        },
      ]}
    >
      <View style={styles.halo} />
      <View style={styles.core} />
      <View style={styles.labelBubble}>
        <Text style={styles.label}>현재 위치</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
  },
  halo: {
    position: 'absolute',
    backgroundColor: 'rgba(29, 78, 216, 0.18)',
    borderColor: 'rgba(29, 78, 216, 0.42)',
    borderRadius: 24,
    borderWidth: 2,
    height: 24,
    width: 24,
  },
  core: {
    backgroundColor: '#ffffff',
    borderColor: '#1d4ed8',
    borderRadius: 8,
    borderWidth: 6,
    height: 16,
    width: 16,
    shadowColor: '#1d4ed8',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  labelBubble: {
    position: 'absolute',
    top: 26,
    backgroundColor: '#1d4ed8',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  label: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
  },
});
