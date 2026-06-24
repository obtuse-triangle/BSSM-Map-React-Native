import type { LayerSpecification, SourceSpecification } from '@maplibre/maplibre-gl-style-spec';

export const CAMPUS_BOUNDS: [number, number, number, number] = [128.9028, 35.1876, 128.9041, 35.1893];
export const CAMPUS_CENTER: [number, number] = [128.9035, 35.1885];
export const PROGRAMMATIC_CAMERA_SUPPRESSION_MS = 600;

export const BASE_STYLE = {
  version: 8 as const,
  name: 'base',
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {} as Record<string, SourceSpecification>,
  layers: [] as LayerSpecification[],
};
