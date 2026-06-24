/**
 * Layout primitives — shared spacing scale, touch-target floor, and common
 * typography sizes. These tokens exist to keep layout rhythm and typographic
 * hierarchy consistent across screens without forcing every literal through
 * a token. Use them where the value matches an existing token; leave
 * one-off component-specific dimensions as numeric literals.
 *
 * Companion to colors.ts (which owns palette + dark/light adaptive helpers).
 */

/**
 * Spacing scale — 4px baseline grid for paddings, margins, and gaps.
 *
 * Examples:
 *   SPACING.xs  ->  4   tight inline gaps (icon ↔ label)
 *   SPACING.sm  ->  8   default gap between rows / compact padding
 *   SPACING.md  -> 12   control interior padding, row gaps
 *   SPACING.lg  -> 16   section padding, screen horizontal padding
 *   SPACING.xl  -> 24   generous card interior padding
 *   SPACING.xxl -> 32   page bottom safe padding, large separators
 */
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const

/**
 * Apple HIG minimum recommended touch target size, in points.
 * Android Material recommends 48dp; 44 is the cross-platform safe floor.
 * Reference this constant when designing interactive controls — visual size
 * + hitSlop should total at least TOUCH_TARGET_MIN for the smallest targets.
 */
export const TOUCH_TARGET_MIN = 44

/**
 * Common typography sizes — body, heading, and display tiers.
 *
 * Token → approximate role:
 *   FONT_SIZE.xs       -> 11  small caps labels, helper hints
 *   FONT_SIZE.sm       -> 12  meta text, badges
 *   FONT_SIZE.md       -> 13  body small / section titles
 *   FONT_SIZE.lg       -> 14  body default
 *   FONT_SIZE.xl       -> 15  body emphasis / form inputs
 *   FONT_SIZE.xxl      -> 16  sub-headings, primary button labels
 *   FONT_SIZE.xxxl     -> 18  large controls / dialog titles
 *   FONT_SIZE.title    -> 20  screen titles
 *   FONT_SIZE.display  -> 22  hero metric (e.g., route time)
 */
export const FONT_SIZE = {
  xs: 11,
  sm: 12,
  md: 13,
  lg: 14,
  xl: 15,
  xxl: 16,
  xxxl: 18,
  title: 20,
  display: 22,
} as const