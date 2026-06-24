import { Text as RNText, type TextProps as RNTextProps, StyleSheet } from 'react-native'

import { FONT_SIZE, TEXT_DARK } from '../../theme'

interface TextProps extends RNTextProps {
  variant?: 'heading' | 'body' | 'caption' | 'label'
  color?: string
  align?: 'auto' | 'left' | 'right' | 'center' | 'justify'
  weight?: 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900'
  children: React.ReactNode
}

export function Text({
  variant = 'body',
  color,
  align,
  weight,
  style,
  children,
  ...rest
}: TextProps): React.JSX.Element {
  return (
    <RNText
      style={[
        styles.base,
        variantStyles[variant],
        align !== undefined && { textAlign: align },
        weight !== undefined && { fontWeight: weight },
        color !== undefined && { color },
        style,
      ]}
      {...rest}
    >
      {children}
    </RNText>
  )
}

const styles = StyleSheet.create({
  base: {
    color: TEXT_DARK,
  },
})

const variantStyles = StyleSheet.create({
  heading: {
    fontSize: FONT_SIZE.display,
    fontWeight: '700',
    lineHeight: 28,
  },
  body: {
    fontSize: FONT_SIZE.md,
    fontWeight: '400',
    lineHeight: 20,
  },
  caption: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '400',
    lineHeight: 16,
  },
  label: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    lineHeight: 18,
  },
})
