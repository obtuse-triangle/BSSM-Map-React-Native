import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GlassSurface } from '../../components/glass';
import { MAP_STYLES, type MapStyleId } from '../../constants/mapStyles';
import {
  CATEGORY_LABELS,
  formatToggleLabel,
} from '../../utils/accessibilityLabels';
import {
  sheetAccent,
  sheetLabel,
  sheetSecondaryLabel,
  sheetSecondarySystemFill,
  sheetSeparator,
  sheetSystemFill,
  sheetTertiaryLabel,
  sheetSelectionBg,
} from '../../theme/sheetSemanticColors';
import { LIGHT_CAMPUS_OVERLAY } from '../../components/map/campusOverlayPaints';
import type { CampusFeatureCategory } from '../../store/mapStore';

const BASE_LAYER_OPTIONS = MAP_STYLES.map((s) => ({ key: s.id, label: s.label, icon: s.icon }));

const CATEGORY_COLORS = LIGHT_CAMPUS_OVERLAY.categories;

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

type Props = {
  scheme: 'light' | 'dark' | null | undefined;
  baseLayer: MapStyleId;
  hiddenCategories: Set<string>;
  mapCategories: CampusFeatureCategory[];
  onSetBaseLayer: (key: MapStyleId) => void;
  onToggleCategory: (cat: CampusFeatureCategory) => void;
};

export function SettingsPanel({
  scheme,
  baseLayer,
  hiddenCategories,
  mapCategories,
  onSetBaseLayer,
  onToggleCategory,
}: Props) {
  return (
    <GlassSurface variant="modal" cornerRadius={20} style={styles.settingsCard}>
      <Text style={[styles.settingsTitle, { color: sheetLabel }]}>지도 설정</Text>

      <Text style={[styles.settingsSectionTitle, { color: sheetSecondaryLabel }]}>배경 지도</Text>
      <View style={styles.baseLayerRow}>
        {BASE_LAYER_OPTIONS.map((opt) => {
          const active = baseLayer === opt.key;
          return (
            <Pressable
              key={opt.key}
              accessibilityRole="button"
              accessibilityLabel={opt.label}
              accessibilityState={{ selected: baseLayer === opt.key }}
              onPress={() => onSetBaseLayer(opt.key)}
              style={[
                styles.baseLayerButton,
                { backgroundColor: sheetSystemFill, borderColor: sheetSeparator },
                active && { backgroundColor: sheetSelectionBg, borderColor: sheetAccent(scheme) },
              ]}
            >
              <Text style={[styles.baseLayerIcon, { color: sheetLabel }]}>{opt.icon}</Text>
              <Text style={[styles.baseLayerLabel, { color: sheetSecondaryLabel }, active && { color: sheetAccent(scheme) }]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.settingsSectionTitle, { color: sheetSecondaryLabel }]}>카테고리 표시</Text>
      <View style={styles.categoryGrid}>
        {mapCategories.map((cat) => {
          const hidden = hiddenCategories.has(cat);
          return (
            <Pressable
              key={cat}
              accessibilityRole="button"
              accessibilityLabel={formatToggleLabel(CATEGORY_LABELS[cat], !hidden)}
              accessibilityState={{ selected: !hidden }}
              hitSlop={HIT_SLOP}
              onPress={() => onToggleCategory(cat)}
              style={[
                styles.categoryChip,
                { backgroundColor: sheetSystemFill, borderColor: sheetSeparator, borderLeftColor: CATEGORY_COLORS[cat] },
                hidden && { backgroundColor: sheetSecondarySystemFill, opacity: 0.55 },
              ]}
            >
              <Text style={[styles.categoryChipText, { color: sheetLabel }, hidden && { color: sheetTertiaryLabel }]}>
                {hidden ? '✕' : '✓'} {CATEGORY_LABELS[cat]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  settingsCard: {
    gap: 16,
    padding: 20,
  },
  settingsTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  settingsSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  baseLayerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  baseLayerButton: {
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
    paddingVertical: 10,
    minWidth: 80,
    paddingHorizontal: 10,
  },
  baseLayerIcon: {
    fontSize: 22,
  },
  baseLayerLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    borderLeftWidth: 3,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
