import { Platform, PlatformColor, type ColorSchemeName, type ColorValue } from 'react-native'

export const sheetLabel: ColorValue = Platform.OS === 'ios' ? PlatformColor('label') : '#0f172a'
export const sheetSecondaryLabel: ColorValue = Platform.OS === 'ios' ? PlatformColor('secondaryLabel') : '#475569'
export const sheetTertiaryLabel: ColorValue = Platform.OS === 'ios' ? PlatformColor('tertiaryLabel') : '#94a3b8'
export const sheetSeparator: ColorValue = Platform.OS === 'ios' ? PlatformColor('separator') : '#e2e8f0'
export const sheetSystemFill: ColorValue = Platform.OS === 'ios' ? PlatformColor('systemFill') : 'rgba(0,0,0,0.06)'
export const sheetSecondarySystemFill: ColorValue = Platform.OS === 'ios' ? PlatformColor('secondarySystemFill') : 'rgba(0,0,0,0.03)'
export const sheetSelectionBg: ColorValue = Platform.OS === 'ios' ? PlatformColor('systemFill') : 'rgba(59,130,246,0.08)'
export const sheetAccent = (scheme: ColorSchemeName = 'light') => (scheme === 'dark' ? '#60a5fa' : '#1d4ed8')
