# src/screens KNOWLEDGE BASE

**Generated:** 2026-06-25T00:00:00Z

## OVERVIEW
React Native screens for the app shell and the three sheet flows. Three screens are formSheet-presented, `MapSheet`, `PlaceDetailSheet`, `RoutePlan`. One is full-screen, `Map`. The sheet setup lives in `src/navigation/RootNavigator.tsx`, not inside the screen files.

## STRUCTURE
```text
src/screens/
├── MapScreen.tsx               # Full-screen map, entry after boot
├── MapSheetScreen.tsx          # formSheet, main bottom sheet UI, largest
├── PlaceDetailSheetScreen.tsx  # formSheet, place detail bottom sheet
├── RoutePlanScreen.tsx         # formSheet, route planning bottom sheet
├── mapSheet/                   # Panels for MapSheetScreen
│   ├── SavedPlacesList.tsx
│   ├── SearchResultsList.tsx
│   └── SettingsPanel.tsx
├── routePlan/                  # Panels for RoutePlanScreen
│   ├── FloorSelectorRow.tsx
│   ├── RouteOptionCard.tsx
│   ├── SearchResultList.tsx
│   └── routePlanStyles.ts
└── __tests__/
    └── MapSheetScreen.floorSelector.test.ts
```

## WHERE TO LOOK
| Screen | File | Presentation |
|--------|------|--------------|
| Map | `src/screens/MapScreen.tsx` | full-screen, boot entry |
| Map Sheet | `src/screens/MapSheetScreen.tsx` | formSheet |
| Place Detail | `src/screens/PlaceDetailSheetScreen.tsx` | formSheet |
| Route Plan | `src/screens/RoutePlanScreen.tsx` | formSheet |

## CONVENTIONS
- FormSheet config belongs in `src/navigation/RootNavigator.tsx`, using `sheetAllowedDetents`, `sheetInitialDetentIndex`, `sheetGrabberVisible`, `sheetLargestUndimmedDetentIndex`, `gestureEnabled`.
- Cross-screen signals use monotonic ticks from `src/store/mapStore.ts`, not booleans.
- `showAttributionTick` comes from `MapScreen.tsx` and tells `MapSheetScreen.tsx` to reveal attribution.
- `minimizeSheetsTick` comes from `MapSheetScreen.tsx` and asks other screens to collapse.
- `src/screens/mapSheet/` holds panels consumed by `MapSheetScreen.tsx`.
- `src/screens/routePlan/` holds panels consumed by `RoutePlanScreen.tsx`.
- Shared sheet styling stays in the screen file plus `routePlanStyles.ts` for route plan only.

## ANTI-PATTERNS
1. Never move formSheet config into `MapSheetScreen.tsx`, `PlaceDetailSheetScreen.tsx`, or `RoutePlanScreen.tsx`.
2. Never replace tick-based signaling with boolean UI flags.
3. Never extract a panel from `MapSheetScreen.tsx` or `RoutePlanScreen.tsx` without keeping the import path clear and local.

## UNIQUE STYLES
- `MapSheetScreen.tsx` uses denser detents, `[0.06, 0.12, 0.5, 1.0]`.
- `PlaceDetailSheetScreen.tsx` and `RoutePlanScreen.tsx` use `[0.09, 0.3, 0.55, 1.0]`.
- `sheetInitialDetentIndex` is `1` for all sheet routes.
- `sheetGrabberVisible` is `true` for all sheet routes.
- `sheetLargestUndimmedDetentIndex` is `3` for all sheet routes.
- `MapSheetScreen.tsx` sets `gestureEnabled: false`.
- `RootNavigator.tsx` declares the four routes: `Map`, `MapSheet`, `PlaceDetailSheet`, `RoutePlan`.

## COMMANDS
```bash
npm test -- src/screens
npm test -- src/screens/__tests__/MapSheetScreen.floorSelector.test.ts
```

## NOTES
- Largest files are `src/screens/MapSheetScreen.tsx` at 767 lines, `src/screens/PlaceDetailSheetScreen.tsx` at 608 lines, and `src/screens/RoutePlanScreen.tsx` at 522 lines.
- `MapScreen.tsx` is the app entry screen after boot, not the home screen.
- `src/screens/mapSheet/` is still imported piecemeal, not via a barrel.
- `routePlanStyles.ts` keeps route plan styling local instead of spreading theme overrides.
