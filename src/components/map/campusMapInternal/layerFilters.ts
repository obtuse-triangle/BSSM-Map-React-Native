import { type FilterSpecification } from '@maplibre/maplibre-react-native';

export function buildLevelFilter(selectedLevel: number): FilterSpecification {
  return ['==', ['get', 'level'], selectedLevel] as unknown as FilterSpecification;
}

export function buildCategoryFilter(
  levelFilter: FilterSpecification,
  hiddenCategories: Set<string>,
): FilterSpecification {
  if (hiddenCategories.size === 0) {
    return levelFilter;
  }

  const hidden = Array.from(hiddenCategories);
  return ['all', levelFilter, ['!', ['in', ['get', 'category'], ['literal', hidden]]]] as unknown as FilterSpecification;
}

export function buildSelectedFeatureFilter(selectedFeatureId: string | null): FilterSpecification {
  // Features store their id in properties.id, not as a top-level GeoJSON id.
  // Using ['get', 'id'] reads from properties, which is where all 386 campus
  // features store their identifier (e.g. '1-4-7').
  return ['==', ['get', 'id'], selectedFeatureId ?? ''] as unknown as FilterSpecification;
}
