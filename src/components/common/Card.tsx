import { View, type ViewStyle, type StyleProp } from 'react-native'

import { BG_WHITE, BORDER_LIGHT, SPACING } from '../../theme'

interface CardProps {
  children: React.ReactNode
  padding?: 'small' | 'medium' | 'large'
  variant?: 'default' | 'elevated'
  style?: StyleProp<ViewStyle>
  testID?: string
}

export function Card({
  children,
  padding = 'medium',
  variant = 'default',
  style,
  testID,
}: CardProps): React.JSX.Element {
  return (
    <View
      testID={testID}
      style={[
        styles.base,
        paddingStyles[padding],
        variant === 'elevated' && styles.elevated,
        style,
      ]}
    >
      {children}
    </View>
  )
}

const styles = {
  base: {
    backgroundColor: BG_WHITE,
    borderWidth: 1,
    borderColor: BORDER_LIGHT,
    borderRadius: 12,
  },
  elevated: {
    elevation: 3 as const,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
} satisfies Record<string, ViewStyle>

const paddingStyles = {
  small: { padding: SPACING.sm },
  medium: { padding: SPACING.md },
  large: { padding: SPACING.lg },
} satisfies Record<string, ViewStyle>
