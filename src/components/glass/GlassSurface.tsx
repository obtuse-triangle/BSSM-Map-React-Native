import React, { type ReactNode } from 'react';
import { Platform, useColorScheme, View, type StyleProp, type ViewStyle } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable, type GlassColorScheme } from 'expo-glass-effect';

export type GlassVariant = 'floating' | 'control' | 'sheet' | 'search' | 'modal' | 'status';

type StableGlassEffectStyle = 'clear' | 'none';
type EffectiveColorScheme = 'light' | 'dark';

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

const FALLBACK_BG: Record<GlassVariant, { light: string; dark: string }> = {
  floating: { light: 'rgba(255,255,255,0.78)', dark: 'rgba(30,30,30,0.78)' },
  control: { light: 'rgba(255,255,255,0.35)', dark: 'rgba(40,40,40,0.35)' },
  sheet: { light: 'rgba(255,255,255,0.88)', dark: 'rgba(35,35,35,0.88)' },
  search: { light: 'rgba(255,255,255,0.90)', dark: 'rgba(25,25,25,0.90)' },
  modal: { light: 'rgba(255,255,255,0.92)', dark: 'rgba(20,20,20,0.92)' },
  status: { light: 'rgba(255,255,255,0.75)', dark: 'rgba(45,45,45,0.75)' },
};

const VARIANT_TINT: Record<GlassVariant, { light: string | undefined; dark: string | undefined }> = {
  floating: { light: 'rgba(255,255,255,0.16)', dark: 'rgba(0,0,0,0.16)' },
  control: { light: 'rgba(255,255,255,0.22)', dark: 'rgba(0,0,0,0.22)' },
  sheet: { light: 'rgba(255,255,255,0.28)', dark: 'rgba(0,0,0,0.28)' },
  search: { light: 'rgba(255,255,255,0.34)', dark: 'rgba(0,0,0,0.34)' },
  modal: { light: 'rgba(255,255,255,0.42)', dark: 'rgba(0,0,0,0.42)' },
  status: { light: 'rgba(255,255,255,0.12)', dark: 'rgba(0,0,0,0.12)' },
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
  const systemColorScheme = useColorScheme();

  const resolvedColorScheme: EffectiveColorScheme =
    colorScheme === 'dark' || colorScheme === 'light'
      ? colorScheme
      : systemColorScheme === 'dark'
        ? 'dark'
        : 'light';

  const resolvedStyle: ViewStyle = {
    borderRadius: cornerRadius,
    overflow: 'hidden',
    alignSelf: 'stretch',
  };

  const isInteractive = interactive ?? VARIANT_INTERACTIVE[variant];
  const resolvedTint = tintColor ?? VARIANT_TINT[variant][resolvedColorScheme];

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
      style={[resolvedStyle, { backgroundColor: FALLBACK_BG[variant][resolvedColorScheme] }, style]}
      pointerEvents={pointerEvents}
    >
      {children}
    </View>
  );
}
