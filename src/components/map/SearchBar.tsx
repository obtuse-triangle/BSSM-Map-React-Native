import { useRef, useState } from 'react'
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native'
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import type { EdgeInsets } from 'react-native-safe-area-context'

import { BG_WHITE, BORDER_DEFAULT, BORDER_LIGHT, PRIMARY_BLUE, TEXT_DARK, TEXT_LIGHT } from '../../theme'
import type { CampusFeature } from '../../types/geojson'
import { FeedbackStateCard } from '../feedback/FeedbackStateCard'

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 }

export interface SearchBarProps {
  searchQuery: string
  onSearchChange: (text: string) => void
  onClear: () => void
  searchResults: CampusFeature[]
  onResultSelect: (featureId: string) => void
  isSearchFocused: boolean
  onFocus: () => void
  onBlur: () => void
  insets: EdgeInsets
  selectedFeatureId: string | number | null
  containerStyle?: StyleProp<ViewStyle>
}

export function SearchBar({
  searchQuery,
  onSearchChange,
  onClear,
  searchResults,
  onResultSelect,
  isSearchFocused,
  onFocus,
  onBlur,
  insets,
  selectedFeatureId,
  containerStyle,
}: SearchBarProps) {
  const [fieldHeight, setFieldHeight] = useState(0)
  const inputRef = useRef<TextInput>(null)

  const handleFieldLayout = (event: LayoutChangeEvent) => {
    setFieldHeight(event.nativeEvent.layout.height)
  }

  const showResults = searchResults.length > 0
  const showEmpty = searchQuery.trim().length > 0 && searchResults.length === 0

  return (
    <View style={[styles.container, containerStyle]} pointerEvents="box-none">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kavWrapper}>
        <View onLayout={handleFieldLayout} style={styles.searchField}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            blurOnSubmit
            clearButtonMode="never"
            onBlur={onBlur}
            onFocus={onFocus}
            onSubmitEditing={() => Keyboard.dismiss()}
            placeholder="강의실, 교무실, 기타 장소 검색"
            placeholderTextColor={TEXT_LIGHT}
            ref={inputRef}
            returnKeyType="search"
            selectionColor={PRIMARY_BLUE}
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={onSearchChange}
          />
        {searchQuery.length > 0 ? (
          <Pressable
            accessibilityLabel="검색어 지우기"
            accessibilityRole="button"
            hitSlop={HIT_SLOP}
            onPress={onClear}
            style={({ pressed }) => [styles.clearButton, pressed && styles.clearButtonPressed]}
          >
            <Text style={styles.clearButtonText}>×</Text>
          </Pressable>
        ) : null}
      </View>
      </KeyboardAvoidingView>

      {showResults || showEmpty ? (
        <View style={[styles.resultsCard, { top: fieldHeight + 8 }]}>
          <Text style={styles.resultsTitle}>검색 결과</Text>
          {showResults ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
              style={styles.resultsList}
            >
              {searchResults.map((feature) => {
                const featureKey = feature.properties.id ?? String(feature.id)
                const selected = featureKey === String(selectedFeatureId)
                return (
                  <Pressable
                    key={featureKey}
                    accessibilityRole="button"
                    hitSlop={HIT_SLOP}
                    onPress={() => onResultSelect(featureKey)}
                    style={({ pressed }) => [
                      styles.resultRow,
                      selected && styles.resultRowSelected,
                      pressed && styles.resultRowPressed,
                    ]}
                  >
                    <Text style={[styles.resultName, selected && styles.resultNameSelected]} numberOfLines={1}>
                      {feature.properties.name_ko || feature.properties.name}
                    </Text>
                    <Text style={[styles.resultMeta, selected && styles.resultMetaSelected]}>
                      {selected ? '선택됨' : `L${feature.properties.level} · ${feature.properties.category}`}
                    </Text>
                  </Pressable>
                )
              })}
            </ScrollView>
          ) : (
            <FeedbackStateCard title="검색 결과" message="현재 층에서 일치하는 교실이 없습니다." variant="empty" />
          )}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {},
  searchField: {
    alignItems: 'center',
    backgroundColor: BG_WHITE,
    borderColor: BORDER_LIGHT,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  searchIcon: {
    color: TEXT_LIGHT,
    fontSize: 16,
    fontWeight: '800',
  },
  searchInput: {
    color: TEXT_DARK,
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
  clearButtonPressed: {
    opacity: 0.86,
  },
  clearButtonText: {
    color: PRIMARY_BLUE,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 18,
  },
  kavWrapper: {
    flex: 1,
  },
  resultsCard: {
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderColor: BORDER_LIGHT,
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
    maxHeight: 188,
    padding: 14,
    position: 'absolute',
    left: 0,
    right: 0,
  },
  resultsTitle: {
    color: TEXT_DARK,
    fontSize: 13,
    fontWeight: '800',
  },
  resultsList: {
    flexGrow: 0,
  },
  resultRow: {
    backgroundColor: '#f8fbff',
    borderColor: BORDER_DEFAULT,
    borderRadius: 14,
    borderWidth: 1,
    gap: 2,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  resultRowSelected: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
  },
  resultRowPressed: {
    opacity: 0.88,
  },
  resultName: {
    color: TEXT_DARK,
    fontSize: 14,
    fontWeight: '700',
  },
  resultNameSelected: {
    color: PRIMARY_BLUE,
  },
  resultMeta: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
  },
  resultMetaSelected: {
    color: PRIMARY_BLUE,
  },
})
