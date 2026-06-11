import { useRef } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, useColorScheme, View } from 'react-native'

import { adaptiveAccent, adaptiveText, adaptiveTextPlaceholder, adaptiveTextTertiary } from '../../theme'
import { sheetAccent, sheetLabel, sheetTertiaryLabel } from '../../theme/sheetSemanticColors'

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 }

export interface SearchBarProps {
  searchQuery: string
  onSearchChange: (text: string) => void
  onClear: () => void
  onFocus: () => void
  onBlur: () => void
  containerStyle?: StyleProp<ViewStyle>
  useNativeSheetColors?: boolean
}

export function SearchBar({
  searchQuery,
  onSearchChange,
  onClear,
  onFocus,
  onBlur,
  containerStyle,
  useNativeSheetColors = false,
}: SearchBarProps) {
  const scheme = useColorScheme()
  const inputRef = useRef<TextInput>(null)

  const inputTextColor = useNativeSheetColors ? sheetLabel : adaptiveText(scheme)
  const placeholderColor = useNativeSheetColors ? sheetTertiaryLabel : adaptiveTextPlaceholder(scheme)
  const iconColor = useNativeSheetColors ? sheetTertiaryLabel : adaptiveTextTertiary(scheme)
  const accentColor = useNativeSheetColors ? sheetAccent(scheme) : adaptiveAccent(scheme)
  const clearButtonBg = scheme === 'dark' ? 'rgba(96, 165, 250, 0.25)' : 'rgba(147, 197, 253, 0.3)'

  return (
    <View style={[styles.container, containerStyle]} pointerEvents="box-none">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kavWrapper}>
        <View style={styles.searchField}>
          <Text style={[styles.searchIcon, { color: iconColor }]}>⌕</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            blurOnSubmit
            clearButtonMode="never"
            onBlur={onBlur}
            onFocus={onFocus}
            onSubmitEditing={() => Keyboard.dismiss()}
            placeholder="강의실, 교무실, 기타 장소 검색"
            placeholderTextColor={placeholderColor}
            ref={inputRef}
            returnKeyType="search"
            selectionColor={accentColor}
            style={[styles.searchInput, { color: inputTextColor }]}
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
                { backgroundColor: clearButtonBg },
                pressed && styles.clearButtonPressed,
              ]}
            >
              <Text style={[styles.clearButtonText, { color: accentColor }]}>×</Text>
            </Pressable>
          ) : null}
        </View>
      </KeyboardAvoidingView>
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
})
