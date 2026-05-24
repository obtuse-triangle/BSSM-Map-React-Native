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

## Scope

- 지도는 lat/lng가 아니라 map-percent `x/y/width/height`를 사용합니다.
- AP는 교실 중심에서 생성되고, Mock RTT는 같은 map-percent 공간에서 동작합니다.
- Debug RTT 화면에서 최근 측정, 참조 위치, 추정 위치, AP별 측정값을 확인할 수 있습니다.

## iOS limitation

- iOS Core Location은 별도 보정 없이 실내 방/층 정확도를 보장하지 않습니다.
- 이 저장소는 `src/services/calibration/iosCalibration.ts`의 보정 헬퍼와 어댑터 타입만 제공합니다.
- 외부 lat/lng는 보정 bounds 또는 anchors를 통해서만 map-percent로 변환합니다.

## Data source

- BSSM floor data source: `obtuse-triangle/BSSM-Map` MIT license.
