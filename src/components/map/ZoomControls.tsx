import type { StyleProp, ViewStyle } from 'react-native';
import { Pressable, StyleSheet, Text } from 'react-native';
import { GlassSurface } from '../glass';
import { formatMapControlLabel } from '../../utils/accessibilityLabels';

type ZoomControlsProps = {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  colorScheme?: 'dark' | 'light';
  style?: StyleProp<ViewStyle>;
};

export function ZoomControls({ onZoomIn, onZoomOut, onReset, colorScheme = 'light', style }: ZoomControlsProps) {
  return (
    <GlassSurface variant="control" cornerRadius={18} colorScheme={colorScheme} pointerEvents="box-none" style={[styles.container, style]}>
      <Pressable
        accessibilityLabel={formatMapControlLabel('zoomIn')}
        accessibilityRole="button"
        onPress={onZoomIn}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      >
        <Text style={styles.buttonText}>+</Text>
      </Pressable>
      <Pressable
        accessibilityLabel={formatMapControlLabel('zoomOut')}
        accessibilityRole="button"
        onPress={onZoomOut}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      >
        <Text style={styles.buttonText}>−</Text>
      </Pressable>
      <Pressable
        accessibilityLabel={formatMapControlLabel('reset')}
        accessibilityRole="button"
        onPress={onReset}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      >
        <Text style={styles.resetText}>⌂</Text>
      </Pressable>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'stretch',
    borderRadius: 18,
    overflow: 'hidden',
    position: 'absolute',
    right: 16,
    top: 16,
    width: 48,
  },
  button: {
    alignItems: 'center',
    borderBottomColor: '#d8e2ef',
    borderBottomWidth: 1,
    height: 46,
    justifyContent: 'center',
  },
  buttonPressed: {
    backgroundColor: '#eff6ff',
  },
  buttonText: {
    color: '#0f172a',
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 24,
  },
  resetText: {
    color: '#0f172a',
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 20,
  },
});
