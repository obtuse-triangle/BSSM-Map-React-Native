import { Pressable, StyleSheet, Text } from 'react-native';
import { formatSearchResultLabel } from '../../utils/accessibilityLabels';
import {
  sheetAccent,
  sheetLabel,
  sheetSecondaryLabel,
  sheetSelectionBg,
} from '../../theme/sheetSemanticColors';
import type { CampusFeature } from '../../types/geojson';

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

type Props = {
  results: CampusFeature[];
  selectedFeatureId: string | null;
  scheme: 'light' | 'dark' | null | undefined;
  onSelectResult: (featureId: string) => void;
};

export function SearchResultsList({ results, selectedFeatureId, scheme, onSelectResult }: Props) {
  return (
    <>
      {results.map((feature: CampusFeature) => {
        const featureKey = feature.properties.id ?? String(feature.id);
        const selected = featureKey === selectedFeatureId;
        return (
          <Pressable
            key={featureKey}
            accessibilityRole="button"
            accessibilityLabel={formatSearchResultLabel(feature)}
            accessibilityState={{ selected }}
            hitSlop={HIT_SLOP}
            onPress={() => onSelectResult(featureKey)}
            style={({ pressed }) => [
              styles.searchResultRow,
              selected && styles.searchResultRowSelected,
              pressed && { opacity: 0.88 },
            ]}
          >
            <Text style={[styles.searchResultName, { color: sheetLabel }, selected && { color: sheetAccent(scheme) }]} numberOfLines={1}>
              {feature.properties.name_ko || feature.properties.name}
            </Text>
            <Text style={[styles.searchResultMeta, { color: sheetSecondaryLabel }, selected && { color: sheetAccent(scheme) }]}>
              {selected ? '선택됨' : `${feature.properties.level}층 · ${feature.properties.category}`}
            </Text>
          </Pressable>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  searchResultRow: {
    borderRadius: 14,
    gap: 2,
    marginHorizontal: 2,
    marginBottom: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchResultRowSelected: {
    backgroundColor: sheetSelectionBg,
  },
  searchResultName: {
    fontSize: 15,
    fontWeight: '700',
  },
  searchResultMeta: {
    fontSize: 12,
    fontWeight: '600',
  },
});
