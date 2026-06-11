import { useMemo, useRef, useState } from 'react'
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native'
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useColorScheme, useWindowDimensions, View } from 'react-native'
import type { EdgeInsets } from 'react-native-safe-area-context'

import { adaptiveAccent, adaptiveDivider, adaptiveRowBg, adaptiveSelectionBg, adaptiveSelectionBorder, adaptiveText, adaptiveTextBody, adaptiveTextPlaceholder, adaptiveTextSecondary, adaptiveTextTertiary } from '../../theme'
import type { CampusFeature } from '../../types/geojson'
import { FeedbackStateCard } from '../feedback/FeedbackStateCard'
import { GlassSurface } from '../glass' // only for results dropdown (no-double-glass respected)

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
  glassColorScheme?: 'light' | 'dark'
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
  glassColorScheme,
}: SearchBarProps) {
  const scheme = useColorScheme()
  const [fieldHeight, setFieldHeight] = useState(0)
  const inputRef = useRef<TextInput>(null)
  const { width: windowWidth } = useWindowDimensions()

  const handleFieldLayout = (event: LayoutChangeEvent) => {
    setFieldHeight(event.nativeEvent.layout.height)
  }

  const showResults = searchResults.length > 0
  const showEmpty = searchQuery.trim().length > 0 && searchResults.length === 0
  const dropdownWidth = useMemo(() => {
    const edgeInset = insets.left + insets.right + 32
    return Math.max(0, windowWidth - edgeInset)
  }, [insets.left, insets.right, windowWidth])

  return (
    <View style={[styles.container, containerStyle]} pointerEvents="box-none">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kavWrapper}>
        <View onLayout={handleFieldLayout} style={styles.searchField}>
          <Text style={[styles.searchIcon, { color: adaptiveTextTertiary(scheme) }]}>⌕</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            blurOnSubmit
            clearButtonMode="never"
            onBlur={onBlur}
            onFocus={onFocus}
            onSubmitEditing={() => Keyboard.dismiss()}
            placeholder="강의실, 교무실, 기타 장소 검색"
            placeholderTextColor={adaptiveTextPlaceholder(scheme)}
            ref={inputRef}
            returnKeyType="search"
            selectionColor={adaptiveAccent(scheme)}
            style={[styles.searchInput, { color: adaptiveText(scheme) }]}
            value={searchQuery}
            onChangeText={onSearchChange}
          />
          {searchQuery.length > 0 ? (
            <Pressable
              accessibilityLabel="검색어 지우기"
              accessibilityRole="button"
              hitSlop={HIT_SLOP}
              onPress={onClear}
              style={({ pressed }) => [
                styles.clearButton,
                { backgroundColor: scheme === 'dark' ? 'rgba(96, 165, 250, 0.25)' : 'rgba(147, 197, 253, 0.3)' },
                pressed && styles.clearButtonPressed,
              ]}
            >
              <Text style={[styles.clearButtonText, { color: adaptiveAccent(scheme) }]}>×</Text>
            </Pressable>
          ) : null}
        </View>
      </KeyboardAvoidingView>

      {showResults || showEmpty ? (
        <GlassSurface variant="search" cornerRadius={20} colorScheme={glassColorScheme} style={[styles.resultsCard, { top: fieldHeight + 8, width: dropdownWidth }]}>
          <Text style={[styles.resultsTitle, { color: adaptiveText(scheme) }]}>검색 결과</Text>
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
                      { backgroundColor: adaptiveRowBg(scheme), borderColor: adaptiveDivider(scheme) },
                      selected && { backgroundColor: adaptiveSelectionBg(scheme), borderColor: adaptiveSelectionBorder(scheme) },
                      pressed && styles.resultRowPressed,
                    ]}
                  >
                    <Text style={[styles.resultName, { color: adaptiveText(scheme) }, selected && { color: adaptiveAccent(scheme) }]} numberOfLines={1}>
                      {feature.properties.name_ko || feature.properties.name}
                    </Text>
                    <Text style={[styles.resultMeta, { color: adaptiveTextSecondary(scheme) }, selected && { color: adaptiveAccent(scheme) }]}>
                      {selected ? '선택됨' : `L${feature.properties.level} · ${feature.properties.category}`}
                    </Text>
                  </Pressable>
                )
              })}
            </ScrollView>
          ) : (
            <FeedbackStateCard title="검색 결과" message="현재 층에서 일치하는 교실이 없습니다." variant="empty" />
          )}
        </GlassSurface>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {},
  searchField: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 10,
  },
  searchIcon: {
    fontSize: 16,
    fontWeight: '800',
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: 0,
  },
  clearButton: {
    alignItems: 'center',
    borderRadius: 12,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  clearButtonPressed: {
    opacity: 0.86,
  },
  clearButtonText: {
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 18,
  },
  kavWrapper: {},
  resultsCard: {
    borderRadius: 20,
    gap: 8,
    maxHeight: 188,
    padding: 14,
    position: 'absolute',
    left: 0,
    zIndex: 20,
    elevation: 8,
  },
  resultsTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  resultsList: {
    flexGrow: 0,
  },
  resultRow: {
    borderRadius: 14,
    borderWidth: 1,
    gap: 2,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  resultRowPressed: {
    opacity: 0.88,
  },
  resultName: {
    fontSize: 14,
    fontWeight: '700',
  },
  resultMeta: {
    fontSize: 11,
    fontWeight: '600',
  },
})
