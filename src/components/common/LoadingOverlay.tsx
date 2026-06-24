import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'

import { PRIMARY_BLUE } from '../../theme'

interface LoadingOverlayProps {
  visible: boolean
  message?: string
  testID?: string
}

export function LoadingOverlay({
  visible,
  message,
  testID,
}: LoadingOverlayProps): React.JSX.Element | null {
  if (!visible) {
    return null
  }

  return (
    <View testID={testID} style={styles.overlay}>
      <ActivityIndicator size="large" color={PRIMARY_BLUE} />
      {message !== undefined && <Text style={styles.message}>{message}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 999,
  },
  message: {
    marginTop: 12,
    fontSize: 15,
    color: '#ffffff',
    fontWeight: '500',
  },
})
