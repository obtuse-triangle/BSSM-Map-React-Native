## Learnings

(Initial - no learnings yet)

- `npx expo install @maplibre/maplibre-react-native` installs the dependency but cannot patch `app.config.js` when the config is dynamic; the plugin must be added manually.
- `npx expo prebuild --clean` succeeded and generated MapLibre codegen / pod wiring once the plugin was present.
- The iOS dev build is currently blocked by an existing Xcode/Pods workspace issue (`no such module 'Expo'` / damaged `Pods.xcodeproj`), not by the MapLibre package itself.

- Copied `demo/public/campus-wgs84.geojson` into `src/data/campus-wgs84.geojson` byte-for-byte; hashes matched exactly.
- Validator added at `src/data/validate-geojson.ts` uses plain TypeScript/CommonJS access only, no new deps.
- Validation rules confirmed on the actual data: FeatureCollection, 418 features, level counts `1=125`, `2=114`, `3=115`, `4=64`.
- Polygon rings are checked for closure and coordinate bounds are enforced against the campus envelope.

- Added campus GeoJSON helpers in `src/utils/geoJsonHelpers.ts` with the repo's existing simple pure-function style.
- Kept GeoJSON polygon coordinate arrays mutable (`number[][]` / `number[][][]`) so existing building-detection code can consume them without changes.

- MapLibre React Native v11 in this repo exposes `Map` + generic `Layer` components; `Camera` uses `initialViewState` with `center`/`zoom`, and `.geojson` imports may require a localized `@ts-expect-error` because TS module resolution does not always pick up the wildcard declaration.

- MapLibre v11 location updates are exposed through `useCurrentPosition()` / `LocationManager` (`requestPermissions`, `start`, `addListener`) rather than a public `onDidUpdateUserLocation` prop on `Map` or `UserLocation`. `NativeUserLocation` is the puck UI, not the update event source.

- `CameraRef.fitBounds` in `@maplibre/maplibre-react-native` v11 takes a `padding` object inside the options argument: `fitBounds(bounds, { padding: { top, right, bottom, left }, duration })`.
- `MapScreen` now runs in dual mode: RTT state still drives locate/AP/debug behavior, while the visible map/search/level selector use GeoJSON + `selectedLevel` / `selectedFeatureId`.
- T11 cleanup: `NativeFloorMap.tsx` is now explicitly marked legacy, and `MapScreen.tsx` only keeps RTT imports that are still used (`bssmFloorMap`, `getSelectedFloor`, `getAccessPointsForFloor`, `usePositionStore`).

## 2026-06-02 Re-audit
- Verdict: APPROVE. `npx tsc --noEmit` passed, `npx tsx scripts/validate-geojson.ts` printed validation passed, search selection calls `flyToFeature`, bottom sheet receives GeoJSON-adapted floor/room, and `CampusMapHandle.flyToFeature` uses `getFeatureCentroid`.
- Guardrails checked: no direct `expo-location` dependency/import, no direct app `@turf` usage/dependency (only MapLibre transitive turf packages in lockfile), no RTT files modified in tracked diff, and altitude helper is unused and intentionally returns null.
