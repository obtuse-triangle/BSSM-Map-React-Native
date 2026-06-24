import { Pressable, StyleSheet, Text, type ViewStyle, type StyleProp } from 'react-native'

import {
  BG_WHITE,
  BORDER_DEFAULT,
  BORDER_LIGHT,
  PRIMARY_BLUE,
  PRIMARY_BLUE_LIGHT,
  TEXT_DARK,
  TEXT_LIGHT,
  TEXT_MEDIUM,
  TOUCH_TARGET_MIN,
} from '../../theme'

interface ButtonProps {
  title: string
  onPress: () => void
  variant?: 'primary' | 'secondary' | 'ghost'
  disabled?: boolean
  size?: 'small' | 'medium' | 'large'
  style?: StyleProp<ViewStyle>
  testID?: string
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  size = 'medium',
  style,
  testID,
}: ButtonProps): React.JSX.Element {
  const containerStyle = [
    styles.base,
    variantStyles[variant],
    sizeStyles[size],
    disabled && styles.disabled,
    style,
  ]

  const textStyle = [
    styles.textBase,
    textVariantStyles[variant],
    sizeTextStyles[size],
    disabled && styles.disabledText,
  ]

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={({ pressed }): StyleProp<ViewStyle> => [
        ...containerStyle,
        pressed && { opacity: 0.8 },
      ]}
      onPress={onPress}
    >
      <Text style={textStyle}>{title}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    minHeight: TOUCH_TARGET_MIN,
  },
  disabled: {
    opacity: 0.5,
  },
  disabledText: {
    opacity: 0.7,
  },
  textBase: {
    fontWeight: '600',
  },
})

const variantStyles = StyleSheet.create({
  primary: {
    backgroundColor: PRIMARY_BLUE,
  },
  secondary: {
    backgroundColor: BG_WHITE,
    borderWidth: 1,
    borderColor: BORDER_DEFAULT,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
})

const sizeStyles = StyleSheet.create({
  small: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  medium: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  large: {
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
})

const textVariantStyles = StyleSheet.create({
  primary: {
    color: BG_WHITE,
  },
  secondary: {
    color: TEXT_DARK,
  },
  ghost: {
    color: PRIMARY_BLUE,
  },
})

const sizeTextStyles = StyleSheet.create({
  small: {
    fontSize: 13,
  },
  medium: {
    fontSize: 15,
  },
  large: {
    fontSize: 17,
  },
})
