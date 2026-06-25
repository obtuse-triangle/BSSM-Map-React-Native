# src/components/map — KNOWLEDGE BASE

**Generated:** 2026-06-25T00:00:00Z

## OVERVIEW
Map UI directory: `CampusMap` MapLibre shell, AP/position markers, BLE WCL status card, route overlay, saved pins, search, zoom, and status affordances. `src/components/map/index.ts` is the public barrel.

Map data is the source of truth; MapLibre layer/source updates bypass React for perf.

## STRUCTURE
```
src/components/map/
├── CampusMap.tsx                   # MapLibre wrapper; delegates internals to campusMapInternal/
├── CampusBleMarker.tsx             # BLE WCL marker (WGS84)
├── CampusApMarkers.tsx             # AP visualization layer
├── UserPositionMarker.tsx          # Unified position marker
├── AccuracyCircle.tsx              # Accuracy halo
├── RoomBlock.tsx                   # Floor-plan room block rendering
├── FloorSelector.tsx               # Floor picker UI
├── SearchBar.tsx                   # Search affordance
├── ZoomControls.tsx                # Zoom +/- buttons
├── RoutePathLayer.tsx              # Route polyline rendering
├── SavedPinsLayer.tsx              # Saved places pins
├── BleWclStatusCard.tsx            # BLE pipeline status card
├── BleActionButtons.tsx            # BLE scan/stop actions
├── BleBeaconStatsTable.tsx         # Beacon stats table
├── bleWclFormatters.ts             # BLE formatting helpers
├── apVisualization.ts              # AP_VISUALIZATION constants
├── campusOverlayPaints.ts          # Overlay paint configs
├── routeLayerData.ts               # Route layer data builders
├── __tests__/                      # Component invariants and data tests
├── bleWclStatusCard/               # BleWclStatusCard composition
│   ├── BleHeader.tsx
│   ├── BleRealtimeSection.tsx
│   ├── BleBatchDetails.tsx
│   ├── BleDeadReckoningSection.tsx
│   ├── BleFusionSection.tsx
│   ├── BleDurationControl.tsx
│   ├── BleErrorBlock.tsx
│   ├── BleStatusIndicators.tsx
│   ├── BleStopButton.tsx
│   └── sharedStyles.ts
└── campusMapInternal/              # Hidden MapLibre internals
    ├── campusMapConstants.ts
    ├── layerFilters.ts
    ├── mapInteractions.ts
    └── tileAssets.ts
```

## WHERE TO LOOK
| Task | Location |
|------|----------|
| Map shell / public surface | `CampusMap.tsx` |
| MapLibre setup details | `campusMapInternal/{campusMapConstants,tileAssets,layerFilters,mapInteractions}.ts` |
| BLE status card root | `BleWclStatusCard.tsx` |
| BLE status card sublayout | `bleWclStatusCard/*.tsx` + `sharedStyles.ts` |
| AP marker constants | `apVisualization.ts` |
| AP marker rendering | `CampusApMarkers.tsx` |
| Route overlay data | `routeLayerData.ts` |
| Route overlay rendering | `RoutePathLayer.tsx` |
| Saved pins | `SavedPinsLayer.tsx` |
| Position markers | `CampusBleMarker.tsx`, `UserPositionMarker.tsx`, `AccuracyCircle.tsx` |
| Invariant tests | `__tests__/apVisualization.test.ts`, `__tests__/BleWclStatusCard.invariants.test.ts`, `__tests__/campusOverlayPaints.test.ts`, `__tests__/routeLayerData.test.ts` |

## CONVENTIONS
- `showAttributionTick` / `minimizeSheetsTick` are monotonic signals from `mapStore`; do not replace with booleans.
- `campusMapInternal/` owns complex layer/filter/tile behavior; keep `CampusMap.tsx` as the thin public wrapper.
- `bleWclStatusCard/` splits the card into 9 sub-components plus `sharedStyles.ts`; preserve that boundary.
- `routeLayerData.ts` stays data-only; `RoutePathLayer.tsx` stays render-only.
- `apVisualization.ts` drives AP marker color/size behavior; treat edits as behavior changes.
- `CampusBleMarker.tsx` is WGS84 BLE WCL; `CampusApMarkers.tsx` is AP visualization and follows the AP pipeline.

## ANTI-PATTERNS
1. Do not mirror MapLibre state into React state.
2. Do not add new MapLibre setup logic directly into `CampusMap.tsx`; extend `campusMapInternal/`.
3. Do not inline ad hoc styles inside `bleWclStatusCard/*`; use `sharedStyles.ts`.
4. Do not weaken the invariants covered by `__tests__/` when changing paints or layer data.

## UNIQUE STYLES
- `CampusMapHandle` exposes imperative camera / layer controls from `CampusMap.tsx`.
- `BleWclStatusCard` is the canonical “what is BLE doing right now” surface; its subcomponents are deliberately separate.
- `CampusApMarkers` and `CampusBleMarker` encode different coordinate sources; pick the right one by data provenance.
- `AP_VISUALIZATION` changes should be checked against `__tests__/apVisualization.test.ts`.

## COMMANDS
```bash
npm test -- src/components/map
npm test -- src/components/map/__tests__/BleWclStatusCard.invariants.test.ts
```

## NOTES
- Keep `bleWclStatusCard/*` small and composable; the root card should orchestrate, not inline layout.
- `campusOverlayPaints.ts` and `routeLayerData.ts` are paired with snapshot/invariant-style tests; update both together.
- Prefer data-source changes in layer helpers over React re-renders when adjusting map visuals.
