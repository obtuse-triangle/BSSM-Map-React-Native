# school-map-react-native

Expo 기반 BSSM 학교 지도 앱입니다. BSSM-Map MIT 데이터를 사용해 층/교실을 map-percent 좌표로 렌더링하고, 현재는 Mock RTT로 현재 위치를 계산합니다.

## Run

- `npm install`
- `npm start`
- `npm run android`
- `npm run ios`

## Verification

- `npx tsc --noEmit`
- `npx expo export --platform android --output-dir <output-dir>`

## Coordinate Systems

The app has two parallel coordinate pipelines:

### Legacy RTT / SVG (map-percent)

- The old indoor SVG overlay (`NativeFloorMap.tsx`) uses map-percent
  `x/y/width/height` coordinates from `bssmFloorMap.ts`.
- APs are generated from room centers in map-percent space.
- Mock RTT operates in the same map-percent space.
- The `IndoorLocationProvider` pipeline produces map-percent `IndoorPosition`.

### BLE WCL (WGS84 / MapLibre)

- The BLE WCL MVP (see `docs/ble-wcl-mvp.md`) produces WGS84
  `[longitude, latitude]` coordinates directly.
- It uses known Aruba/HPE BLE beacon positions in **EPSG:5183** (Korean
  TM) and converts the centroid to WGS84 via `proj4`.
- Coordinates are displayed on the MapLibre map (`CampusMap.tsx`) as a
  GPS-style marker.
- The BLE WCL path is **foreground-only**, **iOS-only**, and does not
  use or modify the legacy map-percent pipeline.

### Verify a coordinate's source

- Debug RTT screen → legacy map-percent RTT data.
- BLE WCL Status Card → BLE WCL WGS84 data. Shows used AP count,
  confidence, accuracy, sample age, and STALE indicator.

## iOS limitation

- iOS Core Location은 별도 보정 없이 실내 방/층 정확도를 보장하지 않습니다.
- 이 저장소는 `src/services/calibration/iosCalibration.ts`의 보정 헬퍼와 어댑터 타입만 제공합니다.
- 외부 lat/lng는 보정 bounds 또는 anchors를 통해서만 map-percent로 변환합니다.
- BLE WCL은 iOS CoreBluetooth를 사용하며, foreground에서만 동작합니다. 1초 AP 광고 간격에도
  iOS의 BLE 전달 지연은 5초에서 1분 이상까지 발생할 수 있습니다.

## Data source

- BSSM floor data source: `obtuse-triangle/BSSM-Map` MIT license.
