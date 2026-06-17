import { Pressable, Text, View } from 'react-native';
import type { CampusFeature } from '../../types/geojson';
import { styles, HIT_SLOP } from './routePlanStyles';
import {
  sheetLabel,
  sheetSecondaryLabel,
  sheetSeparator,
} from '../../theme/sheetSemanticColors';
import { formatSearchResultLabel } from '../../utils/accessibilityLabels';

export function SearchResultList({
  results,
  onSelect,
}: {
  results: CampusFeature[];
  onSelect: (featureId: string) => void;
}) {
  return (
    <View style={styles.resultsContainer}>
      {results.map((feature: CampusFeature) => {
        const featureKey = feature.properties.id ?? String(feature.id);
        return (
          <Pressable
            key={featureKey}
            accessibilityRole="button"
            accessibilityLabel={formatSearchResultLabel(feature)}
            hitSlop={HIT_SLOP}
            onPress={() => onSelect(featureKey)}
            style={({ pressed }) => [
              styles.searchResultRow,
              { borderColor: sheetSeparator },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text
              style={[styles.searchResultName, { color: sheetLabel }]}
              numberOfLines={1}
            >
              {feature.properties.name_ko || feature.properties.name}
            </Text>
            <Text style={[styles.searchResultMeta, { color: sheetSecondaryLabel }]}>
              {`${feature.properties.level}층 · ${feature.properties.category}`}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
