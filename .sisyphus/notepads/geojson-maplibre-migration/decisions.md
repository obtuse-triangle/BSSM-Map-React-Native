## Decisions

- Map library: @maplibre/maplibre-react-native v11.x
- No expo-location — MapLibre has built-in UserLocation
- GPS can't determine floor — building detection only
- RTT/BLE code preserved untouched — new WGS84 types in separate files
- Store path: `src/store/` (singular, NOT plural)
- No turf.js — ray-casting algorithm for point-in-polygon
- Web support dropped but react-native-web NOT removed (separate cleanup)
- AP markers not migrated in this phase
- MapLibre config plugin added in `app.config.js` as `"@maplibre/maplibre-react-native"` after existing custom plugins.
