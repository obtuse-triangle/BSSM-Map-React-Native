import type { CampusFeatureCategory } from './geojson';

/** Hex color string for saved place markers. */
export type SavedPlaceColor =
  | '#2979FF'
  | '#00A676'
  | '#FFB300'
  | '#E53935'
  | '#8E24AA'
  | '#00ACC1'
  | '#6D4C41'
  | '#546E7A';

/** Readonly tuple of all available palette colors. */
export const SAVED_PLACE_COLOR_PALETTE: readonly SavedPlaceColor[] = [
  '#2979FF',
  '#00A676',
  '#FFB300',
  '#E53935',
  '#8E24AA',
  '#00ACC1',
  '#6D4C41',
  '#546E7A',
] as const;

/** Default color used for custom pins when none is specified. */
export const DEFAULT_CUSTOM_PIN_COLOR: SavedPlaceColor = '#2979FF';

/** AsyncStorage key for the persisted saved places. */
export const SAVED_PLACES_STORAGE_KEY = '@school-map/saved-places';

/** Schema version for persisted data migration. */
export const SAVED_PLACES_SCHEMA_VERSION = 1;

/** A campus feature that has been saved/bookmarked. */
export interface SavedCampusPlace {
  id: string;
  type: 'campus';
  featureId: string;
  name: string;
  nameKo: string;
  category: CampusFeatureCategory;
  level: number;
  coordinates: [number, number];
  color: SavedPlaceColor;
  createdAt: string;
}

/** A user-created custom pin. */
export interface SavedCustomPin {
  id: string;
  type: 'custom';
  name: string;
  coordinates: [number, number];
  color: SavedPlaceColor;
  createdAt: string;
}

/** Discriminated union of all saved place types. */
export type SavedPlace = SavedCampusPlace | SavedCustomPin;
