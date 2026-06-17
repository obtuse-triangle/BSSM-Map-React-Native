import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  CATEGORY_LABELS,
  formatSavedPlaceLabel,
  formatSavedPlaceSubtitle,
} from '../../utils/accessibilityLabels';
import {
  sheetLabel,
  sheetSecondaryLabel,
  sheetSeparator,
  sheetSystemFill,
} from '../../theme/sheetSemanticColors';
import type { SavedPlace } from '../../types/savedPlaces';
import type { CampusFeatureCategory } from '../../store/mapStore';

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

type Props = {
  savedPlaces: SavedPlace[];
  selectedSavedPlaceId: string | null;
  onSelectCampusPlace: (featureId: string) => void;
  onSelectCustomPin: (id: string) => void;
};

export function SavedPlacesList({
  savedPlaces,
  selectedSavedPlaceId,
  onSelectCampusPlace,
  onSelectCustomPin,
}: Props) {
  return (
    <View style={styles.savedPlacesSection}>
      <Text style={[styles.savedPlacesTitle, { color: sheetSecondaryLabel }]}>저장된 장소</Text>
      {savedPlaces.map((place) => {
        const isCustom = place.type === 'custom';
        const color = place.color;
        const onPress = isCustom
          ? () => onSelectCustomPin(place.id)
          : () => onSelectCampusPlace(place.featureId);
        const subtitle = isCustom
          ? '커스텀 핀'
          : `${place.level}층 · ${CATEGORY_LABELS[place.category as CampusFeatureCategory] ?? place.category}`;
        return (
          <Pressable
            key={place.id}
            accessibilityRole="button"
            accessibilityLabel={formatSavedPlaceLabel(place)}
            accessibilityHint={formatSavedPlaceSubtitle(place)}
            accessibilityState={{ selected: place.id === selectedSavedPlaceId }}
            hitSlop={HIT_SLOP}
            onPress={onPress}
            style={({ pressed }) => [
              styles.savedPlaceRow,
              { backgroundColor: sheetSystemFill, borderColor: sheetSeparator },
              pressed && { opacity: 0.88 },
            ]}
          >
            <View style={[styles.savedPlaceColor, { backgroundColor: color }]} />
            <View style={styles.savedPlaceCopy}>
              <Text style={[styles.savedPlaceName, { color: sheetLabel }]} numberOfLines={1}>
                {place.name}
              </Text>
              <Text style={[styles.savedPlaceMeta, { color: sheetSecondaryLabel }]} numberOfLines={1}>
                {subtitle}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  savedPlacesSection: {
    gap: 8,
    paddingHorizontal: 2,
  },
  savedPlacesTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    paddingHorizontal: 4,
  },
  savedPlaceRow: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 2,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  savedPlaceColor: {
    borderRadius: 8,
    height: 16,
    width: 16,
  },
  savedPlaceCopy: {
    flex: 1,
    gap: 1,
  },
  savedPlaceName: {
    fontSize: 15,
    fontWeight: '700',
  },
  savedPlaceMeta: {
    fontSize: 12,
    fontWeight: '600',
  },
});
