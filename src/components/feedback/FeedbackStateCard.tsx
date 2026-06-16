import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

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
      {variant === 'loading' ? <ActivityIndicator color="#1d4ed8" /> : null}
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
    backgroundColor: '#ffffff',
    borderColor: '#d8e2ef',
    borderRadius: 24,
    borderWidth: 1,
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  empty: {
    backgroundColor: '#ffffff',
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
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  message: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  primaryButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: '#1d4ed8',
    borderRadius: 16,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: '#1d4ed8',
    fontSize: 14,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.88,
  },
});
