export type CampusFeatureCategory =
  | 'classroom'
  | 'corridor'
  | 'elevator'
  | 'facility'
  | 'restroom'
  | 'room'
  | 'stair'
  | 'structural'
  | 'unknown';

export interface CampusFeatureProperties {
  fid: number;
  id: string;
  name: string;
  name_ko: string;
  level: number;
  level_id: string;
  building_id: string;
  category: CampusFeatureCategory;
  interactive: boolean;
  source: string;
}

export type GeoJSONPosition = [number, number] | [number, number, number];

export interface GeoJSONPoint {
  type: 'Point';
  coordinates: GeoJSONPosition;
}

export interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: GeoJSONPosition[][];
}

export interface GeoJSONMultiPolygon {
  type: 'MultiPolygon';
  coordinates: GeoJSONPosition[][][];
}

export type CampusGeometry = GeoJSONPoint | GeoJSONPolygon | GeoJSONMultiPolygon;

export interface CampusFeature {
  type: 'Feature';
  id: string | number;
  geometry: CampusGeometry;
  properties: CampusFeatureProperties;
}

export interface CampusGeoJSON {
  type: 'FeatureCollection';
  features: readonly CampusFeature[];
}
