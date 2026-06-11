import React, { type ReactNode } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable, type GlassColorScheme } from 'expo-glass-effect';

export type GlassVariant = 'floating' | 'control' | 'sheet' | 'search' | 'modal' | 'status';

type StableGlassEffectStyle = 'clear' | 'none';

export interface GlassSurfaceProps {
  variant?: GlassVariant;
  cornerRadius?: number;
  tintColor?: string;
  interactive?: boolean;
  glassEffectStyle?: StableGlassEffectStyle;
  fallbackOpacity?: number;
  reduceTransparencyFallbackColor?: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: 'box-none' | 'none' | 'box-only' | 'auto';
  colorScheme?: GlassColorScheme;
}

const FALLBACK_BG: Record<GlassVariant, string> = {
  floating: 'rgba(255,255,255,0.78)',
  control: 'rgba(255,255,255,0.35)',
  sheet: 'rgba(255,255,255,0.88)',
  search: 'rgba(255,255,255,0.90)',
  modal: 'rgba(255,255,255,0.92)',
  status: 'rgba(255,255,255,0.75)',
};

const VARIANT_TINT: Record<GlassVariant, string | undefined> = {
  floating: 'rgba(255,255,255,0.16)',
  control: 'rgba(255,255,255,0.22)',
  sheet: 'rgba(255,255,255,0.28)',
  search: 'rgba(255,255,255,0.34)',
  modal: 'rgba(255,255,255,0.42)',
  status: 'rgba(255,255,255,0.12)',
};

const VARIANT_INTERACTIVE: Record<GlassVariant, boolean> = {
  floating: false,
  control: true,
  sheet: false,
  search: true,
  modal: false,
  status: false,
};

/**
 * NO-DOUBLE-GLASS RULE: Only wrap the outermost persistent overlay surface.
 * Nested/transient content inside a GlassSurface must NOT be wrapped again.
 */
export function GlassSurface({
  variant = 'floating',
  cornerRadius = 16,
  tintColor,
  interactive,
  glassEffectStyle = 'clear',
  children,
  style,
  pointerEvents = 'box-none',
  colorScheme = 'light',
}: GlassSurfaceProps) {
  const resolvedStyle: ViewStyle = {
    borderRadius: cornerRadius,
    overflow: 'hidden',
    alignSelf: 'stretch',
  };

  const isInteractive = interactive ?? VARIANT_INTERACTIVE[variant];
  const resolvedTint = tintColor ?? VARIANT_TINT[variant];

  if (Platform.OS === 'ios' && isGlassEffectAPIAvailable()) {
    return (
      <GlassView
        glassEffectStyle={glassEffectStyle}
        isInteractive={isInteractive}
        tintColor={resolvedTint}
        colorScheme={colorScheme}
        style={[resolvedStyle, style] as StyleProp<ViewStyle>}
        pointerEvents={pointerEvents}
      >
        {children}
      </GlassView>
    );
  }

  return (
    <View
      style={[resolvedStyle, { backgroundColor: FALLBACK_BG[variant] }, style]}
      pointerEvents={pointerEvents}
    >
      {children}
    </View>
  );
}
