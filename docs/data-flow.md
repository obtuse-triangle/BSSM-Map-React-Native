# 데이터 흐름 (Data Flow)

## 핵심 불변식 (Core invariant)

기존 RTT/SVG 실내 위치 측정 파이프라인은 map-percent `x/y`로 위치를 저장하고 렌더링한다.
BLE WCL 파이프라인(iOS 포그라운드 전용)은 MapLibre용 WGS84 `[longitude, latitude]`를 생성한다.

## BSSM -> map -> APs -> RTT

1. `src/constants/bssmFloorMap.ts`는 map-percent 좌표계의 floor JSON을 제공한다.
2. `src/utils/floorMap.ts`는 활성 floor를 선택한다.
3. `src/utils/accessPoint.ts`는 인터랙티브 room의 중심점을 추출하여 AP를 생성한다.
4. `src/services/rtt/mockRttScanner.ts`는 해당 AP들로부터 RTT 측정을 시뮬레이션한다.
5. `src/utils/positioning.ts`는 역거리 가중치(inverse-distance weighting)로 위치를 추정한다.
6. `src/store/positionStore.ts`는 결과를 저장하고 디버그 데이터를 `src/store/debugStore.ts`에 미러링한다.
7. `src/components/map/NativeFloorMap.tsx`는 room 블록, AP 마커, 정확도 원, 사용자 마커를 렌더링한다.

## Debug RTT

- `DebugRttScreen`은 스토어에서 최신 floor, AP 목록, 스캔 결과, 위치를 읽는다.
- 이 화면은 측정 횟수, 참조/모의 위치, 추정 위치, AP별 행을 표시한다.

## iOS 보정 경로

1. 향후 iOS 통합에서 Core Location의 위도/경도를 읽을 수 있다.
2. `src/services/calibration/iosCalibration.ts`는 명시적인 bounds 또는 anchor를 사용해 해당 값을 map-percent로 변환한다.
3. 보정된 위치는 제한된 정밀도(limited precision)로 표시된다.
4. floor 및 room 정밀도는 명시적으로 보장되지 않는다.

## BLE WCL (Weighted Centroid Localisation) — iOS foreground only

BLE WCL은 기존 RTT/SVG 경로와 **병렬 파이프라인**이다. map-percent 좌표가 아닌
MapLibre 캠퍼스 맵용 WGS84 `[longitude, latitude]` 좌표를 생성한다.

### 데이터 흐름

1. `modules/ios-ble-positioning/ios/ExpoBlePositioningModule.swift`는 포그라운드
   CoreBluetooth 광고를 스캔하고 HPE/Aruba 제조사 ID `0x011B`로 필터링한다.
2. `modules/ios-ble-positioning/src/index.ts`는 `ArubaBleObservation`
   (bleIdentifier, manufacturerId, rssi, payloadHex, observedAt)을 수신한다.
3. `src/services/location/bleObservations.ts`의 `BleObservationBuffer`는 AP
   식별자별 최신 관측값을 저장한다(O(1) 삽입, 120초 이상 오래된 항목 제거).
4. `src/services/location/bleWeightedCentroid.ts`는 순수 WCL 함수이다:
   - floorKey, 제조사, RSSI ≥ −90 dBm, age ≤ 120s 기준으로 필터링한다.
   - 유효 AP ≥ 2개를 요구한다(미만 시 `INSUFFICIENT_APS` 반환).
   - EPSG:5183 좌표계에서 RSSI 가중 중심점을 계산한다.
   - `src/utils/coordinateTransform.ts`(proj4)를 통해 중심점을 WGS84로 변환한다.
5. `src/services/location/bleWclProvider.ts`는 캠퍼스 bounds
   (`src/constants/campusBounds.ts`)와 finite 체크로 결과를 검증한다.
6. `src/store/bleLocationStore.ts`는 Zustand 스토어로, 결과를 수신하고
   confidence > 0일 때 `mapStore.userCoordinates`로 전달한다.
7. `src/components/map/BleWclStatusCard.tsx`는 사용된 AP 수, confidence,
   accuracy, 샘플 age, STALE 배지를 표시하는 디버그 카드이다.
8. `CampusMap.tsx`는 `mapStore.userCoordinates`를 통해 BLE WCL 마커를 렌더링한다.

### 핵심 제약 조건

- **iOS 전용**: 네이티브 모듈은 Swift/ObjC로 작성되어 Android BLE 스캔은 지원하지 않는다.
- **포그라운드 전용**: 백그라운드 BLE 전달은 지원하지 않는다.
- **지연된 전달**: AP 광고 간격이 1초임에도 불구하고 iOS CoreBluetooth는
  BLE 패킷을 5초에서 1분 이상 지연시킬 수 있다.
- **Fixture 데이터**: `src/constants/bleAccessPoints.ts`에는 모든 좌표가
  0인 EPSG:5183 placeholder `BLE_AP_FIXTURES`가 포함되어 있다. 운영 환경에서는
  실제 AP 측량 데이터가 필요하다.
- **핑거프린팅 미사용**: MVP는 RSSI 핑거프린팅이나 무선 맵을 사용하지 않는다.
  좌표는 알려진 AP 위치에서만 유도된다.

전체 아키텍처 및 제약 조건 문서는 `docs/ble-wcl-mvp.md`를 참조한다.

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

## 프로바이더 추상화

- `src/services/location/locationTypes.ts`는 프로바이더 계약을 정의한다.
- `src/services/location/indoorLocationProvider.ts`는 Mock RTT를 기본 프로바이더로 유지한다.
- `src/services/location/mockIndoorLocationProvider.ts`는 기존 mock RTT 파이프라인을 프로바이더 계약에 맞게 어댑팅한다.