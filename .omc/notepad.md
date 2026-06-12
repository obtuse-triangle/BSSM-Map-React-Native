# Notepad
<!-- Auto-managed by OMC. Manual edits preserved in MANUAL section. -->

## Priority Context
<!-- ALWAYS loaded. Keep under 500 chars. Critical discoveries only. -->

## Working Memory
<!-- Session notes. Auto-pruned after 7 days. -->
### 2026-05-20 07:53
Switched school-map-react-native to pnpm ownership: added .npmrc with node-linker=hoisted, removed package-lock.json, ran pnpm install, verified pnpm list shows react-native/react-native-gesture-handler/react-native-worklets at root, TypeScript check passed, and Expo export passed for both ios and android from the pnpm-installed tree.
### 2026-05-20 11:04
NativeFloorMap update: removed pan pointer-count gating, kept pinch+pan simultaneous, added viewport overlay buttons (+ / − / reset) inside the map viewport, preserved floor-change reset, and kept all room/AP/current-position/accuracy layers in one transformed canvas. Validation passed: lsp diagnostics clean on src/components/map/NativeFloorMap.tsx; pnpm exec tsc --noEmit passed. Noted that transform order remains scale -> translate to preserve existing gesture math; JS zoom buttons clamp using shared scale bounds (1..3.5) and centered reset behavior.
### 2026-05-20 11:23
Reworked `src/components/map/PlaceDetailBottomSheet.tsx` to remove the expand/collapse interaction entirely. The panel is now a static bottom sheet with a visual handle, selected room title, a floor pill, and compact room metadata rows. This avoids the previous clickable-toggle feel while keeping room name, floor, and area info visible.
### 2026-05-20 11:32
Updated NativeFloorMap to use a landscape canvas sized from viewport height with MAP_ASPECT_RATIO=1.65, widened pan bounds with slack, stronger zoom presets (maxScale 5, zoomStep 1.5), and 1:1-feeling pan math by storing translation in content space and dividing drag deltas by scale. RoomBlock now uses near-square corners, smaller padding, single-line auto-scaling labels, and slightly larger label typography for readability.
### 2026-05-24 10:43
F2 Code Quality Review completed. Verdict: APPROVE with 3 medium issues, 2 low issues found. No anti-patterns (no `any`, no `console.log`, no `@ts-ignore`, no force unwraps). See full review output for details.
### 2026-06-01 15:11
Added src/utils/buildingDetection.ts with ray-casting point-in-polygon helpers for CampusGeoJSON. isPointInBuilding and getDetectedBuildingId iterate Polygon features and use the exterior ring at coordinates[0]; getFloorFromAltitude always returns null with a JSDoc note explaining GPS altitude unreliability (~±10m vs ~3m floors). TypeScript verification passed with npx tsc --noEmit.
### 2026-06-01 15:29
CampusMap work completed: MapLibre v11 uses `afterId` instead of `aboveLayerID` and `minzoom` instead of `minZoomLevel`; `queryRenderedFeatures` works via `MapRef` and screen-point coordinates from `event.nativeEvent.screenPointX/Y`. Filters needed a cast to `FilterSpecification` for TS in this codebase.
### 2026-06-12 00:57
## GPS/BLE Independent Toggles — Task 1 Complete

### New Types Added to mapStore.ts
- `LocationSource = 'gps' | 'ble'` (exported)
- `SourceCoordinates = { longitude: number; latitude: number } | null` (exported)

### New State Fields (defaults)
- `gpsTrackingEnabled` (false), `bleTrackingEnabled` (false), `userCoordinatesSource` (null), `gpsCoordinates` (null), `bleCoordinates` (null)

### New Actions
- `setGpsTrackingEnabled(enabled)` — disables clear gpsCoordinates
- `setBleTrackingEnabled(enabled)` — disables clear bleCoordinates
- `setGpsCoordinates(coords)`, `setBleCoordinates(coords)` — set raw coords
- `clearLocationSource(source)` — clear source coords

### Merge Helper: `resolveMergedCoordinates`
Priority BLE > GPS > null. Recomputes `userCoordinates` and `userCoordinatesSource` deterministically.

### Deprecated
- `setUserCoordinates(coords)` @deprecated — delegates to setGpsCoordinates

### Zustand Pattern
- `create<MapStoreState>()((set, get) => ({...}))` — actions use both `set({})` and `set((state) => ({}))`


## 2026-05-20 07:53
Switched school-map-react-native to pnpm ownership: added .npmrc with node-linker=hoisted, removed package-lock.json, ran pnpm install, verified pnpm list shows react-native/react-native-gesture-handler/react-native-worklets at root, TypeScript check passed, and Expo export passed for both ios and android from the pnpm-installed tree.
### 2026-05-20 11:04
NativeFloorMap update: removed pan pointer-count gating, kept pinch+pan simultaneous, added viewport overlay buttons (+ / − / reset) inside the map viewport, preserved floor-change reset, and kept all room/AP/current-position/accuracy layers in one transformed canvas. Validation passed: lsp diagnostics clean on src/components/map/NativeFloorMap.tsx; pnpm exec tsc --noEmit passed. Noted that transform order remains scale -> translate to preserve existing gesture math; JS zoom buttons clamp using shared scale bounds (1..3.5) and centered reset behavior.
### 2026-05-20 11:23
Reworked `src/components/map/PlaceDetailBottomSheet.tsx` to remove the expand/collapse interaction entirely. The panel is now a static bottom sheet with a visual handle, selected room title, a floor pill, and compact room metadata rows. This avoids the previous clickable-toggle feel while keeping room name, floor, and area info visible.
### 2026-05-20 11:32
Updated NativeFloorMap to use a landscape canvas sized from viewport height with MAP_ASPECT_RATIO=1.65, widened pan bounds with slack, stronger zoom presets (maxScale 5, zoomStep 1.5), and 1:1-feeling pan math by storing translation in content space and dividing drag deltas by scale. RoomBlock now uses near-square corners, smaller padding, single-line auto-scaling labels, and slightly larger label typography for readability.
### 2026-05-24 10:43
F2 Code Quality Review completed. Verdict: APPROVE with 3 medium issues, 2 low issues found. No anti-patterns (no `any`, no `console.log`, no `@ts-ignore`, no force unwraps). See full review output for details.
### 2026-06-01 15:11
Added src/utils/buildingDetection.ts with ray-casting point-in-polygon helpers for CampusGeoJSON. isPointInBuilding and getDetectedBuildingId iterate Polygon features and use the exterior ring at coordinates[0]; getFloorFromAltitude always returns null with a JSDoc note explaining GPS altitude unreliability (~±10m vs ~3m floors). TypeScript verification passed with npx tsc --noEmit.
### 2026-06-01 15:29
CampusMap work completed: MapLibre v11 uses `afterId` instead of `aboveLayerID` and `minzoom` instead of `minZoomLevel`; `queryRenderedFeatures` works via `MapRef` and screen-point coordinates from `event.nativeEvent.screenPointX/Y`. Filters needed a cast to `FilterSpecification` for TS in this codebase.


## 2026-05-20 07:53
Switched school-map-react-native to pnpm ownership: added .npmrc with node-linker=hoisted, removed package-lock.json, ran pnpm install, verified pnpm list shows react-native/react-native-gesture-handler/react-native-worklets at root, TypeScript check passed, and Expo export passed for both ios and android from the pnpm-installed tree.
### 2026-05-20 11:04
NativeFloorMap update: removed pan pointer-count gating, kept pinch+pan simultaneous, added viewport overlay buttons (+ / − / reset) inside the map viewport, preserved floor-change reset, and kept all room/AP/current-position/accuracy layers in one transformed canvas. Validation passed: lsp diagnostics clean on src/components/map/NativeFloorMap.tsx; pnpm exec tsc --noEmit passed. Noted that transform order remains scale -> translate to preserve existing gesture math; JS zoom buttons clamp using shared scale bounds (1..3.5) and centered reset behavior.
### 2026-05-20 11:23
Reworked `src/components/map/PlaceDetailBottomSheet.tsx` to remove the expand/collapse interaction entirely. The panel is now a static bottom sheet with a visual handle, selected room title, a floor pill, and compact room metadata rows. This avoids the previous clickable-toggle feel while keeping room name, floor, and area info visible.
### 2026-05-20 11:32
Updated NativeFloorMap to use a landscape canvas sized from viewport height with MAP_ASPECT_RATIO=1.65, widened pan bounds with slack, stronger zoom presets (maxScale 5, zoomStep 1.5), and 1:1-feeling pan math by storing translation in content space and dividing drag deltas by scale. RoomBlock now uses near-square corners, smaller padding, single-line auto-scaling labels, and slightly larger label typography for readability.
### 2026-05-24 10:43
F2 Code Quality Review completed. Verdict: APPROVE with 3 medium issues, 2 low issues found. No anti-patterns (no `any`, no `console.log`, no `@ts-ignore`, no force unwraps). See full review output for details.
### 2026-06-01 15:11
Added src/utils/buildingDetection.ts with ray-casting point-in-polygon helpers for CampusGeoJSON. isPointInBuilding and getDetectedBuildingId iterate Polygon features and use the exterior ring at coordinates[0]; getFloorFromAltitude always returns null with a JSDoc note explaining GPS altitude unreliability (~±10m vs ~3m floors). TypeScript verification passed with npx tsc --noEmit.


## 2026-05-20 07:53
Switched school-map-react-native to pnpm ownership: added .npmrc with node-linker=hoisted, removed package-lock.json, ran pnpm install, verified pnpm list shows react-native/react-native-gesture-handler/react-native-worklets at root, TypeScript check passed, and Expo export passed for both ios and android from the pnpm-installed tree.
### 2026-05-20 11:04
NativeFloorMap update: removed pan pointer-count gating, kept pinch+pan simultaneous, added viewport overlay buttons (+ / − / reset) inside the map viewport, preserved floor-change reset, and kept all room/AP/current-position/accuracy layers in one transformed canvas. Validation passed: lsp diagnostics clean on src/components/map/NativeFloorMap.tsx; pnpm exec tsc --noEmit passed. Noted that transform order remains scale -> translate to preserve existing gesture math; JS zoom buttons clamp using shared scale bounds (1..3.5) and centered reset behavior.
### 2026-05-20 11:23
Reworked `src/components/map/PlaceDetailBottomSheet.tsx` to remove the expand/collapse interaction entirely. The panel is now a static bottom sheet with a visual handle, selected room title, a floor pill, and compact room metadata rows. This avoids the previous clickable-toggle feel while keeping room name, floor, and area info visible.
### 2026-05-20 11:32
Updated NativeFloorMap to use a landscape canvas sized from viewport height with MAP_ASPECT_RATIO=1.65, widened pan bounds with slack, stronger zoom presets (maxScale 5, zoomStep 1.5), and 1:1-feeling pan math by storing translation in content space and dividing drag deltas by scale. RoomBlock now uses near-square corners, smaller padding, single-line auto-scaling labels, and slightly larger label typography for readability.
### 2026-05-24 10:43
F2 Code Quality Review completed. Verdict: APPROVE with 3 medium issues, 2 low issues found. No anti-patterns (no `any`, no `console.log`, no `@ts-ignore`, no force unwraps). See full review output for details.


## 2026-05-20 07:53
Switched school-map-react-native to pnpm ownership: added .npmrc with node-linker=hoisted, removed package-lock.json, ran pnpm install, verified pnpm list shows react-native/react-native-gesture-handler/react-native-worklets at root, TypeScript check passed, and Expo export passed for both ios and android from the pnpm-installed tree.
### 2026-05-20 11:04
NativeFloorMap update: removed pan pointer-count gating, kept pinch+pan simultaneous, added viewport overlay buttons (+ / − / reset) inside the map viewport, preserved floor-change reset, and kept all room/AP/current-position/accuracy layers in one transformed canvas. Validation passed: lsp diagnostics clean on src/components/map/NativeFloorMap.tsx; pnpm exec tsc --noEmit passed. Noted that transform order remains scale -> translate to preserve existing gesture math; JS zoom buttons clamp using shared scale bounds (1..3.5) and centered reset behavior.
### 2026-05-20 11:23
Reworked `src/components/map/PlaceDetailBottomSheet.tsx` to remove the expand/collapse interaction entirely. The panel is now a static bottom sheet with a visual handle, selected room title, a floor pill, and compact room metadata rows. This avoids the previous clickable-toggle feel while keeping room name, floor, and area info visible.
### 2026-05-20 11:32
Updated NativeFloorMap to use a landscape canvas sized from viewport height with MAP_ASPECT_RATIO=1.65, widened pan bounds with slack, stronger zoom presets (maxScale 5, zoomStep 1.5), and 1:1-feeling pan math by storing translation in content space and dividing drag deltas by scale. RoomBlock now uses near-square corners, smaller padding, single-line auto-scaling labels, and slightly larger label typography for readability.


## 2026-05-20 07:53
Switched school-map-react-native to pnpm ownership: added .npmrc with node-linker=hoisted, removed package-lock.json, ran pnpm install, verified pnpm list shows react-native/react-native-gesture-handler/react-native-worklets at root, TypeScript check passed, and Expo export passed for both ios and android from the pnpm-installed tree.
### 2026-05-20 11:04
NativeFloorMap update: removed pan pointer-count gating, kept pinch+pan simultaneous, added viewport overlay buttons (+ / − / reset) inside the map viewport, preserved floor-change reset, and kept all room/AP/current-position/accuracy layers in one transformed canvas. Validation passed: lsp diagnostics clean on src/components/map/NativeFloorMap.tsx; pnpm exec tsc --noEmit passed. Noted that transform order remains scale -> translate to preserve existing gesture math; JS zoom buttons clamp using shared scale bounds (1..3.5) and centered reset behavior.
### 2026-05-20 11:23
Reworked `src/components/map/PlaceDetailBottomSheet.tsx` to remove the expand/collapse interaction entirely. The panel is now a static bottom sheet with a visual handle, selected room title, a floor pill, and compact room metadata rows. This avoids the previous clickable-toggle feel while keeping room name, floor, and area info visible.


## 2026-05-20 07:53
Switched school-map-react-native to pnpm ownership: added .npmrc with node-linker=hoisted, removed package-lock.json, ran pnpm install, verified pnpm list shows react-native/react-native-gesture-handler/react-native-worklets at root, TypeScript check passed, and Expo export passed for both ios and android from the pnpm-installed tree.
### 2026-05-20 11:04
NativeFloorMap update: removed pan pointer-count gating, kept pinch+pan simultaneous, added viewport overlay buttons (+ / − / reset) inside the map viewport, preserved floor-change reset, and kept all room/AP/current-position/accuracy layers in one transformed canvas. Validation passed: lsp diagnostics clean on src/components/map/NativeFloorMap.tsx; pnpm exec tsc --noEmit passed. Noted that transform order remains scale -> translate to preserve existing gesture math; JS zoom buttons clamp using shared scale bounds (1..3.5) and centered reset behavior.


## 2026-05-20 07:53
Switched school-map-react-native to pnpm ownership: added .npmrc with node-linker=hoisted, removed package-lock.json, ran pnpm install, verified pnpm list shows react-native/react-native-gesture-handler/react-native-worklets at root, TypeScript check passed, and Expo export passed for both ios and android from the pnpm-installed tree.


## MANUAL
<!-- User content. Never auto-pruned. -->
### 2026-05-20 07:53
For Expo SDK 54 + pnpm in this repo, a hoisted node_modules layout is the practical compatibility fix. Metro/Expo exports succeeded after adding node-linker=hoisted and reinstalling with pnpm; no custom metro.config.js was needed. Babel config stayed on babel-preset-expo plus react-native-worklets/plugin because the app already uses worklets/reanimated and exports passed as-is.
### 2026-05-20 11:32
Verification passed for the map narrow-fix: `lsp_diagnostics` clean on `src/components/map/NativeFloorMap.tsx` and `src/components/map/RoomBlock.tsx`; `pnpm exec tsc --noEmit` completed successfully. Also confirmed no TODO/FIXME/@ts-ignore/as any/console debug additions in the edited files.
### 2026-06-01 15:29
2026-06-02 — CampusMap GeoJSON map upgrade. Added MapLibre floor filtering with `selectedLevel` in `src/store/mapStore.ts`, plus `selectedFeatureId` for map-tap selection without breaking RTT's numeric `selectedRoomId`. In `src/components/map/CampusMap.tsx`, the map now uses a `MapRef` + `queryRenderedFeatures` press flow, toggles selection on repeated taps, ignores non-interactive features, and renders room labels with a SymbolLayer at zoom >= 17. Verified with `npx tsc --noEmit` and file diagnostics (no errors).


## 2026-05-20 07:53
For Expo SDK 54 + pnpm in this repo, a hoisted node_modules layout is the practical compatibility fix. Metro/Expo exports succeeded after adding node-linker=hoisted and reinstalling with pnpm; no custom metro.config.js was needed. Babel config stayed on babel-preset-expo plus react-native-worklets/plugin because the app already uses worklets/reanimated and exports passed as-is.
### 2026-05-20 11:32
Verification passed for the map narrow-fix: `lsp_diagnostics` clean on `src/components/map/NativeFloorMap.tsx` and `src/components/map/RoomBlock.tsx`; `pnpm exec tsc --noEmit` completed successfully. Also confirmed no TODO/FIXME/@ts-ignore/as any/console debug additions in the edited files.


## 2026-05-20 07:53
For Expo SDK 54 + pnpm in this repo, a hoisted node_modules layout is the practical compatibility fix. Metro/Expo exports succeeded after adding node-linker=hoisted and reinstalling with pnpm; no custom metro.config.js was needed. Babel config stayed on babel-preset-expo plus react-native-worklets/plugin because the app already uses worklets/reanimated and exports passed as-is.


