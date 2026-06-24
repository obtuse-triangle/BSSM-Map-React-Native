import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { BG_WHITE, BORDER_LIGHT, FONT_SIZE, PRIMARY_BLUE, SPACING, TEXT_DARK, TEXT_MEDIUM } from '../../theme';

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };
// Button visual height (~40 from paddingVertical + content) + 2 * 8 hitSlop ≈ 56pt
// — comfortably above the theme TOUCH_TARGET_MIN (44). Kept local; matches the
// routePlanStyles pattern of per-file HIT_SLOP rather than a global constant.

type FeedbackStateVariant = 'loading' | 'error' | 'empty' | 'info';

type FeedbackStateCardProps = {
  title: string;
  message: string;
  variant?: FeedbackStateVariant;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
};

const getVariantStyles = (variant: FeedbackStateVariant) => {
  switch (variant) {
    case 'loading':
      return styles.loading;
    case 'error':
      return styles.error;
    case 'info':
      return styles.info;
    default:
      return styles.empty;
  }
};

export function FeedbackStateCard({
  title,
  message,
  variant = 'empty',
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
}: FeedbackStateCardProps) {
  return (
    <View style={[styles.card, getVariantStyles(variant)]}>
      {variant === 'loading' ? <ActivityIndicator color={PRIMARY_BLUE} /> : null}
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>

      {actionLabel && onAction ? (
        <Pressable accessibilityLabel={actionLabel} accessibilityHint="작업을 실행합니다" accessibilityRole="button" hitSlop={HIT_SLOP} onPress={onAction} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
          <Text style={styles.primaryButtonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}

      {secondaryActionLabel && onSecondaryAction ? (
        <Pressable accessibilityLabel={secondaryActionLabel} accessibilityRole="button" hitSlop={HIT_SLOP} onPress={onSecondaryAction} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
          <Text style={styles.secondaryButtonText}>{secondaryActionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: BG_WHITE,
    borderColor: BORDER_LIGHT,
    borderRadius: 24,
    borderWidth: 1,
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: SPACING.xl,
  },
  empty: {
    backgroundColor: BG_WHITE,
  },
  info: {
    backgroundColor: '#f8fbff',
  },
  loading: {
    backgroundColor: '#fffdf5',
  },
  error: {
    backgroundColor: '#fff7f7',
  },
  title: {
    color: TEXT_DARK,
    fontSize: FONT_SIZE.xxl,
    fontWeight: '800',
    textAlign: 'center',
  },
  message: {
    color: TEXT_MEDIUM,
    fontSize: FONT_SIZE.md,
    lineHeight: 19,
    textAlign: 'center',
  },
  primaryButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: PRIMARY_BLUE,
    borderRadius: 16,
    paddingVertical: SPACING.md,
  },
  primaryButtonText: {
    color: BG_WHITE,
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
  },
  secondaryButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: SPACING.md,
  },
  secondaryButtonText: {
    color: PRIMARY_BLUE,
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.88,
  },
});