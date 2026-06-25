# school-map-react-native

Expo 기반 BSSM 학교 지도 앱입니다. BSSM-Map MIT 데이터를 사용해 캠퍼스/층/교실을 MapLibre WGS84 GeoJSON으로 렌더링하고, iOS에서 BLE WCL (Weighted Centroid Localisation)로 실내 현재 위치를 계산합니다.

## Run

- `npm install`
- `npm start`
- `npm run android`
- `npm run ios`

## Verification

- `npx tsc --noEmit`
- `npx expo export --platform android --output-dir <output-dir>`

## Coordinate Systems

Production은 두 좌표계를 `proj4`로 연결합니다:

- **MapLibre (WGS84 / EPSG:4326)** — Production 캠퍼스 맵과 `userCoordinates` 마커. `src/data/campus-wgs84.json` GeoJSON이 소스.
- **BLE AP (EPSG:5183 / Korean TM)** — 알려진 AP 좌표 측량 데이터. `bleWclProvider`가 `src/constants/bleAccessPoints.ts`의 AP 위치를 읽고 `src/utils/coordinateTransform.ts`로 WGS84 투영.

`src/constants/bssmFloorMap.ts`의 map-percent room geometry는 실내 렌더링/UX 전용이며 측위에 사용되지 않습니다.

BLE WCL 경로는 **foreground-only, iOS-only**입니다. 전체 파이프라인은 `docs/ble-wcl-mvp.md`, `docs/data-flow.md`를 참고하세요.

## iOS limitation

- iOS Core Location은 별도 보정 없이 실내 방/층 정확도를 보장하지 않습니다.
- 이 저장소는 `src/services/calibration/iosCalibration.ts`의 보정 헬퍼와 어댑터 타입만 제공합니다.
- 외부 lat/lng는 보정 bounds 또는 anchors를 통해서만 map-percent로 변환합니다.
- BLE WCL은 iOS CoreBluetooth를 사용하며, foreground에서만 동작합니다. 1초 AP 광고 간격에도
  iOS의 BLE 전달 지연은 5초에서 1분 이상까지 발생할 수 있습니다.

## Data source

- BSSM floor data source: `obtuse-triangle/BSSM-Map` MIT license.
