import React, { type ReactNode } from 'react';
import { Platform, View, type ViewProps, type ViewStyle } from 'react-native';
import { requireNativeView } from 'expo-modules-core';
import type { GlassVariant } from '../../../modules/ios-glass-surface/src';

declare module 'expo-modules-core' {
  export function requireNativeView<P = object>(viewName: string): React.ComponentType<P>;
}

export type { GlassVariant } from '../../../modules/ios-glass-surface/src';

type NativeGlassSurfaceViewProps = ViewProps & {
  variant?: string;
  cornerRadius?: number;
  tintColor?: string;
  interactive?: boolean;
  fallbackOpacity?: number;
  reduceTransparencyFallbackColor?: string;
  children?: ReactNode;
};

export interface GlassSurfaceProps extends ViewProps {
  variant?: GlassVariant;
  cornerRadius?: number;
  tintColor?: string;
  interactive?: boolean;
  fallbackOpacity?: number;
  reduceTransparencyFallbackColor?: string;
  children?: ReactNode;
}

const NativeGlassView =
  Platform.OS === 'ios'
    ? requireNativeView<NativeGlassSurfaceViewProps>('ExpoGlassSurface')
    : null;

const FALLBACK_BG: Record<GlassVariant, string> = {
  floating: 'rgba(255,255,255,0.78)',
  control: 'rgba(255,255,255,0.82)',
  sheet: 'rgba(255,255,255,0.88)',
  search: 'rgba(255,255,255,0.90)',
  modal: 'rgba(255,255,255,0.92)',
  status: 'rgba(255,255,255,0.75)',
};

/**
 * GlassSurface — native iOS Liquid Glass wrapper with cross-platform fallback.
 *
 * NO-DOUBLE-GLASS RULE: Only wrap the outermost persistent overlay surface.
 * Nested/transient content inside a GlassSurface must NOT be wrapped again.
 * Use plain View for inner content to prevent glass-on-glass stacking.
 */
export function GlassSurface({
  variant = 'floating',
  cornerRadius = 16,
  tintColor,
  interactive = false,
  fallbackOpacity = 0.85,
  reduceTransparencyFallbackColor = 'rgba(255,255,255,0.85)',
  children,
  style,
  pointerEvents = 'box-none',
  ...rest
}: GlassSurfaceProps) {
  const resolvedStyle: ViewStyle = {
    borderRadius: cornerRadius,
    overflow: 'hidden',
  };

  if (Platform.OS === 'ios' && NativeGlassView) {
    return (
      <NativeGlassView
        variant={variant}
        cornerRadius={cornerRadius}
        tintColor={tintColor}
        interactive={interactive}
        fallbackOpacity={fallbackOpacity}
        reduceTransparencyFallbackColor={reduceTransparencyFallbackColor}
        style={[resolvedStyle, style] as any}
        pointerEvents={pointerEvents}
        {...rest}
      >
        {children}
      </NativeGlassView>
    );
  }

  return (
    <View
      style={[resolvedStyle, { backgroundColor: FALLBACK_BG[variant] }, style]}
      pointerEvents={pointerEvents}
      {...rest}
    >
      {children}
    </View>
  );
}
