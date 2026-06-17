import { useEffect, useMemo, useState } from 'react';
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { GlassSurface } from '../components/glass';
import { useSearchBar } from '../hooks/useSearchBar';
import { useMapStore } from '../store/mapStore';
import { useRouteStore } from '../store/routeStore';
import type { RootStackParamList } from '../navigation/types';
import type { CampusFeature } from '../types/geojson';

import {
  formatRouteSummary,
  formatSearchResultLabel,
  getRouteBadgeText,
} from '../utils/accessibilityLabels';
import {
  sheetAccent,
  sheetLabel,
  sheetSecondaryLabel,
  sheetSecondarySystemFill,
  sheetSeparator,
  sheetSystemFill,
  sheetTertiaryLabel,
  sheetSelectionBg,
} from '../theme/sheetSemanticColors';
import campusDataUntyped from '../data/campus-wgs84.json';
import type { CampusGeoJSON } from '../types/geojson';
import { getFeatureById, getLevelKeys } from '../utils/geoJsonHelpers';

const campusData = campusDataUntyped as unknown as CampusGeoJSON;

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

type ActiveField = 'origin' | 'destination' | null;

function featureDisplayName(feature: CampusFeature | undefined): string {
  if (!feature) return '';
  return feature.properties.name_ko || feature.properties.name;
}

function SearchResultList({
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

export function RoutePlanScreen() {
  const scheme = useColorScheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const {
    routeOrigin,
    routeDestination,
    routeOptions,
    selectedRouteIndex,
    error,
  } = useRouteStore();
  const {
    setOriginFromFeature,
    setDestinationFeature,
    setOriginFromUserLocation,
    computeRouteOptions,
    selectRoute,
  } = useRouteStore();

  const selectedLevel = useMapStore((s) => s.selectedLevel);
  const levels = useMemo(() => getLevelKeys(campusData), []);

  useEffect(() => {
    const state = useRouteStore.getState();
    if (state.routeOrigin && state.routeDestination && state.routeOptions.length === 0) {
      state.computeRouteOptions();
    }
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', () => {
      useRouteStore.getState().clearRoute();
    });
    return unsubscribe;
  }, [navigation]);

  const originSearch = useSearchBar();
  const destinationSearch = useSearchBar();
  const [activeField, setActiveField] = useState<ActiveField>(null);

  const originLabel = useMemo(() => {
    if (!routeOrigin) return '';
    if (routeOrigin.type === 'user_location') return '현재 위치';
    const feature = getFeatureById(campusData, routeOrigin.featureId);
    return featureDisplayName(feature);
  }, [routeOrigin]);

  const destinationLabel = useMemo(() => {
    if (!routeDestination) return '';
    const feature = getFeatureById(campusData, routeDestination.featureId);
    return featureDisplayName(feature);
  }, [routeDestination]);

  const handleOriginFocus = () => {
    setActiveField('origin');
    originSearch.setIsSearchFocused(true);
  };

  const handleDestinationFocus = () => {
    setActiveField('destination');
    destinationSearch.setIsSearchFocused(true);
  };

  const handleOriginBlur = () => {
    originSearch.setIsSearchFocused(false);
  };

  const handleDestinationBlur = () => {
    destinationSearch.setIsSearchFocused(false);
  };

  const handleSelectOrigin = (featureId: string) => {
    setOriginFromFeature(featureId);
    originSearch.setSearchQuery('');
    originSearch.setIsSearchFocused(false);
    setActiveField(null);
    Keyboard.dismiss();
    if (routeDestination) {
      computeRouteOptions();
    }
  };

  const handleSelectDestination = (featureId: string) => {
    setDestinationFeature(featureId);
    destinationSearch.setSearchQuery('');
    destinationSearch.setIsSearchFocused(false);
    setActiveField(null);
    Keyboard.dismiss();
    computeRouteOptions();
  };

  const handleCurrentLocation = () => {
    const { userCoordinates, selectedLevel } = useMapStore.getState();
    if (!userCoordinates) return;
    setOriginFromUserLocation(
      [userCoordinates.longitude, userCoordinates.latitude],
      selectedLevel,
    );
    originSearch.setSearchQuery('');
    originSearch.setIsSearchFocused(false);
    setActiveField(null);
    Keyboard.dismiss();
    if (routeDestination) {
      computeRouteOptions();
    }
  };

  const handleSwap = () => {
    if (!routeOrigin || !routeDestination) return;
    const prevOriginFeatureId =
      routeOrigin.type === 'selected_place' ? routeOrigin.featureId : null;
    const prevDestFeatureId = routeDestination.featureId;

    if (!prevOriginFeatureId || !prevDestFeatureId) return;

    // Set destination → origin first, then origin → destination.
    setOriginFromFeature(prevDestFeatureId);
    setDestinationFeature(prevOriginFeatureId);
    computeRouteOptions();
  };

  const handleClose = () => {
    useRouteStore.getState().clearRoute();
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Map');
    }
  };

  const handleSelectRoute = (index: number) => {
    selectRoute(index);
  };

  const showOriginResults =
    activeField === 'origin' &&
    originSearch.searchQuery.trim().length > 0 &&
    originSearch.searchResults.length > 0;
  const showDestinationResults =
    activeField === 'destination' &&
    destinationSearch.searchQuery.trim().length > 0 &&
    destinationSearch.searchResults.length > 0;
  const showRouteOptions = routeOptions.length > 0;
  const showEmptyState = !showRouteOptions && routeOrigin && routeDestination;

  const accentColor = sheetAccent(scheme);

  return (
    <View style={styles.screen}>
      <GlassSurface variant="sheet" cornerRadius={24} style={styles.sheet}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: sheetLabel }]}>경로 찾기</Text>
            <Pressable
              accessibilityLabel="닫기"
              accessibilityRole="button"
              hitSlop={HIT_SLOP}
              onPress={handleClose}
              style={({ pressed }) => [
                styles.closeButton,
                { backgroundColor: sheetSecondarySystemFill },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={[styles.closeButtonText, { color: sheetSecondaryLabel }]}>✕</Text>
            </Pressable>
          </View>

          <View style={styles.floorSelectorRow}>
            {levels.map((level) => {
              const selected = level === selectedLevel;
              return (
                <Pressable
                  key={level}
                  accessibilityRole="button"
                  accessibilityLabel={`${level}층 선택`}
                  accessibilityState={{ selected }}
                  hitSlop={HIT_SLOP}
                  onPress={() => useMapStore.getState().setSelectedLevel(level)}
                  style={[
                    styles.floorSelectorButton,
                    selected && styles.floorSelectorButtonActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.floorSelectorButtonText,
                      { color: sheetSecondaryLabel },
                      selected && { color: sheetAccent(scheme), fontWeight: '800' },
                    ]}
                  >
                    {level}F
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.inputColumn}>
              <View
                style={[
                  styles.inputRow,
                  { backgroundColor: sheetSecondarySystemFill, borderColor: sheetSeparator },
                  activeField === 'origin' && {
                    borderColor: accentColor,
                  },
                ]}
              >
                <Text style={[styles.inputDot, { color: accentColor }]}>●</Text>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  blurOnSubmit
                  onFocus={handleOriginFocus}
                  onBlur={handleOriginBlur}
                  onSubmitEditing={() => Keyboard.dismiss()}
                  placeholder="출발지 검색"
                  placeholderTextColor={sheetTertiaryLabel}
                  returnKeyType="search"
                  selectionColor={accentColor}
                  style={[styles.inputText, { color: sheetLabel }]}
                  value={activeField === 'origin' ? originSearch.searchQuery : originLabel}
                  onChangeText={originSearch.setSearchQuery}
                />
                {activeField === 'origin' && originSearch.searchQuery.length > 0 ? (
                  <Pressable
                    accessibilityLabel="출발지 검색어 지우기"
                    accessibilityRole="button"
                    hitSlop={HIT_SLOP}
                    onPress={() => originSearch.handleClear()}
                    style={styles.clearInline}
                  >
                    <Text style={[styles.clearInlineText, { color: sheetTertiaryLabel }]}>×</Text>
                  </Pressable>
                ) : null}
              </View>

              <View
                style={[
                  styles.inputRow,
                  styles.destinationRow,
                  { backgroundColor: sheetSecondarySystemFill, borderColor: sheetSeparator },
                  activeField === 'destination' && {
                    borderColor: accentColor,
                  },
                ]}
              >
                <Text style={[styles.inputDot, styles.destDot, { color: sheetSecondaryLabel }]}>■</Text>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  blurOnSubmit
                  onFocus={handleDestinationFocus}
                  onBlur={handleDestinationBlur}
                  onSubmitEditing={() => Keyboard.dismiss()}
                  placeholder="도착지 검색"
                  placeholderTextColor={sheetTertiaryLabel}
                  returnKeyType="search"
                  selectionColor={accentColor}
                  style={[styles.inputText, { color: sheetLabel }]}
                  value={
                    activeField === 'destination'
                      ? destinationSearch.searchQuery
                      : destinationLabel
                  }
                  onChangeText={destinationSearch.setSearchQuery}
                />
                {activeField === 'destination' &&
                destinationSearch.searchQuery.length > 0 ? (
                  <Pressable
                    accessibilityLabel="도착지 검색어 지우기"
                    accessibilityRole="button"
                    hitSlop={HIT_SLOP}
                    onPress={() => destinationSearch.handleClear()}
                    style={styles.clearInline}
                  >
                    <Text style={[styles.clearInlineText, { color: sheetTertiaryLabel }]}>×</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            <Pressable
              accessibilityLabel="출발지와 도착지 교체"
              accessibilityRole="button"
              hitSlop={HIT_SLOP}
              onPress={handleSwap}
              style={({ pressed }) => [
                styles.swapButton,
                { backgroundColor: sheetSystemFill, borderColor: sheetSeparator },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={[styles.swapIcon, { color: sheetSecondaryLabel }]}>⇅</Text>
            </Pressable>
          </View>

          <Pressable
            accessibilityLabel="현재 위치를 출발지로 설정"
            accessibilityRole="button"
            hitSlop={HIT_SLOP}
            onPress={handleCurrentLocation}
            style={({ pressed }) => [
              styles.currentLocationButton,
              { backgroundColor: sheetSelectionBg, borderColor: sheetSeparator },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={[styles.currentLocationIcon, { color: accentColor }]}>⌖</Text>
            <Text style={[styles.currentLocationText, { color: accentColor }]}>현재 위치</Text>
          </Pressable>

          {showOriginResults && (
            <SearchResultList
              results={originSearch.searchResults}
              onSelect={handleSelectOrigin}
            />
          )}

          {showDestinationResults && (
            <SearchResultList
              results={destinationSearch.searchResults}
              onSelect={handleSelectDestination}
            />
          )}

          {showRouteOptions && (
            <View style={styles.optionsContainer}>
              <Text style={[styles.optionsSectionTitle, { color: sheetSecondaryLabel }]}>
                경로 옵션
              </Text>
              {routeOptions.map((option, index) => {
                const isSelected = index === selectedRouteIndex;
                if (!option.result.ok) {
                  return (
                    <View
                      key={option.id}
                      style={[
                        styles.optionCard,
                        { backgroundColor: sheetSecondarySystemFill, borderColor: sheetSeparator },
                      ]}
                    >
                      <Text style={[styles.optionLabel, { color: sheetLabel }]}>
                        {option.label}
                      </Text>
                      <Text style={[styles.optionErrorText, { color: sheetTertiaryLabel }]}>
                        경로를 찾을 수 없습니다
                      </Text>
                    </View>
                  );
                }
                const minutes = Math.round(option.result.estimatedTimeSeconds / 60);
                const meters = Math.round(option.result.totalDistanceMeters);
                return (
                  <Pressable
                    key={option.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${option.label}, ${formatRouteSummary(option.result)}`}
                    accessibilityState={{ selected: isSelected }}
                    hitSlop={HIT_SLOP}
                    onPress={() => handleSelectRoute(index)}
                    style={({ pressed }) => [
                      styles.optionCard,
                      {
                        backgroundColor: isSelected ? sheetSelectionBg : sheetSecondarySystemFill,
                        borderColor: isSelected ? accentColor : sheetSeparator,
                      },
                      pressed && { opacity: 0.88 },
                    ]}
                  >
                    <View style={styles.optionHeaderRow}>
                      <Text
                        style={[
                          styles.optionLabel,
                          { color: sheetLabel },
                          isSelected && { color: accentColor },
                        ]}
                      >
                        {option.label}
                      </Text>
                      {(() => {
                        const badgeText = getRouteBadgeText(option.result);
                        return badgeText ? (
                          <View
                            style={[
                              styles.warningBadge,
                              { backgroundColor: sheetSystemFill },
                            ]}
                          >
                            <Text style={[styles.warningBadgeText, { color: sheetSecondaryLabel }]}>
                              {badgeText}
                            </Text>
                          </View>
                        ) : null;
                      })()}
                    </View>
                    <View style={styles.optionMetricsRow}>
                      <Text
                        style={[
                          styles.optionTime,
                          { color: sheetLabel },
                          isSelected && { color: accentColor },
                        ]}
                      >
                        {minutes}분
                      </Text>
                      <Text
                        style={[
                          styles.optionDistance,
                          { color: sheetSecondaryLabel },
                          isSelected && { color: accentColor },
                        ]}
                      >
                        {meters}m
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          {showEmptyState && (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyStateText, { color: sheetTertiaryLabel }]}>
                {error ? error : '출발지와 도착지를 설정해주세요'}
              </Text>
            </View>
          )}

          {!routeOrigin && !routeDestination && !showOriginResults && !showDestinationResults && (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyStateText, { color: sheetTertiaryLabel }]}>
                출발지와 도착지를 설정해주세요
              </Text>
            </View>
          )}
        </ScrollView>
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  sheet: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  closeButton: {
    alignItems: 'center',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 16,
  },
  floorSelectorRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
    justifyContent: 'center',
    marginBottom: 16,
  },
  floorSelectorButton: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 999,
    minWidth: 36,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  floorSelectorButtonActive: {
    backgroundColor: sheetSelectionBg,
  },
  floorSelectorButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  inputGroup: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    marginBottom: 10,
  },
  inputColumn: {
    flex: 1,
    flexDirection: 'column',
    gap: 8,
  },
  inputRow: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  destinationRow: {},
  inputDot: {
    fontSize: 12,
    fontWeight: '800',
  },
  destDot: {
    fontSize: 10,
  },
  inputText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: 0,
  },
  clearInline: {
    alignItems: 'center',
    borderRadius: 12,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  clearInlineText: {
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 18,
  },
  swapButton: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  swapIcon: {
    fontSize: 20,
    fontWeight: '800',
  },
  currentLocationButton: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 16,
    minHeight: 40,
  },
  currentLocationIcon: {
    fontSize: 16,
    fontWeight: '800',
  },
  currentLocationText: {
    fontSize: 14,
    fontWeight: '700',
  },
  resultsContainer: {
    borderRadius: 12,
    marginBottom: 12,
  },
  searchResultRow: {
    borderBottomWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  searchResultName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  searchResultMeta: {
    fontSize: 12,
    fontWeight: '500',
  },
  optionsContainer: {
    marginTop: 4,
  },
  optionsSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  optionCard: {
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  optionHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  optionLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  warningBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  warningBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  optionMetricsRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: 12,
  },
  optionTime: {
    fontSize: 22,
    fontWeight: '800',
  },
  optionDistance: {
    fontSize: 14,
    fontWeight: '600',
  },
  optionErrorText: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 4,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  emptyStateText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
