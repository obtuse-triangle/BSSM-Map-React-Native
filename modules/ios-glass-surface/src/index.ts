import { requireNativeModule } from 'expo-modules-core';

export type GlassVariant = 'floating' | 'control' | 'sheet' | 'search' | 'modal' | 'status';

export interface GlassSurfaceProps {
  variant?: GlassVariant;
  cornerRadius?: number;
  tintColor?: string;
  interactive?: boolean;
  fallbackOpacity?: number;
  reduceTransparencyFallbackColor?: string;
}

const ExpoGlassSurface = requireNativeModule('ExpoGlassSurface');
export { ExpoGlassSurface };
