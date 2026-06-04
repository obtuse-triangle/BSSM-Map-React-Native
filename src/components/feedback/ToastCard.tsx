import { useEffect, useRef } from 'react'
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native'

import { BG_WHITE, PRIMARY_BLUE, STATUS_ERROR, STATUS_SUCCESS, STATUS_WARNING, TEXT_DARK } from '../../theme/colors'
import type { ToastVariant } from '../../hooks/useToast'

type ToastCardProps = {
  visible: boolean
  message?: string
  variant?: ToastVariant
  onDismiss: () => void
}

const VARIANT_BG_TINT: Record<ToastVariant, string> = {
  success: '#f0fdf4',
  error: '#fef2f2',
  warning: '#fffbeb',
  info: '#eff6ff',
}

const VARIANT_BORDER: Record<ToastVariant, string> = {
  success: STATUS_SUCCESS,
  error: STATUS_ERROR,
  warning: STATUS_WARNING,
  info: PRIMARY_BLUE,
}

const VARIANT_ICON: Record<ToastVariant, string> = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
}

export function ToastCard({ visible, message, variant = 'info', onDismiss }: ToastCardProps) {
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start()
  }, [visible, opacity])

  if (!visible && (opacity as unknown as number) === 0) {
    return null
  }

  const bgTint = VARIANT_BG_TINT[variant]
  const borderColor = VARIANT_BORDER[variant]
  const icon = VARIANT_ICON[variant]

  return (
    <Animated.View style={[styles.container, { opacity, backgroundColor: bgTint, borderColor }]}>
      <View style={styles.content}>
        <Text style={[styles.icon, { color: borderColor }]}>{icon}</Text>
        <Text style={styles.message} numberOfLines={2}>
          {message}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="닫기"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        onPress={onDismiss}
        style={({ pressed }) => [styles.dismissButton, pressed && styles.dismissButtonPressed]}
      >
        <Text style={styles.dismissText}>닫기</Text>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    borderColor: STATUS_SUCCESS,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 10,
    position: 'absolute',
    top: 60,
    zIndex: 100,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  icon: {
    fontSize: 15,
    fontWeight: '800',
  },
  message: {
    color: TEXT_DARK,
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  dismissButton: {
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  dismissButtonPressed: {
    opacity: 0.7,
  },
  dismissText: {
    color: TEXT_DARK,
    fontSize: 12,
    fontWeight: '700',
  },
})
