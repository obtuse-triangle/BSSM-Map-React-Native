# src/store — KNOWLEDGE BASE

**Generated:** 2026-06-25T00:00:00Z

## OVERVIEW
State management via **zustand 5**. Four public stores. Cross-screen UI uses monotonic tick counters, not boolean flags. `setUserCoordinates` is deprecated; use `setGpsCoordinates` (`mapStore.ts:60`).

## STRUCTURE
```text
src/store/
├── mapStore.ts         # useMapStore — floor, category, coordinates, camera UI ticks
├── bleLocationStore.ts # useBleLocationStore — BLE WCL scan state, beacon stats
├── routeStore.ts       # useRouteStore — multi-option route cache
├── savedPlacesStore.ts # useSavedPlacesStore — AsyncStorage persistence (schema v2)
├── index.ts            # barrel exports for public stores
└── __tests__/          # mapStore, routeStore, savedPlacesStore tests
```

## WHERE TO LOOK

| Store | File | Key state |
|---|---|---|
| `useMapStore` | `mapStore.ts` | `selectedFloorKey`, `selectedRoomId`, `hiddenCategories`, `baseLayer`, `gpsCoordinates`, `bleCoordinates`, `showAttributionTick`, `minimizeSheetsTick` |
| `useBleLocationStore` | `bleLocationStore.ts` | scan status, beacon stats, `lastFix`, `usedApCount`, confidence |
| `useRouteStore` | `routeStore.ts` | route options, selected profile, accessibility mode |
| `useSavedPlacesStore` | `savedPlacesStore.ts` | `places[]`, AsyncStorage-persisted (`SAVED_PLACES_SCHEMA_VERSION = 2`) |

## CONVENTIONS

- **zustand 5** only; standard `create<State>()(...)` store shape.
- **Barrel exports** live in `index.ts`; import public stores from there when possible.
- **Monotonic ticks** are deliberate signals:
  - `showAttributionTick` — request attribution UI from another screen.
  - `minimizeSheetsTick` — request sheet minimization from another screen.
  - Increment only; do not reset or replace with booleans.
- **Coordinate merge logic** lives in `mapStore.ts`:
  - `bleTrackingEnabled && bleCoordinates` ⇒ merged `userCoordinates` from BLE.
  - else `gpsTrackingEnabled && gpsCoordinates` ⇒ merged `userCoordinates` from GPS.
  - else `null`.
- **Persistence** uses explicit schema constants; version bumps must preserve round-trip data.

## ANTI-PATTERNS (THIS PROJECT)

1. **NEVER use `setUserCoordinates`** — deprecated; use `setGpsCoordinates` instead.
2. **NEVER treat `userCoordinates` as writable state** — it is derived by `resolveMergedCoordinates`.
3. **NEVER replace tick counters with booleans** — they are intentional cross-screen signals.
4. **NEVER bump `SAVED_PLACES_SCHEMA_VERSION` casually** — add migration/compatibility handling.
5. **NEVER add Redux/MobX/Recoil** — zustand is the chosen state layer.
6. **NEVER move derived state into components** if the store already owns the selector/derivation.

## UNIQUE STYLES

- `userCoordinatesSource` is `'gps' | 'ble' | null` and documents ownership of the merged location.
- `pendingFlyToFeatureId` / `pendingFlyToCoordinates` are camera-flight intents, not durable app state.
- `mapStore.ts` is the control-plane store: floor selection, category visibility, base layer, UI signaling.
- `routeStore.ts` caches Yen-style multi-option routing results keyed by origin/destination + profile + accessibility mode.
- `savedPlacesStore.ts` is the only persisted store; others are in-memory.

## COMMANDS

```bash
npm test -- src/store
npm test -- src/store/__tests__/savedPlacesStore.test.ts
```

## NOTES

- `mapStore.ts` owns cross-screen camera/UI coordination; prefer its actions over ad hoc screen state.
- `bleLocationStore.ts` is the BLE pipeline sink wired by provider/event handlers.
- `routeStore.ts` is for route cache and selection state, not graph building.
