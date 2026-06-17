import { StyleSheet } from 'react-native';
import { sheetSelectionBg } from '../../theme/sheetSemanticColors';

export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

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
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 20,
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
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 16,
  },
  floorSelectorRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
    justifyContent: 'center',
    marginBottom: 16,
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
    fontSize: 13,
    fontWeight: '600',
  },
  inputGroup: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    marginBottom: 10,
  },
  inputColumn: {
    flex: 1,
    flexDirection: 'column',
    gap: 8,
  },
  inputRow: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  destinationRow: {},
  inputDot: {
    fontSize: 12,
    fontWeight: '800',
  },
  destDot: {
    fontSize: 10,
  },
  inputText: {
    flex: 1,
    fontSize: 15,
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
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 18,
  },
  swapButton: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  swapIcon: {
    fontSize: 20,
    fontWeight: '800',
  },
  currentLocationButton: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 16,
    minHeight: 40,
  },
  currentLocationIcon: {
    fontSize: 16,
    fontWeight: '800',
  },
  currentLocationText: {
    fontSize: 14,
    fontWeight: '700',
  },
  resultsContainer: {
    borderRadius: 12,
    marginBottom: 12,
  },
  searchResultRow: {
    borderBottomWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  searchResultName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  searchResultMeta: {
    fontSize: 12,
    fontWeight: '500',
  },
  optionsContainer: {
    marginTop: 4,
  },
  optionsSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginBottom: 8,
    textTransform: 'uppercase',
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
    marginBottom: 8,
  },
  optionLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  warningBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  warningBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  optionMetricsRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: 12,
  },
  optionTime: {
    fontSize: 22,
    fontWeight: '800',
  },
  optionDistance: {
    fontSize: 14,
    fontWeight: '600',
  },
  optionErrorText: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 4,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  emptyStateText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
