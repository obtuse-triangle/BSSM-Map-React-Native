# 데이터 흐름 (Data Flow)

## 핵심 불변식 (Core invariant)

모든 측위 및 렌더링 파이프라인은 **WGS84** `[longitude, latitude]`를 사용한다.
필요 시 `src/utils/coordinateTransform.ts`(proj4)를 통해 EPSG:5183(한국 TM)으로
중간 투영한다.

> `src/constants/bssmFloorMap.ts`의 room 데이터는 map-percent `0..1` x/y로
> 저장되지만, 이는 캠퍼스 지오메트리일 뿐 위치 추정/마커 렌더링 경로에는
> 사용되지 않는다.

## 위치 결정 경로

`src/store/mapStore.ts`가 좌표의 단일 머지 지점이다:

1. `bleCoordinates` — iOS BLE WCL + Dead Reckoning + Particle Fusion 결과.
2. `gpsCoordinates` — GPS / Core Location 결과.

`resolveMergedCoordinates`가 BLE 우선 → GPS 폴백 → `null` 순으로 머지하여
`mapStore.userCoordinates`를 산출한다. `CampusMap.tsx`의 `userCoordsRef`와
`UserPositionMarker`가 이 값을 MapLibre WGS84 마커로 직접 렌더링한다.

머지 활성 여부는 `bleTrackingEnabled` / `gpsTrackingEnabled` 플래그로 제어한다.

## iOS: BLE WCL + Dead Reckoning + Particle Fusion

iOS의 통합 실내 측위 파이프라인. BLE 스캔을 anchor로, CoreMotion
step/heading을 연속 추정 신호로 사용하고 particle filter가 둘을 융합한다.
이 섹션이 iOS production 측위의 전부이다.

### 데이터 흐름

1. **Native scan 시작** — `MapSheetScreen`의 BLE 토글이
   `useBleLocationStore.startContinuousScan()`을 호출.
   - `getBleScanner()`로 platform-neutral adapter 획득
     (iOS는 `modules/ios-ble-positioning`의 `IosBlePositioning`).
   - `scanner.startContinuousArubaBleScan()` 호출 및
     `onArubaBleObservation` 이벤트 구독.
   - 관측값(`ArubaBleObservation`)은 `BleObservationBuffer`에 누적되고
     per-beacon `BeaconStats`(RSSI min/max/avg, interval 등)가 갱신된다.
2. **Motion tracking 시작** — `useBleLocationStore.startMotionTracking()`.
   - `IosBlePositioning.startMotionUpdates()` + `onMotionUpdate` 구독.
   - step 누적(`lastMotionCumulativeSteps`) + heading 추적.
3. **1Hz WCL 재계산** — `CONTINUOUS_RECOMPUTE_INTERVAL_MS`마다:
   - `computePositionFromBuffer(floorKey, continuousBuffer, BLE_AP_FIXTURES)`
     (`bleWclProvider`의 buffer 기반 동기 파이프라인) 호출.
   - 결과는 `BleWclResult { longitude, latitude, confidence, accuracyMeters, usedApCount, detectedFloorKey? }`.
4. **Particle fusion 갱신** — `ParticleFusionEngine`(300 particles, motion/heading
   노이즈 + decay τ 튜닝):
   - 첫 anchor 또는 unknown state → `fusionEngine.resetFromBle(obs)`.
   - 그 외 → `fusionEngine.applyBleCorrection(obs)`.
   - `fusionEngine.getState()`로 fused lat/lng 획득.
5. **DR anchor reset** — `isMotionActive`이면 `resetDrToBleAnchor(lat, lng)`로
   DR 엔진을 최신 BLE 위치에 재고정.
6. **mapStore push** — `bleTrackingEnabled`이고 `confidenceLevel !== 'unknown'`이면
   `useMapStore.getState().setBleCoordinates({ longitude, latitude })` 호출.
7. **Motion-driven fusion** — step 변화량이 양수면
   `fusionEngine.applyMotion(motionEvent)` 후 동일 조건으로 `setBleCoordinates` 호출.
8. **Floor 자동 동기화** — `wclResult.detectedFloorKey`가 현재 `selectedFloorKey`와
   다르면 `mapStore.setSelectedFloorKey(detectedFloorKey)`로 자동 전환.

### WCL 가중치 (`src/services/location/bleWeightedCentroid.ts`)

- `floorKey`, 제조사 ID, RSSI ≥ −90 dBm, age ≤ 120s 기준 필터.
- 유효 AP ≥ 2개 요구(미만 시 `INSUFFICIENT_APS`).
- EPSG:5183 좌표계에서 RSSI 가중 중심점을 계산 후 proj4로 WGS84 변환.
- `src/services/location/bleWclProvider.ts`의 `validateCoordinates()`가
  finite + `src/constants/campusBounds.ts`의 캠퍼스 bounds로 결과 검증.

### 핵심 제약 조건

- **iOS only, foreground only**. Android는 별도 측위가 없고 GPS 경로를 따른다.
- **Delayed delivery**: AP 광고 간격 1초에도 iOS CoreBluetooth는 5초~1분 지연.
- **Fixture AP**: `src/constants/bleAccessPoints.ts`의 `BLE_AP_FIXTURES`는 모든 좌표가 0인
  EPSG:5183 placeholder. 운영 환경에서는 실측 데이터로 교체 필요.
- **Fingerprinting 미사용**: RSSI 가중 중심점 + known AP 위치만 사용.

전체 아키텍처는 `docs/ble-wcl-mvp.md`, 모션 융합은 `docs/ble-motion-fusion.md`,
필드 QA는 `docs/ble-fusion-field-qa.md` 참조.

## GPS (전 플랫폼)

`src/store/mapStore.ts`의 `setGpsCoordinates({ longitude, latitude })`가 진입점.
`CampusMap.tsx`의 `createUserLocationUpdateHandler`(campusMapInternal/mapInteractions.ts)가
MapLibre `onUserLocationUpdate` 콜백에서 lat/lng을 push한다.

`bleTrackingEnabled === false`이고 `gpsTrackingEnabled === true`일 때
`resolveMergedCoordinates`가 GPS를 `userCoordinates`로 채택한다.

## Indoor Routing & Wayfinding

실내 라우팅 파이프라인은 커밋된 GeoJSON 통행 가능 영역(walkable-area) 및
연결 데이터(connector)로부터 사전 구성된 라우팅 그래프를 사용해, 캠퍼스 내
두 지점 사이의 다중 옵션 보행자 경로를 계산한다.

### 데이터 흐름

1. **그래프 구성** — `src/services/routing/graphBuilder.ts`는
   `src/data/routing-walkable-areas.geojson`과
   `src/data/routing-connectors.geojson`을 로드하고, 모든 WGS84 좌표를
   EPSG:5183(평면 미터 좌표계)로 투영한 뒤 다음을 포함하는 `RouteGraph`를 구축한다:
   - 통행 가능 폴리곤별: 링 정점 + 샘플링된 내부 그리드 노드.
   - 레벨별: 각 노드를 K개의 최근접 이웃에 연결하는 엣지.
   - 연결자(계단/엘리베이터)별: 두 개의 층간 연결 노드 + 이동 시간과
     effort 패널티를 가진 연결 엣지.

2. **사용자 입력** — `src/store/routeStore.ts`(Zustand)는 `routeOrigin`과
   `routeDestination`을 보관한다. origin은 선택된 장소(`setOriginFromFeature`)
   또는 사용자의 BLE WCL 위치(`setOriginFromUserLocation`)가 될 수 있다.
   origin과 destination이 모두 설정되면 `computeRouteOptions()`가 자동으로 실행된다.

3. **좌표 스내핑** — `routeComputer.ts`는 `resolveAndSnap()`
   (`routeComputerInternal/snapResolver.ts` 제공)을 호출해 WGS84
   origin/destination 좌표를 그래프의 EPSG:5183 좌표계로 투영하고 가장 가까운
   통행 가능 영역에 스내핑한다. 임시 노드가 추가되어 주변 그래프와 연결된다.

4. **다중 옵션 경로 생성** — `routeOptions.ts`는 다음 파이프라인을 실행한다:
   - 3개 프로파일(fastest / shortest / easiest)에 대한 Yen의 k-shortest paths.
   - 노드+연결자 시그니처 기준 중복 제거.
   - 다양성 필터(상위 후보와 85% 이상 겹치는 후보는 거부).
   - Pareto 비지배 부분집합(distance, time, effort).
   - 기본 UI 정렬을 위한 균형 랭킹 점수(effort 가중).
   - 라벨 할당(recommended / fastest / shortest / easiest).
   결과로 2~5개의 서로 다른 `RouteOption` 객체를 생성한다.

5. **상태 업데이트** — `routeStore`는 정렬된 `RouteOption[]`를 수신해 저장하고,
   `routeResult`를 최상위 랭킹 옵션으로 설정한다. UI는 `useRouteStore`를 통해
   리렌더링된다. `isComputing`은 로딩 인디케이터의 게이트 역할을 하고,
   `error`는 실패 사유를 보관한다.

6. **GeoJSON 변환** — `routeGeoJson.ts`는 선택된 `RouteResult`의 floor
   세그먼트를 WGS84 GeoJSON `LineString` 피처로 변환한다.
   `routeLayerData.ts`는 피처를 활성 그룹(현재 floor)과 디밍 그룹(기타 floor)으로
   분할한다.

7. **맵 렌더링** — `RoutePathLayer.tsx`는 `routeStore.routeResult`와
   `mapStore.selectedLevel`을 읽어 GeoJSON 소스 데이터를 구성하고, MapLibre
   `GeoJSONSource` + `Layer`를 통해 LineString 레이어를 렌더링한다. 경로 색상은
   `src/services/routing/constants.ts`의 `ROUTE_SWATCH_COLORS`에서 가져온다.

8. **UI 인터랙션** — `RoutePlanScreen.tsx`는 origin/destination 선택기,
   경로 옵션 카드, 정렬 모드 탭을 표시한다. 사용자는 origin/destination을
   교환하거나, 경로 옵션을 선택하거나, 정렬 모드
   (recommended/fastest/shortest/easiest)를 변경할 수 있다. 각 동작은
   `routeStore`를 업데이트하며, 이는 재계산 및 리렌더링을 트리거한다.

### 실패 처리

- **경로 없음**: `computeRouteOptions`가 `[]`를 반환하고 스토어가 `error`를
  설정한다. UI는 `userFacingErrorMessage()`를 통해 한국어 메시지가 포함된
  스타일이 적용된 오류 카드를 표시한다.
- **Origin/destination 미설정**: 스토어가 `ROUTE_ORIGIN_REQUIRED` 또는
  `ROUTE_DESTINATION_REQUIRED` 오류 코드를 설정한다.
- **빈 그래프**: `routeComputer`가 경고를 로깅하고 빈 옵션을 반환한다.
- **레거시 폴백**: 다중 옵션 엔진이 결과를 생성하지 못하면 단순 Dijkstra
  (`computeRouteLegacy`)가 단일 최단 경로를 생성한다.

### 핵심 제약 조건

- **좌표계**: 모든 라우팅 연산은 EPSG:5183 평면 좌표계에서 수행된다.
  WGS84 ↔ EPSG:5183 변환은 `src/utils/coordinateTransform.ts`(proj4)를
  통해 이루어진다.
- **Effort 모델**: 계단과 엘리베이터는 `effortModel.ts`의 effort 패널티를
  추가한다. `constants.ts`의 `EFFORT_SCORE_DIVISOR`는 effort를 0~1 점수로
  정규화한다.
- **접근성 모드**: `normal`과 `elevator_priority`는 계단/엘리베이터를 선호하거나
  회피하도록 엣지 가중치를 변경한다.
- **모의 폴백**: 라우팅 데이터가 없는 테스트 환경에서는 모의 route computer가
  고정된 50m 경로를 반환한다.
