import { useEffect, useMemo, useState } from 'react';
import {
  Keyboard,
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
              {routeOptions.map((option, index) => (
                <RouteOptionCard
                  key={option.id}
                  option={option}
                  index={index}
                  isSelected={index === selectedRouteIndex}
                  onSelect={handleSelectRoute}
                  accentColor={accentColor}
                />
              ))}
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


