// Primary
export const PRIMARY_BLUE = '#1d4ed8'
export const PRIMARY_BLUE_LIGHT = '#3b82f6'

// Background
export const BG_LIGHT = '#f4f7fb'
export const BG_WHITE = '#ffffff'
export const BG_NEAR_WHITE = '#f8fafc'

// Text
export const TEXT_DARK = '#0f172a'
export const TEXT_MEDIUM = '#475569'
export const TEXT_LIGHT = '#94a3b8'

// Border/Divider
export const BORDER_DEFAULT = '#e2e8f0'
export const BORDER_LIGHT = '#d8e2ef'

// Status
export const STATUS_ERROR = '#dc2626'
export const STATUS_SUCCESS = '#16a34a'
export const STATUS_WARNING = '#f59e0b'

// ── Adaptive color helpers for dark/light mode ──────────────────────
import type { ColorSchemeName } from 'react-native'

/** Primary text, titles → #0f172a light / #f1f5f9 dark */
export function adaptiveText(scheme: ColorSchemeName): string {
  return scheme === 'dark' ? '#f1f5f9' : '#0f172a'
}

/** Secondary text, labels → #64748b light / #94a3b8 dark */
export function adaptiveTextSecondary(scheme: ColorSchemeName): string {
  return scheme === 'dark' ? '#94a3b8' : '#64748b'
}

/** Body text, descriptions → #475569 light / #cbd5e1 dark */
export function adaptiveTextBody(scheme: ColorSchemeName): string {
  return scheme === 'dark' ? '#cbd5e1' : '#475569'
}

/** Tertiary, hints → #94a3b8 light / #64748b dark */
export function adaptiveTextTertiary(scheme: ColorSchemeName): string {
  return scheme === 'dark' ? '#64748b' : '#94a3b8'
}

/** Placeholder text → #94a3b8 light / #64748b dark */
export function adaptiveTextPlaceholder(scheme: ColorSchemeName): string {
  return scheme === 'dark' ? '#64748b' : '#94a3b8'
}

/** Dividers → #e2e8f0 light / rgba(255,255,255,0.12) dark */
export function adaptiveDivider(scheme: ColorSchemeName): string {
  return scheme === 'dark' ? 'rgba(255,255,255,0.12)' : '#e2e8f0'
}

/** Accent / links → #1d4ed8 light / #60a5fa dark */
export function adaptiveAccent(scheme: ColorSchemeName): string {
  return scheme === 'dark' ? '#60a5fa' : '#1d4ed8'
}

/** Selection background → rgba(59,130,246,0.08) light / rgba(59,130,246,0.25) dark */
export function adaptiveSelectionBg(scheme: ColorSchemeName): string {
  return scheme === 'dark' ? 'rgba(59,130,246,0.25)' : 'rgba(59,130,246,0.08)'
}

/** Selection border → rgba(59,130,246,0.2) light / rgba(59,130,246,0.4) dark */
export function adaptiveSelectionBorder(scheme: ColorSchemeName): string {
  return scheme === 'dark' ? 'rgba(59,130,246,0.4)' : 'rgba(59,130,246,0.2)'
}

/** Card foreground → #ffffff light / rgba(255,255,255,0.08) dark */
export function adaptiveCardBg(scheme: ColorSchemeName): string {
  return scheme === 'dark' ? 'rgba(255,255,255,0.08)' : '#ffffff'
}

/** Near-white bg → #f8fafc light / rgba(255,255,255,0.05) dark */
export function adaptiveNearWhite(scheme: ColorSchemeName): string {
  return scheme === 'dark' ? 'rgba(255,255,255,0.05)' : '#f8fafc'
}

/** Pressed state overlay → rgba(0,0,0,0.06) light / rgba(255,255,255,0.08) dark */
export function adaptivePressed(scheme: ColorSchemeName): string {
  return scheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'
}

/** Search field bg → rgba(0,0,0,0.04) light / rgba(255,255,255,0.08) dark */
export function adaptiveFieldBg(scheme: ColorSchemeName): string {
  return scheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)'
}

/** Search field border → rgba(0,0,0,0.08) light / rgba(255,255,255,0.15) dark */
export function adaptiveFieldBorder(scheme: ColorSchemeName): string {
  return scheme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)'
}

/** Result row bg → rgba(248,251,255,0.7) light / rgba(255,255,255,0.06) dark */
export function adaptiveRowBg(scheme: ColorSchemeName): string {
  return scheme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(248, 251, 255, 0.7)'
}

/** Hidden chip bg → rgba(0,0,0,0.04) light / rgba(255,255,255,0.04) dark */
export function adaptiveChipHiddenBg(scheme: ColorSchemeName): string {
  return scheme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'
}

/** Chip/card surface bg → rgba(0,0,0,0.04) light / rgba(255,255,255,0.06) dark */
export function adaptiveChipBg(scheme: ColorSchemeName): string {
  return scheme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'
}

/** Badge text → #1d4ed8 light / #93c5fd dark */
export function adaptiveBadgeText(scheme: ColorSchemeName): string {
  return scheme === 'dark' ? '#93c5fd' : '#1d4ed8'
}
