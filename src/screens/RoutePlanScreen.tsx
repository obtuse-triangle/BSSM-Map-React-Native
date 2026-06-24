import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  type ColorValue,
  Keyboard,
  Platform,
  PlatformColor,
  Pressable,
  ScrollView,
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
import type { RouteSortMode } from '../types/routing';
import { ROUTE_SWATCH_COLORS } from '../services/routing/constants';

import { SearchResultList } from './routePlan/SearchResultList';
import { FloorSelectorRow } from './routePlan/FloorSelectorRow';
import { RouteOptionCard } from './routePlan/RouteOptionCard';
import { styles, HIT_SLOP } from './routePlan/routePlanStyles';
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

// `systemRed` on iOS, matching fallback used elsewhere in the app. Inline so
// this task stays scoped to RoutePlanScreen (theme file is owned by Task 7).
const errorColor: ColorValue =
  Platform.OS === 'ios' ? PlatformColor('systemRed') : '#FF3B30';

// RouteStore may surface technical sentinel codes (e.g. ROUTE_ORIGIN_REQUIRED)
// for its own contract checks. Map them to Korean user copy. Any unknown /
// non-sentinel string is shown verbatim — the store already sets user-facing
// messages like 'Route computation failed' for genuine failures.
function userFacingErrorMessage(raw: string): string {
  switch (raw) {
    case 'ROUTE_ORIGIN_REQUIRED':
      return '출발지를 먼저 선택해주세요.';
    case 'ROUTE_DESTINATION_REQUIRED':
      return '도착지를 먼저 선택해주세요.';
    default:
      return `경로를 계산하지 못했습니다.\n${raw}`;
  }
}

const SORT_TABS: { mode: RouteSortMode; label: string }[] = [
  { mode: 'recommended', label: '추천' },
  { mode: 'fastest', label: '빠름' },
  { mode: 'easiest', label: '편함' },
  { mode: 'shortest', label: '가까움' },
];

type ActiveField = 'origin' | 'destination' | null;

function featureDisplayName(feature: CampusFeature | undefined): string {
  if (!feature) return '';
  return feature.properties.name_ko || feature.properties.name;
}

export function RoutePlanScreen() {
  const scheme = useColorScheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const {
    routeOrigin,
    routeDestination,
    routeOptions,
    selectedRouteIndex,
    sortMode,
    isComputing,
    error,
  } = useRouteStore();
  const {
    setOriginFromFeature,
    setDestinationFeature,
    setOriginFromUserLocation,
    computeRouteOptions,
    selectRoute,
    setSortMode,
  } = useRouteStore();

  const selectedLevel = useMapStore((s) => s.selectedLevel);
  const levels = useMemo(() => getLevelKeys(campusData), []);

  useEffect(() => {
    const state = useRouteStore.getState();
    if (state.routeOrigin && state.routeDestination && state.routeOptions.length === 0) {
      state.computeRouteOptions();
    }
  }, []);

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
    if (!routeOrigin || !routeDestination) {
      console.warn('[RoutePlanScreen] swap ignored: missing origin or destination');
      return;
    }
    if (routeOrigin.type === 'user_location') {
      console.warn(
        '[RoutePlanScreen] swap ignored: user_location origin has no featureId to swap with',
      );
      return;
    }
    const prevOriginFeatureId = routeOrigin.featureId;
    const prevDestFeatureId = routeDestination.featureId;

    // Set destination → origin first, then origin → destination.
    setOriginFromFeature(prevDestFeatureId);
    setDestinationFeature(prevOriginFeatureId);
    computeRouteOptions();
  };

  const handleClose = () => {
    useRouteStore.getState().clearRouteOptions();
    navigation.navigate('Map');
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
  const showLoading = isComputing && !showRouteOptions;
  const showError = !!error && !isComputing && !showRouteOptions;
  const showEmptyState =
    !showRouteOptions && !showLoading && !showError && !!routeOrigin && !!routeDestination;

  // Swap requires both endpoints to be feature-backed. A `user_location` origin
  // has no featureId, so swap would silently no-op — disable + explain instead.
  const isSwapDisabled =
    !routeOrigin ||
    !routeDestination ||
    routeOrigin.type === 'user_location';

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

          <FloorSelectorRow
            levels={levels}
            selectedLevel={selectedLevel}
            onSelectLevel={(level) => useMapStore.getState().setSelectedLevel(level)}
          />

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
              accessibilityState={isSwapDisabled ? { disabled: true } : undefined}
              accessibilityHint={
                isSwapDisabled
                  ? '현재 위치는 출발지로만 설정할 수 있어 교체할 수 없습니다.'
                  : undefined
              }
              disabled={isSwapDisabled}
              hitSlop={HIT_SLOP}
              onPress={handleSwap}
              style={({ pressed }) => [
                styles.swapButton,
                { backgroundColor: sheetSystemFill, borderColor: sheetSeparator },
                isSwapDisabled && { opacity: 0.4 },
                !isSwapDisabled && pressed && { opacity: 0.7 },
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

              <View style={styles.sortTabRow}>
                {SORT_TABS.map((tab) => {
                  const active = sortMode === tab.mode;
                  return (
                    <Pressable
                      key={tab.mode}
                      accessibilityRole="button"
                      accessibilityLabel={`${tab.label} 순으로 정렬`}
                      accessibilityState={{ selected: active }}
                      hitSlop={HIT_SLOP}
                      onPress={() => setSortMode(tab.mode)}
                      style={({ pressed }) => [
                        styles.sortTab,
                        {
                          backgroundColor: active ? accentColor : sheetSecondarySystemFill,
                          borderColor: active ? accentColor : sheetSeparator,
                        },
                        pressed && { opacity: 0.85 },
                      ]}
                    >
                      <Text
                        style={[
                          styles.sortTabLabel,
                          { color: active ? '#FFFFFF' : sheetSecondaryLabel },
                        ]}
                      >
                        {tab.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {routeOptions.map((option, index) => (
                <RouteOptionCard
                  key={option.id}
                  option={option}
                  index={index}
                  isSelected={index === selectedRouteIndex}
                  onSelect={handleSelectRoute}
                  swatchColor={ROUTE_SWATCH_COLORS[index % ROUTE_SWATCH_COLORS.length]}
                />
              ))}
            </View>
          )}

          {showLoading && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 24,
                paddingHorizontal: 16,
              }}
            >
              <ActivityIndicator size="small" color={accentColor} />
              <Text style={[styles.emptyStateText, { color: sheetSecondaryLabel }]}>
                경로 계산 중...
              </Text>
            </View>
          )}

          {showError && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 8,
                paddingVertical: 16,
                paddingHorizontal: 16,
                borderLeftWidth: 3,
                borderLeftColor: errorColor,
                backgroundColor: sheetSecondarySystemFill,
                borderRadius: 8,
                marginTop: 8,
              }}
            >
              <Text style={{ color: errorColor, fontSize: 16, lineHeight: 22 }}>⚠</Text>
              <Text
                style={{
                  flex: 1,
                  color: errorColor,
                  fontSize: 14,
                  lineHeight: 20,
                }}
              >
                {userFacingErrorMessage(error!)}
              </Text>
            </View>
          )}

          {showEmptyState && (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyStateText, { color: sheetTertiaryLabel }]}>
                경로를 계산할 수 없어요. 출발지와 도착지를 다시 확인해주세요.
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


