import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useMemo, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { bssmFloorMap } from '../constants/bssmFloorMap';
import { FloorSelector } from '../components/map/FloorSelector';
import { NativeFloorMap } from '../components/map/NativeFloorMap';
import { COLLAPSED_VISIBLE_HEIGHT, PlaceDetailBottomSheet } from '../components/map/PlaceDetailBottomSheet';
import type { RootStackParamList } from '../navigation/types';
import { getAccessPointsForFloor } from '../utils/accessPoint';
import { useMapStore } from '../store/mapStore';
import { usePositionStore } from '../store/positionStore';
import { getFloorList, getSelectedFloor } from '../utils/floorMap';
import type { FloorElement } from '../types/floorMap';

type MapScreenProps = NativeStackScreenProps<RootStackParamList, 'Map'>;
const MAP_TOP_CHROME_GAP = 8;

export function MapScreen({ navigation }: MapScreenProps) {
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState('');
  const [topChromeHeight, setTopChromeHeight] = useState(0);
  const floorList = useMemo(() => getFloorList(bssmFloorMap), []);
  const bottomObstructionHeight = COLLAPSED_VISIBLE_HEIGHT + insets.bottom;
  const topObstructionHeight = topChromeHeight > 0 ? topChromeHeight + MAP_TOP_CHROME_GAP : insets.top + 12;

  const {
    selectedFloorKey,
    selectedRoomId,
    showApMarkers,
    setSelectedFloorKey,
    setSelectedRoomId,
    toggleApMarkers,
  } = useMapStore();

  const { position, status, error, locateCurrentPosition } = usePositionStore();

  const selectedFloor = useMemo(
    () => getSelectedFloor(bssmFloorMap, selectedFloorKey),
    [selectedFloorKey],
  );

  const accessPoints = useMemo(() => {
    if (!selectedFloorKey || !selectedFloor) {
      return [];
    }

    return getAccessPointsForFloor(selectedFloorKey, selectedFloor);
  }, [selectedFloor, selectedFloorKey]);

  const currentPosition = useMemo(() => {
    if (!selectedFloorKey || !position || position.floorKey !== selectedFloorKey) {
      return null;
    }

    return position;
  }, [position, selectedFloorKey]);

  const statusForSelectedFloor = currentPosition !== null || status !== 'success' ? status : 'idle';

  const selectedRoom = useMemo(() => {
    if (!selectedFloor || selectedRoomId === null) {
      return null;
    }

    return selectedFloor.elements.find((element) => element.id === selectedRoomId) ?? null;
  }, [selectedFloor, selectedRoomId]);

  const searchableRooms = useMemo(() => {
    if (!selectedFloor) {
      return [];
    }

    return selectedFloor.elements.filter((element) => element.interactive === true && element.name.trim().length > 0);
  }, [selectedFloor]);

  const searchResults = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return [];
    }

    return searchableRooms.filter((room) => room.name.toLowerCase().includes(normalizedQuery));
  }, [searchQuery, searchableRooms]);

  const isLocateDisabled = status === 'loading' || accessPoints.length === 0;

  const handleLocateCurrentPosition = useCallback(() => {
    if (!selectedFloorKey || accessPoints.length === 0) {
      return;
    }

    void locateCurrentPosition({ floorKey: selectedFloorKey, accessPoints });
  }, [accessPoints, locateCurrentPosition, selectedFloorKey]);

  const handleSelectSearchResult = useCallback(
    (roomId: number) => {
      setSelectedRoomId(roomId);
      setSearchQuery('');
      Keyboard.dismiss();
    },
    [setSelectedRoomId],
  );

  const handleSelectRoom = useCallback(
    (room: FloorElement) => {
      setSelectedRoomId(room.id);
    },
    [setSelectedRoomId],
  );

  const handleTopChromeLayout = useCallback(
    (event: LayoutChangeEvent) => {
      if (searchQuery.trim().length > 0) {
        return;
      }

      const nextHeight = Math.ceil(event.nativeEvent.layout.height);

      setTopChromeHeight((currentHeight) => (currentHeight === nextHeight ? currentHeight : nextHeight));
    },
    [searchQuery],
  );

  return (
    <View style={styles.screen}>
      <View onLayout={handleTopChromeLayout} style={[styles.topChrome, { paddingTop: insets.top + 12 }]} pointerEvents="box-none">
        <View style={styles.topChromeContent}>
          <View style={styles.searchAndActionsRow}>
            <View style={styles.searchField}>
              <Text style={styles.searchIcon}>⌕</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="never"
                placeholder="현재 층 교실 검색"
                placeholderTextColor="#94a3b8"
                returnKeyType="search"
                selectionColor="#1d4ed8"
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="검색어 지우기"
                  onPress={() => setSearchQuery('')}
                  style={({ pressed }) => [styles.clearButton, pressed && styles.iconActionButtonPressed]}
                >
                  <Text style={styles.clearButtonText}>×</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.iconActionsRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isLocateDisabled ? '현재 위치 찾기 불가' : '현재 위치 찾기'}
                disabled={isLocateDisabled}
                onPress={handleLocateCurrentPosition}
                style={({ pressed }) => [
                  styles.iconActionButton,
                  isLocateDisabled && styles.iconActionButtonDisabled,
                  !isLocateDisabled && styles.locateButton,
                  pressed && !isLocateDisabled && styles.iconActionButtonPressed,
                ]}
              >
                <Text style={[styles.iconActionGlyph, isLocateDisabled && styles.iconActionGlyphDisabled]}>⌖</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={showApMarkers ? 'AP 마커 숨기기' : 'AP 마커 표시'}
                onPress={toggleApMarkers}
                style={({ pressed }) => [
                  styles.iconActionButton,
                  styles.apButton,
                  showApMarkers && styles.apButtonActive,
                  pressed && styles.iconActionButtonPressed,
                ]}
              >
                <Text style={[styles.iconActionGlyph, styles.apButtonGlyph, showApMarkers && styles.apButtonGlyphActive]}>AP</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="RTT 디버그 화면으로 이동"
                onPress={() => navigation.navigate('DebugRtt')}
                style={({ pressed }) => [styles.iconActionButton, styles.debugButton, pressed && styles.iconActionButtonPressed]}
              >
                <Text style={styles.iconActionGlyph}>🐞</Text>
              </Pressable>
            </View>
          </View>

          <FloorSelector floors={floorList} selectedFloorKey={selectedFloorKey} onSelectFloor={setSelectedFloorKey} />

          {searchResults.length > 0 ? (
            <View style={styles.searchResultsCard}>
              <Text style={styles.searchResultsTitle}>검색 결과</Text>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
                style={styles.searchResultsList}
              >
                {searchResults.map((room) => {
                  const selected = room.id === selectedRoomId;

                  return (
                    <Pressable
                      key={room.id}
                      accessibilityRole="button"
                      onPress={() => handleSelectSearchResult(room.id)}
                      style={({ pressed }) => [
                        styles.searchResultRow,
                        selected && styles.searchResultRowSelected,
                        pressed && styles.searchResultRowPressed,
                      ]}
                    >
                      <Text style={[styles.searchResultName, selected && styles.searchResultNameSelected]} numberOfLines={1}>
                        {room.name}
                      </Text>
                      <Text style={[styles.searchResultMeta, selected && styles.searchResultMetaSelected]}>
                        {selected ? '선택됨' : '현재 층 교실'}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : searchQuery.trim().length > 0 ? (
            <View style={styles.searchResultsCard}>
              <Text style={styles.searchResultsTitle}>검색 결과</Text>
              <Text style={styles.searchResultsEmpty}>현재 층에서 일치하는 교실이 없습니다.</Text>
            </View>
          ) : null}

          <Text style={styles.mapHelperText}>
            {statusForSelectedFloor === 'loading'
              ? '현재 위치를 계산하는 중입니다.'
              : statusForSelectedFloor === 'success' && currentPosition
                ? `현재 위치 x ${currentPosition.x.toFixed(1)}% · y ${currentPosition.y.toFixed(1)}%`
                : statusForSelectedFloor === 'error'
                  ? error ?? '현재 위치를 찾지 못했습니다.'
                  : '현재 층에서 AP를 눌러 위치를 계산할 수 있습니다.'}
          </Text>
        </View>
      </View>

      <View style={styles.mapArea}>
        <NativeFloorMap
          floorKey={selectedFloorKey}
          floor={selectedFloor}
          topObstructionHeight={topObstructionHeight}
          bottomObstructionHeight={bottomObstructionHeight}
          selectedRoomId={selectedRoomId}
          onSelectRoom={handleSelectRoom}
          accessPoints={accessPoints}
          currentPosition={currentPosition}
          showApMarkers={showApMarkers}
        />
      </View>

      <View style={[styles.bottomSheetContainer, { paddingBottom: insets.bottom }]}> 
        <PlaceDetailBottomSheet floor={selectedFloor} room={selectedRoom} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f8fbff',
  },
  topChrome: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 3,
  },
  topChromeContent: {
    gap: 10,
    paddingHorizontal: 16,
  },
  searchAndActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  searchField: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#d8e2ef',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  searchIcon: {
    color: '#94a3b8',
    fontSize: 16,
    fontWeight: '800',
  },
  searchInput: {
    color: '#0f172a',
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: 0,
  },
  clearButton: {
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  clearButtonText: {
    color: '#1d4ed8',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 18,
  },
  iconActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  iconActionButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#d8e2ef',
    borderRadius: 18,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  iconActionButtonPressed: {
    opacity: 0.86,
  },
  iconActionButtonDisabled: {
    backgroundColor: '#f8fafc',
    opacity: 0.55,
  },
  iconActionGlyph: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '800',
  },
  iconActionGlyphDisabled: {
    color: '#94a3b8',
  },
  locateButton: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
  },
  apButton: {
    backgroundColor: '#ffffff',
  },
  apButtonActive: {
    backgroundColor: '#1d4ed8',
    borderColor: '#1d4ed8',
  },
  apButtonGlyph: {
    color: '#1d4ed8',
    fontSize: 15,
  },
  apButtonGlyphActive: {
    color: '#ffffff',
  },
  debugButton: {
    backgroundColor: '#fff7ed',
    borderColor: '#fed7aa',
  },
  searchResultsCard: {
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderColor: '#d8e2ef',
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
    maxHeight: 188,
    padding: 14,
  },
  searchResultsTitle: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '800',
  },
  searchResultsList: {
    flexGrow: 0,
  },
  searchResultRow: {
    backgroundColor: '#f8fbff',
    borderColor: '#e2e8f0',
    borderRadius: 14,
    borderWidth: 1,
    gap: 2,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchResultRowSelected: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
  },
  searchResultRowPressed: {
    opacity: 0.88,
  },
  searchResultName: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '700',
  },
  searchResultNameSelected: {
    color: '#1d4ed8',
  },
  searchResultMeta: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
  },
  searchResultMetaSelected: {
    color: '#1d4ed8',
  },
  searchResultsEmpty: {
    color: '#64748b',
    fontSize: 13,
    lineHeight: 18,
  },
  mapHelperText: {
    color: '#64748b',
    fontSize: 12,
    lineHeight: 16,
  },
  mapArea: {
    ...StyleSheet.absoluteFillObject,
  },
  bottomSheetContainer: {
    left: 0,
    position: 'absolute',
    right: 0,
    bottom: 0,
  },
});
