import { StyleSheet, Text, View } from 'react-native';

import type { AccessPoint } from '../../types/accessPoint';
import type { LayoutPoint } from '../../utils/coordinate';

type ApMarkerProps = {
  accessPoint: AccessPoint;
  layout: LayoutPoint;
};

export function ApMarker({ accessPoint, layout }: ApMarkerProps) {
  return (
    <View
      pointerEvents="none"
      style={[
        styles.container,
        {
          left: layout.x - 44,
          top: layout.y - 10,
        },
      ]}
    >
      <View style={styles.dot}>
        <Text style={styles.label}>AP</Text>
      </View>
      <Text numberOfLines={1} style={styles.caption}>
        {accessPoint.roomName}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignItems: 'center',
    width: 88,
  },
  dot: {
    alignItems: 'center',
    backgroundColor: '#1d4ed8',
    borderColor: '#ffffff',
    borderRadius: 999,
    borderWidth: 2,
    height: 20,
    justifyContent: 'center',
    width: 20,
    shadowColor: '#1d4ed8',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  label: {
    color: '#ffffff',
    fontSize: 7,
    fontWeight: '800',
  },
  caption: {
    color: '#1d4ed8',
    fontSize: 8,
    fontWeight: '700',
    marginTop: 2,
    maxWidth: 88,
    textAlign: 'center',
  },
});
