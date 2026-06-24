import { StyleSheet } from 'react-native';
import { sheetSelectionBg } from '../../theme/sheetSemanticColors';
import { FONT_SIZE, SPACING } from '../../theme';

export const HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 };

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  sheet: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
  },
  headerTitle: {
    fontSize: FONT_SIZE.title,
    fontWeight: '700',
  },
  closeButton: {
    alignItems: 'center',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  closeButtonText: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '700',
    lineHeight: FONT_SIZE.xxl,
  },
  floorSelectorRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  floorSelectorButton: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 999,
    minWidth: 36,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  floorSelectorButtonActive: {
    backgroundColor: sheetSelectionBg,
  },
  floorSelectorButtonText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
  },
  inputGroup: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: SPACING.sm,
    marginBottom: 10,
  },
  inputColumn: {
    flex: 1,
    flexDirection: 'column',
    gap: SPACING.sm,
  },
  inputRow: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 46,
    paddingHorizontal: SPACING.md,
  },
  destinationRow: {},
  inputDot: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
  },
  destDot: {
    fontSize: 10,
  },
  inputText: {
    flex: 1,
    fontSize: FONT_SIZE.xl,
    fontWeight: '600',
    paddingVertical: 0,
  },
  clearInline: {
    alignItems: 'center',
    borderRadius: 12,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  clearInlineText: {
    fontSize: FONT_SIZE.xxxl,
    fontWeight: '800',
    lineHeight: FONT_SIZE.xxxl,
  },
  swapButton: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
  },
  swapIcon: {
    fontSize: FONT_SIZE.title,
    fontWeight: '800',
  },
  currentLocationButton: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: SPACING.sm,
    justifyContent: 'center',
    marginBottom: SPACING.lg,
    minHeight: 40,
  },
  currentLocationIcon: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '800',
  },
  currentLocationText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
  },
  resultsContainer: {
    borderRadius: 12,
    marginBottom: SPACING.md,
  },
  searchResultRow: {
    borderBottomWidth: 1,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  searchResultName: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '600',
    marginBottom: 2,
  },
  searchResultMeta: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '500',
  },
  optionsContainer: {
    marginTop: SPACING.xs,
  },
  optionsSectionTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
  },
  sortTabRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: SPACING.md,
  },
  sortTab: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  sortTabLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  optionCard: {
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  optionHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  optionLabelGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    flex: 1,
    gap: SPACING.sm,
  },
  routeSwatch: {
    borderRadius: 4,
    height: 14,
    width: 4,
  },
  optionLabel: {
    flex: 1,
    fontSize: FONT_SIZE.xxl,
    fontWeight: '700',
  },
  warningBadge: {
    borderRadius: 8,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
  },
  warningBadgeText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  optionMetricsRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: SPACING.md,
  },
  optionTime: {
    fontSize: FONT_SIZE.display,
    fontWeight: '800',
  },
  optionDistance: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
  },
  optionErrorText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '500',
    marginTop: SPACING.xs,
  },
  tradeoffRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: 6,
  },
  tradeoffText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xl,
  },
  emptyStateText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    textAlign: 'center',
  },
});
