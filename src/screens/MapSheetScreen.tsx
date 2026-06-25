import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, useColorScheme, View, type ColorValue } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { runOnJS } from 'react-native-worklets';
import { MAP_STYLES } from '../constants/mapStyles';
import campusDataUntyped from '../data/campus-wgs84.json';
import { FeedbackStateCard } from '../components/feedback/FeedbackStateCard';
import { BleWclStatusCard } from '../components/map/BleWclStatusCard';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { SearchBar } from '../components/map/SearchBar';
import { useSearchBar } from '../hooks/useSearchBar';
import { useMapStore } from '../store/mapStore';
import { useBleLocationStore } from '../store/bleLocationStore';
import { useSavedPlacesStore } from '../store/savedPlacesStore';
import {
  sheetAccent,
  sheetLabel,
  sheetSecondaryLabel,
  sheetSeparator,
  sheetSystemFill,
  sheetTertiaryLabel,
  sheetSelectionBg,
} from '../theme/sheetSemanticColors';
import type { CampusGeoJSON } from '../types/geojson';
import { getFeatureById, getLevelKeys } from '../utils/geoJsonHelpers';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { SettingsPanel } from './mapSheet/SettingsPanel';
import { SavedPlacesList } from './mapSheet/SavedPlacesList';
import { SearchResultsList } from './mapSheet/SearchResultsList';

const campusData = campusDataUntyped as unknown as CampusGeoJSON;

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

// Fixed per-button width for the Liquid Glass floor selector. The drag snap
// math is: nearestIndex = clamp(round(translateX / LEVEL_BUTTON_WIDTH), 0, len-1).
// Adding wider level labels would break this; keep labels ≤ 2 chars (1F/2F/3F/4F).
const LEVEL_BUTTON_WIDTH = 36;

// iOS tab-bar-style squishy spring — underdamped for a soft, organic feel.
// Slight overshoot gives the "말랑말랑한 물방울" sensation the user wants.
const SPRING_CONFIG = { mass: 1, damping: 16, stiffness: 200, overshootClamping: false };

export function MapSheetScreen() {
  const sheetScheme = useColorScheme();
  const { searchQuery, setSearchQuery, searchResults } = useSearchBar();

  const {
    selectedFloorKey,
    selectedLevel,
    selectedFeatureId,
    baseLayer,
    hiddenCategories,
    setSelectedLevel,
    setSelectedFeatureId,
    setBaseLayer,
    toggleCategory,
    bleCardVisible,
    settingsVisible,
    setBleCardVisible,
    setSettingsVisible,
    setPendingFlyToFeatureId,
    setPendingFlyToCoordinates,
    requestShowAttribution,
    requestMinimizeSheets,
    bleTrackingEnabled,
    setBleTrackingEnabled,
    clearLocationSource,
    gpsTrackingEnabled,
    userCoordinates,
    minimizeSheetsTick,
    showApMarkers,
    toggleApMarkers,
  } = useMapStore();

  const allCategories = useMapStore((s) => s.allCategories);

  const levels = useMemo(() => getLevelKeys(campusData), []);
  const gpsSearching = gpsTrackingEnabled && !userCoordinates;
  const isLocateDisabled = gpsSearching;
  const baseLayerIcon = MAP_STYLES.find((s) => s.id === baseLayer)?.icon ?? '⚙';

  // ── Wheel floor selector ─────────────────────────────────────────────
  const selectedIndex = useMemo(
    () => Math.max(0, levels.indexOf(selectedLevel)),
    [levels, selectedLevel],
  );
  const scrollX = useSharedValue(selectedIndex * LEVEL_BUTTON_WIDTH);
  const panStartScrollX = useSharedValue(0);

  useEffect(() => {
    const target = selectedIndex * LEVEL_BUTTON_WIDTH;
    cancelAnimation(scrollX);
    scrollX.value = withSpring(target, SPRING_CONFIG);
  }, [selectedIndex, scrollX]);

  const applyLevelByIndex = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(levels.length - 1, index));
      const next = levels[clamped];
      if (next !== undefined && next !== selectedLevel) {
        setSelectedLevel(next);
      }
    },
    [levels, selectedLevel, setSelectedLevel],
  );

  const floorPanGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(4)
        .maxPointers(1)
        .onBegin(() => {
          'worklet';
          panStartScrollX.value = scrollX.value;
          cancelAnimation(scrollX);
        })
        .onUpdate((event) => {
          'worklet';
          // Drag follows the finger: dragging right should pull the row right,
          // so scrollX (which translateX subtracts) moves opposite the finger.
          const next = panStartScrollX.value - event.translationX;
          const max = (levels.length - 1) * LEVEL_BUTTON_WIDTH;
          scrollX.value = Math.max(0, Math.min(max, next));
        })
        .onEnd(() => {
          'worklet';
          const nearestIndex = Math.round(scrollX.value / LEVEL_BUTTON_WIDTH);
          const clamped = Math.max(0, Math.min(levels.length - 1, nearestIndex));
          scrollX.value = withSpring(clamped * LEVEL_BUTTON_WIDTH, SPRING_CONFIG);
          runOnJS(applyLevelByIndex)(clamped);
        }),
    [applyLevelByIndex, levels.length, panStartScrollX, scrollX],
  );

  // translateX centers the selected item: container center minus item center.
  const WHEEL_CONTAINER_WIDTH = LEVEL_BUTTON_WIDTH * 3;
  const rowStyle = useAnimatedStyle(() => ({
    transform: [{
      translateX: (WHEEL_CONTAINER_WIDTH - LEVEL_BUTTON_WIDTH) / 2 - scrollX.value,
    }],
  }));

  const handleLocate = useCallback(() => {
    setPendingFlyToFeatureId('__locate__');
  }, [setPendingFlyToFeatureId]);

  const {
    status: bleStatus,
    result: bleResult,
    error: bleError,
    scanDurationMs,
    setScanDurationMs,
    debugObservations,
    clearResult,
    dismissCard,
    beaconStats,
    isContinuousScanning,
    startContinuousScan,
    stopContinuousScan,
    drPosition,
    drStepsSinceLastBle,
    isMotionActive,
    drErrorMeters,
    startMotionTracking,
    stopMotionTracking,
    currentHeading,
    fusionState,
    fusionUnavailableReason,
  } = useBleLocationStore();

  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'MapSheet'>>();
  const [currentDetentIndex, setCurrentDetentIndex] = useState(1);
  const lastMinimizedTickRef = useRef(minimizeSheetsTick);
  const isMinimizedRef = useRef(false);
  const prevBleVisibleRef = useRef(bleCardVisible);
  const prevSettingsVisibleRef = useRef(settingsVisible);

  useEffect(() => {
    const unsubscribe = navigation.addListener('sheetDetentChange', (e) => {
      setCurrentDetentIndex(e.data.index);
      if (isMinimizedRef.current) {
        // User is dragging within the restricted-minimize range. Unlock
        // by restoring full detent range. Pass current detent index so the
        // sheet stays at its current position.
        isMinimizedRef.current = false;
        navigation.setOptions({
          sheetAllowedDetents: [0.06, 0.12, 0.5, 1.0],
          sheetLargestUndimmedDetentIndex: 3,
          sheetInitialDetentIndex: e.data.index,
        });
      }
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    if (minimizeSheetsTick === lastMinimizedTickRef.current) {
      return;
    }

    lastMinimizedTickRef.current = minimizeSheetsTick;
    isMinimizedRef.current = true;
    // Restrict to the two smallest detents. Sheet snaps to the first (0.06)
    // and the user can drag up to 0.12 but no further while minimized.
    // No restore timer, no sheetInitialDetentIndex — the restricted detents
    // stay in place until the user drags (sheetDetentChange unlocks them).
    navigation.setOptions({
      sheetAllowedDetents: [0.06, 0.12],
      sheetLargestUndimmedDetentIndex: 1,
    });
  }, [minimizeSheetsTick, navigation]);

  useEffect(() => {
    const bleJustOpened = bleCardVisible && !prevBleVisibleRef.current;
    const settingsJustOpened = settingsVisible && !prevSettingsVisibleRef.current;
    const bleJustClosed = !bleCardVisible && prevBleVisibleRef.current;
    const settingsJustClosed = !settingsVisible && prevSettingsVisibleRef.current;

    prevBleVisibleRef.current = bleCardVisible;
    prevSettingsVisibleRef.current = settingsVisible;

    if (bleJustOpened || settingsJustOpened) {
      // Open: allow only medium and full detents — sheet snaps to medium (first)
      // User can drag UP to full but not DOWN while BLE/settings is open.
      // No restore timer, no sheetInitialDetentIndex — restricted detents
      // stay in place until the next state transition (avoids snap-back bug).
      navigation.setOptions({
        sheetAllowedDetents: [0.5, 1.0],
        sheetLargestUndimmedDetentIndex: 1,
      });
    }

    if (bleJustClosed || settingsJustClosed) {
      // Close: restore full detent range. Sheet stays at current position
      // (medium, 0.5) and the user can drag down to smallest (0.06) if they
      // want. No restore timer, no sheetInitialDetentIndex.
      navigation.setOptions({
        sheetAllowedDetents: [0.06, 0.12, 0.5, 1.0],
        sheetLargestUndimmedDetentIndex: 3,
      });
    }
  }, [bleCardVisible, settingsVisible, navigation]);

  const handleSelectSearchResult = useCallback(
    (featureId: string) => {
      const feature = getFeatureById(campusData, featureId);
      if (feature && feature.properties.level !== selectedLevel) {
        setSelectedLevel(feature.properties.level);
      }
      setSearchQuery('');
      setBleCardVisible(false);
      setSettingsVisible(false);
      Keyboard.dismiss();
      setSelectedFeatureId(featureId);
      // Signal MapScreen to fly to this feature
      setPendingFlyToFeatureId(featureId);
      requestMinimizeSheets();
    },
    [selectedLevel, setBleCardVisible, setSelectedFeatureId, setSelectedLevel, setSettingsVisible, setPendingFlyToFeatureId, setSearchQuery, requestMinimizeSheets],
  );

  const handleBleScan = useCallback(() => {
    if (bleTrackingEnabled) {
      // BLE OFF path
      setBleTrackingEnabled(false);
      setBleCardVisible(false);
      dismissCard();
      stopContinuousScan();
      stopMotionTracking();
      clearLocationSource('ble');
      return;
    }
    // BLE ON path
    setBleTrackingEnabled(true);
    setSettingsVisible(false);
    setBleCardVisible(true);
    if (!isContinuousScanning) {
      startContinuousScan();
      startMotionTracking();
    }
  }, [bleTrackingEnabled, setBleTrackingEnabled, setBleCardVisible, dismissCard, stopContinuousScan, stopMotionTracking, clearLocationSource, setSettingsVisible, isContinuousScanning, startContinuousScan, startMotionTracking]);

  const handleToggleSettings = useCallback(() => {
    if (settingsVisible) {
      setSettingsVisible(false);
    } else {
      // Mutual exclusion: close BLE when opening settings
      setBleCardVisible(false);
      setSettingsVisible(true);
    }
  }, [settingsVisible, setSettingsVisible, setBleCardVisible]);

  const isFocused = useIsFocused();
  const selectedSavedPlaceId = useSavedPlacesStore((s) => s.selectedSavedPlaceId);
  const setSelectedSavedPlaceId = useSavedPlacesStore((s) => s.setSelectedSavedPlaceId);
  const savedPlaces = useSavedPlacesStore((s) => s.savedPlaces);
  const savedPlacesArray = useMemo(() => Object.values(savedPlaces), [savedPlaces]);

  const handleSelectSavedCampusPlace = useCallback(
    (featureId: string) => {
      const feature = getFeatureById(campusData, featureId);
      if (feature && feature.properties.level !== selectedLevel) {
        setSelectedLevel(feature.properties.level);
      }
      setSelectedSavedPlaceId(null);
      setSearchQuery('');
      setBleCardVisible(false);
      setSettingsVisible(false);
      Keyboard.dismiss();
      setSelectedFeatureId(featureId);
      setPendingFlyToFeatureId(featureId);
      requestMinimizeSheets();
    },
    [selectedLevel, setSelectedLevel, setSelectedSavedPlaceId, setSearchQuery, setBleCardVisible, setSettingsVisible, setSelectedFeatureId, setPendingFlyToFeatureId, requestMinimizeSheets],
  );

  const handleSelectSavedCustomPin = useCallback(
    (pinId: string) => {
      const place = useSavedPlacesStore.getState().getSavedPlace(pinId);
      if (!place || place.type !== 'custom') return;
      setSelectedFeatureId(null);
      setSelectedSavedPlaceId(pinId);
      const g = place.coordinates;
      if (Number.isFinite(g[0]) && Number.isFinite(g[1])) {
        setPendingFlyToCoordinates(g);
      }
      setBleCardVisible(false);
      setSettingsVisible(false);
      requestMinimizeSheets();
    },
    [setSelectedFeatureId, setSelectedSavedPlaceId, setPendingFlyToCoordinates, setBleCardVisible, setSettingsVisible, requestMinimizeSheets],
  );

  useEffect(() => {
    if (selectedFeatureId && isFocused) {
      // Close BLE/settings when showing place detail
      setBleCardVisible(false);
      setSettingsVisible(false);
      const navigationState = navigation.getState();
      const currentRouteName = navigationState.routes[navigationState.index]?.name;
      if (currentRouteName !== 'PlaceDetailSheet') {
        navigation.navigate('PlaceDetailSheet');
      }
    }
  }, [selectedFeatureId, isFocused, navigation, setBleCardVisible, setSettingsVisible]);

  useEffect(() => {
    if (selectedSavedPlaceId && isFocused && !selectedFeatureId) {
      const navigationState = navigation.getState();
      const currentRouteName = navigationState.routes[navigationState.index]?.name;
      if (currentRouteName !== 'PlaceDetailSheet') {
        setBleCardVisible(false);
        setSettingsVisible(false);
        navigation.navigate('PlaceDetailSheet');
      }
    }
  }, [selectedSavedPlaceId, selectedFeatureId, isFocused, navigation, setBleCardVisible, setSettingsVisible]);

  const showBle = bleCardVisible && !settingsVisible;
  const showSettings = settingsVisible && !bleCardVisible;
  const mapCategories = allCategories();

  const mergedBlockChildren = (
    <>
      <View style={styles.barRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={gpsSearching ? 'GPS 위치 찾는 중' : gpsTrackingEnabled ? 'GPS 위치 추적 끄기' : 'GPS 위치 추적 켜기'}
              accessibilityState={{ disabled: isLocateDisabled }}
              disabled={isLocateDisabled}
              onPress={handleLocate}
              style={({ pressed }) => [styles.barButton, pressed && { backgroundColor: sheetSystemFill }, gpsTrackingEnabled && styles.barButtonActive]}
            >
          <Text style={[styles.barButtonGlyph, { color: sheetLabel }, isLocateDisabled && { color: sheetTertiaryLabel, opacity: 0.55 }]}>⌖</Text>
        </Pressable>

        <View style={[styles.barDivider, { backgroundColor: sheetSeparator }]} />

        {Platform.OS === 'ios' ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={bleTrackingEnabled ? 'BLE WCL 실시간 스캔 중지' : 'BLE WCL 실시간 스캔 시작'}
              accessibilityState={{ selected: bleTrackingEnabled }}
              onPress={handleBleScan}
              style={({ pressed }) => [
                styles.barButton,
                pressed && { backgroundColor: sheetSystemFill },
                bleTrackingEnabled && styles.barButtonActive,
              ]}
            >
              <Text style={[styles.barButtonBleLabel, { color: sheetAccent(sheetScheme) }]}>BLE</Text>
            </Pressable>
            <View style={[styles.barDivider, { backgroundColor: sheetSeparator }]} />
          </>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={showApMarkers ? 'AP 위치 표시 끄기' : 'AP 위치 표시 켜기'}
          accessibilityState={{ selected: showApMarkers }}
          onPress={toggleApMarkers}
          style={({ pressed }) => [
            styles.barButton,
            pressed && { backgroundColor: sheetSystemFill },
            showApMarkers && styles.barButtonActive,
          ]}
        >
          <Text style={[styles.barButtonBleLabel, { color: sheetAccent(sheetScheme) }]}>AP</Text>
        </Pressable>

        <View style={[styles.barDivider, { backgroundColor: sheetSeparator }]} />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="지도 설정"
          accessibilityState={{ selected: settingsVisible }}
          onPress={handleToggleSettings}
          style={({ pressed }) => [
            styles.barButton,
            pressed && { backgroundColor: sheetSystemFill },
            settingsVisible && styles.barButtonActive,
          ]}
        >
          <Text style={[styles.barButtonGlyph, { color: sheetLabel }]}>{baseLayerIcon}</Text>
        </Pressable>

        <View style={[styles.barDivider, { backgroundColor: sheetSeparator }]} />

        <GestureDetector gesture={floorPanGesture}>
          <View style={styles.wheelContainer}>
            {/* Liquid Glass droplet over the centered (selected) floor. Rendered
                as a standalone GlassView against the sheet — NOT nested inside
                another glass surface, which would fail to composite. */}
            <View style={styles.wheelIndicatorWrap} pointerEvents="none">
              {isGlassEffectAPIAvailable() ? (
                <GlassView
                  glassEffectStyle="regular"
                  isInteractive
                  colorScheme={
                    sheetScheme === 'dark' || sheetScheme === 'light' ? sheetScheme : 'auto'
                  }
                  style={styles.wheelIndicator}
                />
              ) : (
                <View style={[styles.wheelIndicator, { backgroundColor: sheetSelectionBg }]} />
              )}
            </View>
            <View style={styles.wheelClip}>
              <Animated.View style={[styles.wheelRow, rowStyle]} pointerEvents="none">
                {levels.map((level, index) => (
                  <WheelItem
                    key={level}
                    index={index}
                    scrollX={scrollX}
                    level={level}
                    selected={level === selectedLevel}
                    accentColor={sheetAccent(sheetScheme)}
                    labelColor={sheetLabel}
                  />
                ))}
              </Animated.View>
            </View>
          </View>
        </GestureDetector>

        <View style={styles.infoGroup}>
          <View style={[styles.barDivider, { backgroundColor: sheetSeparator }]} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="지도 정보"
            onPress={() => requestShowAttribution()}
            style={({ pressed }) => [
              styles.barButton,
              pressed && { backgroundColor: sheetSystemFill },
            ]}
          >
            <Text style={[styles.barButtonGlyph, { color: sheetLabel }]}>ⓘ</Text>
          </Pressable>
        </View>
      </View>

        <View style={styles.searchRow}>
          <SearchBar
            containerStyle={{ flex: 1 }}
            useNativeSheetColors
            onBlur={() => {}}
            onClear={() => setSearchQuery('')}
            onFocus={() => {}}
            onSearchChange={setSearchQuery}
            searchQuery={searchQuery}
          />
      </View>
    </>
  );

  return (
    <View style={styles.container}>
      {/* Merged glass bar + search bar — one unified block at top of sheet */}
      <View style={styles.mergedBlock}>
        {mergedBlockChildren}
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {bleStatus === 'success' && bleResult ? (
          <Text style={[styles.helperText, { color: sheetSecondaryLabel }]}>
            {`BLE WCL 위치 확인됨 · ±${bleResult.accuracyMeters.toFixed(1)}m · 신뢰도 ${(bleResult.confidence * 100).toFixed(0)}%`}
          </Text>
        ) : null}

        {!showBle && !showSettings && searchQuery.trim().length === 0 && savedPlacesArray.length > 0 && (
          <SavedPlacesList
            savedPlaces={savedPlacesArray}
            selectedSavedPlaceId={selectedSavedPlaceId}
            onSelectCampusPlace={handleSelectSavedCampusPlace}
            onSelectCustomPin={handleSelectSavedCustomPin}
          />
        )}

        {!showBle && !showSettings && searchQuery.trim().length === 0 && savedPlacesArray.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyStateTitle, { color: sheetLabel }]}>BSSM 학교 지도</Text>
            <Text style={[styles.emptyStateText, { color: sheetSecondaryLabel }]}>
              검색하거나 지도에서 교실을 탭하여 정보를 확인하세요.
            </Text>
            <Text style={[styles.emptyStateHint, { color: sheetTertiaryLabel }]}>
              ⌖ 현재 위치 찾기 · BLE 실내 측위 · 지도 스타일 변경
            </Text>
            <Text style={[styles.emptyStateHint, { color: sheetTertiaryLabel }]}>
              💡 빈 지도를 길게 눌러 커스텀 핀을 추가할 수 있습니다
            </Text>
          </View>
        )}

        {searchQuery.trim().length > 0 && searchResults.length > 0 && !showBle && !showSettings && (
          <SearchResultsList
            results={searchResults}
            selectedFeatureId={selectedFeatureId}
            scheme={sheetScheme}
            onSelectResult={handleSelectSearchResult}
          />
        )}

        {searchQuery.trim().length > 0 && searchResults.length === 0 && !showBle && !showSettings && (
          <FeedbackStateCard title="검색 결과" message="현재 층에서 일치하는 교실이 없습니다." variant="empty" />
        )}

        {showSettings && (
          <SettingsPanel
            scheme={sheetScheme}
            baseLayer={baseLayer}
            hiddenCategories={hiddenCategories}
            mapCategories={mapCategories}
            onSetBaseLayer={setBaseLayer}
            onToggleCategory={toggleCategory}
          />
        )}

        {showBle && (
          <BleWclStatusCard
            colorScheme={sheetScheme === 'dark' ? 'dark' : 'light'}
            status={bleStatus}
            result={bleResult}
            error={bleError}
            onStartScan={handleBleScan}
            onDismiss={() => { setBleCardVisible(false); dismissCard(); }}
            scanDurationMs={scanDurationMs}
            onSetScanDuration={setScanDurationMs}
            debugObservations={debugObservations}
            beaconStats={beaconStats}
            isContinuousScanning={isContinuousScanning}
            onStartContinuousScan={startContinuousScan}
            onStopContinuousScan={stopContinuousScan}
            drPosition={drPosition}
            drStepsSinceLastBle={drStepsSinceLastBle}
            isMotionActive={isMotionActive}
            drErrorMeters={drErrorMeters}
            onStartMotionTracking={startMotionTracking}
            onStopMotionTracking={stopMotionTracking}
            fusionState={fusionState}
            fusionUnavailableReason={fusionUnavailableReason}
          />
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  mergedBlock: {
    overflow: 'visible',
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginTop: 0,
    marginBottom: 8,
    gap: 4,
    borderCurve: 'continuous',
  },
  barRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
  },
  infoGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
    marginLeft: 'auto',
  },
  barButton: {
    alignItems: 'center',
    borderRadius: 16,
    height: 40,
    justifyContent: 'center',
    minWidth: 40,
    paddingHorizontal: 6,
  },
  barButtonActive: {
    backgroundColor: sheetSelectionBg,
  },
  barButtonGlyph: {
    fontSize: 18,
    fontWeight: '800',
  },
  barButtonBleLabel: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  barDivider: {
    height: 24,
    width: 1,
  },
  wheelContainer: {
    width: LEVEL_BUTTON_WIDTH * 3,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelClip: {
    width: LEVEL_BUTTON_WIDTH * 3,
    height: 40,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  wheelIndicatorWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelIndicator: {
    width: LEVEL_BUTTON_WIDTH - 4,
    height: 32,
    borderRadius: 14,
  },
  wheelRow: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  wheelItem: {
    width: LEVEL_BUTTON_WIDTH,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelItemText: {
    fontSize: 14,
    fontWeight: '800',
  },
  scrollContent: {
    gap: 12,
    paddingBottom: 24,
  },
  searchRow: {
    flexDirection: 'row',
    zIndex: 20,
  },
  helperText: {
    fontSize: 12,
    lineHeight: 16,
    paddingHorizontal: 4,
  },
  // ── Empty state ───────────────────────────────────
  emptyState: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 20,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  emptyStateText: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  emptyStateHint: {
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
});

type WheelItemProps = {
  index: number;
  scrollX: SharedValue<number>;
  level: number;
  selected: boolean;
  accentColor: ColorValue;
  labelColor: ColorValue;
};

function WheelItem({ index, scrollX, level, selected, accentColor, labelColor }: WheelItemProps) {
  // Distance (in px) of this item from the centered selection. Items toward the
  // edges fade and shrink, so the row reads as a scrolling wheel rather than a
  // static strip — the "약간 블러" edge falloff the picker is missing.
  const animatedStyle = useAnimatedStyle(() => {
    const distance = Math.abs(index * LEVEL_BUTTON_WIDTH - scrollX.value);
    const opacity = interpolate(
      distance,
      [0, LEVEL_BUTTON_WIDTH, LEVEL_BUTTON_WIDTH * 2],
      [1, 0.4, 0.12],
      'clamp',
    );
    const scale = interpolate(
      distance,
      [0, LEVEL_BUTTON_WIDTH, LEVEL_BUTTON_WIDTH * 2],
      [1, 0.82, 0.66],
      'clamp',
    );
    return { opacity, transform: [{ scale }] };
  });

  return (
    <Animated.View style={[styles.wheelItem, animatedStyle]}>
      <Text style={[styles.wheelItemText, { color: selected ? accentColor : labelColor }]}>
        {level}F
      </Text>
    </Animated.View>
  );
}
