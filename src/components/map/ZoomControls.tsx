import type { StyleProp, ViewStyle } from 'react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type ZoomControlsProps = {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  style?: StyleProp<ViewStyle>;
};

export function ZoomControls({ onZoomIn, onZoomOut, onReset, style }: ZoomControlsProps) {
  return (
    <View style={[styles.container, style]}>
      <Pressable onPress={onZoomIn} style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
        <Text style={styles.buttonText}>+</Text>
      </Pressable>
      <Pressable onPress={onZoomOut} style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
        <Text style={styles.buttonText}>−</Text>
      </Pressable>
      <Pressable onPress={onReset} style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
        <Text style={styles.resetText}>⌂</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'stretch',
    backgroundColor: '#ffffff',
    borderColor: '#d8e2ef',
    borderRadius: 18,
    borderWidth: 1,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
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
