# SRC KNOWLEDGE BASE

**Generated:** 2026-06-24T23:33:55Z

## OVERVIEW
App code root for the Expo SDK 56 + React Native 0.81.5 monorepo. Most app logic lives under `src/components/map`, `src/services/{location,routing}`, `src/store`, and `src/screens`.

## STRUCTURE
```
src/
├── components/
│   ├── common/         # Button, Card, ErrorBoundary, LoadingOverlay, Text (barrel)
│   ├── feedback/       # FeedbackStateCard, ToastCard (barrel)
│   ├── glass/          # GlassSurface — Liquid Glass UI primitive (barrel)
│   └── map/            # CampusMap, BleWclStatusCard, markers (see AGENTS.md inside)
├── constants/          # bssmFloorMap, bleAccessPoints, campusBounds, mapStyles, fusionConfig, bleConfig, mapFilter
├── data/               # Committed routing GeoJSON, .mbtiles, .geojson.d.ts shims, validate-geojson.ts
├── dev/                # androidBleHarness.ts — on-device Android BLE scanner harness
├── hooks/              # usePermissions, useSearchBar, useToast (barrel)
├── navigation/         # RootNavigator (native stack) + RootStackParamList
├── screens/            # MapScreen, sheet screens (see AGENTS.md inside)
├── services/
│   ├── calibration/    # iosCalibration.ts — iOS lat/lng ↔ map-percent helpers
│   ├── location/       # BLE WCL, dead reckoning, particle fusion (see AGENTS.md inside)
│   ├── routing/        # Graph + pathfinder + multi-option routing (see AGENTS.md inside)
│   └── rtt/            # mockRttScanner, rttTypes — legacy RTT stubs
├── store/              # zustand stores (see AGENTS.md inside)
├── theme/              # colors, spacing, sheetSemanticColors (barrel)
├── types/              # Domain types (barrel)
└── utils/              # coordinateTransform, accessibilityLabels, cameraTarget, geoJsonHelpers, etc.
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Map UI | `src/components/map/` | CampusMap, BleWclStatusCard, markers, internal map primitives |
| Indoor location | `src/services/location/` | BLE WCL, RTT, fusion, calibration-adjacent logic |
| Indoor routing | `src/services/routing/` | Multi-option pathfinding, route profiles, graph construction |
| State | `src/store/` | App stores and selectors; barrel in `src/store/index.ts` |
| Sheets | `src/screens/` | MapSheetScreen, PlaceDetailSheetScreen, RoutePlanScreen |
| Coordinate utils | `src/utils/coordinateTransform.ts` | map-percent ↔ EPSG:5183 ↔ WGS84 via proj4 |
| Map data | `src/constants/`, `src/data/` | Floor map, access points, routing datasets, shims |

## CONVENTIONS

- **TypeScript strict** with `allowArbitraryExtensions`; tests are excluded from `tsc`.
- **No path aliases.** Use relative imports only.
- **Barrel files** expose public APIs from `*/index.ts`.
- **Test layout**: `__tests__/` sibling dirs; use `*.test.ts` and `*.test.tsx`.
- **Module privacy**: complex logic may live in `*Internal/` subdirs; import via the parent module.
- **No source-root `index.ts`.** Root behavior lives outside `src/`.
- **Stores are zustand 5**; no Redux/Recoil/MobX.
- **Reanimated v4 worklets** rely on the root Babel plugin already configured.

## ANTI-PATTERNS (THIS PROJECT)

1. **NEVER modify the baseline RSSI weight formula** in `src/services/location/bleWeightedCentroid.ts`.
2. **NEVER fold `accessibilityPenalty` into `timeSeconds` or `effortMetersEquivalent`.**
3. **NEVER use `setUserCoordinates`**; it is deprecated. Use `setGpsCoordinates`.
4. **NEVER treat BLE WCL as background or Android-capable** — it is foreground-only, iOS-only.
5. **NEVER conflate the two coordinate pipelines**: legacy RTT/SVG uses map-percent; BLE WCL uses WGS84.
6. **NEVER assume iOS Core Location is accurate indoors** without calibration/anchors.

## UNIQUE STYLES

- Two parallel coordinate pipelines: map-percent (legacy RTT/SVG) and WGS84 (BLE WCL).
- Routing is a multi-option engine with profiles `fastest` / `shortest` / `easiest`; accessibility mode is orthogonal.
- Cross-screen UI signals use monotonic tick counters (`showAttributionTick`, `minimizeSheetsTick`) in `mapStore`.
- Internal subdirs hide complex logic; parent modules are the public surface.

## COMMANDS

```bash
# Type check (from root)
npx tsc --noEmit

# Tests
npm test
npm test -- src/services/routing

# Regenerate routing data (run when bssmFloorMap.ts changes)
node scripts/generate-walkable-areas.js
node scripts/generate-routing-connectors.js
node scripts/validate-routing-data.js
```

## NOTES

- `src/screens/MapSheetScreen.tsx`, `src/screens/PlaceDetailSheetScreen.tsx`, `src/screens/RoutePlanScreen.tsx`, `src/constants/bssmFloorMap.ts`, `src/services/routing/routeOptions.ts`, and `src/store/bleLocationStore.ts` are the largest hotspot files.
- `src/dev/` is for on-device harness code and should not be mixed into app screens.
- `src/data/` contains committed routing assets plus the offline mbtiles tile; updates require regeneration via scripts.
- `src/services/calibration/iosCalibration.ts` and `src/utils/coordinateTransform.ts` are the key coordinate helpers.
- **No `src/index.ts`** — the app entrypoint is outside the source tree.
