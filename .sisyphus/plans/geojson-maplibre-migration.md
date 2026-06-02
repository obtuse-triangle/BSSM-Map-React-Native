# GeoJSON + MapLibre 마이그레이션

## TL;DR
> **Summary**: BSSM 학교 지도 앱을 커스텀 SVG(map-percent)에서 MapLibre + WGS84 GeoJSON + 실제 GPS로 전면 마이그레이션.
> **Deliverables**: MapLibre 기반 지도 화면, GeoJSON 교실/복도 폴리곤 렌더링, GPS 사용자 위치, 층 전환, 교실 탭 선택, 자동 건물 감지
> **Effort**: Medium
> **Parallel**: YES - 3 waves
> **Critical Path**: Data foundation(T1-T3) → MapLibre install(T4) → CampusMap(T5-T8) → Integration(T9-T10) → Cleanup(T11)

## Context
### Original Request
- `bssmFloorMap.ts` (map-percent TypeScript) → `campus-wgs84.geojson` (WGS84 GeoJSON) 데이터 교체
- 커스텀 SVG 팬/줌 → 실제 맵 라이브러리로 교체 ("API Key 없이 간편하게")
- GPS 연동으로 실제 사용자 위치 표시

### Interview Summary
- **맵 라이브러리**: `@maplibre/maplibre-react-native` v11.x — 유일하게 "API Key 없음 + Expo + GeoJSON" 충족
- **실내 위치**: GPS 우선. RTT/BLE 코드는 보존하되 이번 마이그레이션에서는 작업 안 함
- **Web 지원**: 드랍. 모바일 전용
- **층 전환**: 자동 건물 감지(GPS) + 수동 층 선택기. GPS 고도로 층 판별은 불가하므로 건물 감지만 자동화
- **테스트**: 빌드 기반 검증 (tsc --noEmit + Expo build + 수동 기기 테스트)

### Metis Review (gaps addressed)
- **expo-location 불필요**: MapLibre에 내장 `<UserLocation />` 있음 → expo-location 의존성 추가 안 함
- **GPS 층 감지 불가**: GPS 고도 정확도(±10m)로 3m 간격 층 판별 불가 → 자동 감지는 건물 포함 여부만
- **map-percent 이중 좌표계**: RTT 코드(map-percent) 보존 위해 기존 타입/유틸 건드리지 않음. 새 WGS84 체계는 별도 파일로 생성
- **Portrait 변환**: 현재 SVG에서 landscape→portrait 변환 수행 중이나, GeoJSON은 실제 WGS84 기준이라 MapLibre에서 그대로 렌더 가능
- **react-native-worklets 충돌 위험**: 첫 dev build에서 조기 검증 필요
- **Room tap 인터랙션 모델 변경**: SVG `onPress` → MapLibre `queryRenderedFeatures` 또는 `ShapeSource.onPress`
- **AP 마커**: 이번 마이그레이션에서 제외. mapStore의 `showApMarkers` 토글은 보존
- **원핑거 줌**: MapLibre에 없음. UX 변경으로 수용. 핀치줌+더블탭으로 충분

## Work Objectives
### Core Objective
bssmFloorMap.ts 기반 커스텀 SVG 렌더링을 MapLibre + WGS84 GeoJSON 기반 실제 지도로 완전 교체. GPS 사용자 위치, 교실 탭 상호작용, 층 전환, 건물 자동 감지 구현.

### Deliverables
1. `src/data/campus-wgs84.geojson` — WGS84 GeoJSON 데이터 파일 (418 features)
2. `src/utils/geoJsonHelpers.ts` — GeoJSON 필터링/바운드 계산 유틸
3. `src/utils/buildingDetection.ts` — GPS 좌표 → 건물 포함 판별
4. `src/components/map/CampusMap.tsx` — MapLibre 기반 메인 맵 컴포넌트
5. `src/components/map/ZoomControls.tsx` — 줌 +/-/리셋 버튼 오버레이
6. `src/screens/MapScreen.tsx` — 수정: NativeFloorMap → CampusMap 교체
7. `src/store/mapStore.ts` — 수정: GeoJSON 기반으로 상태 업데이트
8. `src/types/floorMap.ts` — 수정: GeoJSON 호환 타입 추가
9. `app.config.js` — 수정: MapLibre config plugin 추가

### Definition of Done (verifiable conditions)
```bash
# 타입 체크
npx tsc --noEmit  # → 0 errors

# iOS 빌드
npx expo prebuild --clean && npx expo run:ios  # → 앱 런칭 성공

# Android 빌드
npx expo prebuild --clean && npx expo run:android  # → 앱 런칭 성공

# 기기 검증
# 1. 앱 실행 → 건물 폴리곤이 지도 중앙에 보임
# 2. 교실 탭 → 하이라이트 + 정보 카드 표시
# 3. 층 전환 → 해당 층 교실만 표시
# 4. GPS 권한 허용 → 파란 점으로 현재 위치 표시
# 5. 건물 진입 → 자동으로 campus-main 건물 감지
```

### Must Have
- GeoJSON 데이터 로딩 및 검증
- MapLibre 지도 렌더링 (OSM 타일)
- 교실 폴리곤 FillLayer + LineLayer
- 교실 이름 SymbolLayer (줌 레벨에 따라 표시)
- 층별 필터링 (level 프로퍼티 기반)
- 교실 탭 선택 (하이라이트 + 정보 카드)
- GPS 사용자 위치 표시 (MapLibre 내장 UserLocation)
- 건물 자동 감지 (point-in-polygon)
- 수동 층 선택기 유지
- 줌 컨트롤 버튼 (+/-/리셋)
- 검색 → 교실 선택 → 지도 이동

### Must NOT Have (guardrails)
- expo-location 의존성 추가 금지 (MapLibre 내장 UserLocation 사용)
- RTT/BLE 포지셔닝 코드 수정 금지 (`src/utils/positioning.ts`, `src/services/calibration/`, `src/utils/accessPoint.ts`)
- iOS calibration 코드 수정 금지
- react-native-web 제거하지 않음 (마이그레이션 범위 밖, cleanup은 별도)
- GeoJSON 소스에 418개 이상 feature 추가하지 않음 (기존 데이터만 마이그레이션)
- 건물 polygon을 원핑거 줌 제스처 구현하지 않음 (MapLibre 기본 제스처로 충분)
- AP 마커 시각화 마이그레이션하지 않음 (RTT와 함께 추후 작업)
- GPS 고도 기반 층 자동 감지 시도하지 않음 (신뢰성 부족)

## Verification Strategy
> ZERO HUMAN INTERVENTION - all verification is agent-executed.
- Test decision: Build-based verification. tsc --noEmit + Expo dev build 성공 + 수동 기기 QA
- QA policy: Every task has agent-executable acceptance criteria + device QA scenarios
- Evidence: .sisyphus/evidence/task-{N}-{slug}.{ext}

## Execution Strategy
### Parallel Execution Waves

**Wave 1: Data Foundation** (병렬 가능, MapLibre 무관)
- T1: GeoJSON 데이터 파일 복사 + 스키마 검증 스크립트
- T2: GeoJSON 헬퍼 유틸 (필터링, 바운드, 타입)
- T3: 건물 감지 로직 (point-in-polygon)

**Wave 2: MapLibre Setup** (Wave 1 완료 후, 순차)
- T4: MapLibre 설치 + Expo config plugin + 첫 dev build 검증

**Wave 3: CampusMap Component** (T4 완료 후, 병렬 가능)
- T5: 기본 MapLibre 맵 + GeoJSON 교실 렌더링
- T6: 층 전환 (GeoJSON filter)
- T7: 교실 탭 선택 + 하이라이트
- T8: 교실 이름 라벨 (SymbolLayer)

**Wave 4: Integration** (T5-T8 완료 후, 순차)
- T9: GPS UserLocation + 건물 자동 감지 연동
- T10: MapScreen 통합 + 줌 컨트롤 + 검색 연동
- T11: 기존 NativeFloorMap 레거시 보존 + web dead code cleanup
- T12: 최종 기기 QA (iOS + Android)

### Dependency Matrix
| Task | Depends On | Blocks |
|------|-----------|--------|
| T1 | - | T2, T3, T5 |
| T2 | T1 | T5, T6 |
| T3 | T1 | T9 |
| T4 | - | T5, T6, T7, T8, T9 |
| T5 | T1, T2, T4 | T6, T7, T8, T10 |
| T6 | T5 | T10 |
| T7 | T5 | T10 |
| T8 | T5 | T10 |
| T9 | T3, T5, T4 | T10 |
| T10 | T6, T7, T8, T9 | T11, T12 |
| T11 | T10 | T12 |
| T12 | T11 | F1-F4 |

### Agent Dispatch Summary
| Wave | Tasks | Categories |
|------|-------|-----------|
| 1 | T1, T2, T3 | quick, quick, quick |
| 2 | T4 | deep |
| 3 | T5, T6, T7, T8 | deep, quick, quick, quick |
| 4 | T9, T10, T11, T12 | unspecified-high, deep, quick, unspecified-high |

## TODOs

- [x] 1. GeoJSON 데이터 파일 복사 + 검증 스크립트

  **What to do**:
  1. `/Users/obtuse/gitRepos/school-floor-map/demo/public/campus-wgs84.geojson`을 `src/data/campus-wgs84.geojson`으로 복사
  2. 데이터 검증 스크립트 작성: `src/data/validate-geojson.ts`
     - FeatureCollection 타입 확인
     - Feature 수 = 418 확인
     - 모든 feature가 required properties 가짐: name, level, level_id, building_id, category, interactive
     - 모든 polygon coordinates가 유효 (NaN 없음, 닫힌 링)
     - level 분포: 1층 125개, 2층 114개, 3층 115개, 4층 64개
     - bounds: lon 128.9028~128.9041, lat 35.1876~35.1893
  **Must NOT do**: GeoJSON 데이터 자체를 수정하지 않음. 원본 그대로 복사.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: 파일 복사 + 간단한 검증 스크립트
  - Skills: [] - 필요 없음
  - Omitted: [`skill-x`] - 이유

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: T2, T3, T5 | Blocked By: none

  **References**:
  - Source: `/Users/obtuse/gitRepos/school-floor-map/demo/public/campus-wgs84.geojson` — 복사할 원본 (418 Polygon features, WGS84)
  - Target: `src/data/campus-wgs84.geojson` — 새 위치
  - Structure: Feature → {id: "1-4-7", geometry: {type: "Polygon", coordinates: [[[lon, lat], ...]]}, properties: {name, name_ko, level, level_id, building_id, category, interactive, source}}

  **Acceptance Criteria** (agent-executable only):
  - [ ] `src/data/campus-wgs84.geojson` 파일 존재
  - [ ] `cat src/data/campus-wgs84.geojson | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['features']))"` → 418
  - [ ] 검증 스크립트 실행 시 모든 체크 통과

  **QA Scenarios**:
  ```
  Scenario: GeoJSON 로드 및 스키마 검증
    Tool: Bash
    Steps: python3 스크립트로 GeoJSON 파싱, feature 수/properties/bounds 검증
    Expected: 418 features, 4 levels, 모든 required properties 존재, bounds 일치
    Evidence: .sisyphus/evidence/task-1-geojson-validation.txt

  Scenario: 손상된 GeoJSON 감지
    Tool: Bash
    Steps: 의도적으로 feature 하나의 coordinates를 빈 배열로 변경 후 검증 스크립트 실행
    Expected: 검증 실패 + 구체적 에러 메시지
    Evidence: .sisyphus/evidence/task-1-geojson-validation-error.txt
  ```

  **Commit**: YES | Message: `feat(data): add campus-wgs84.geojson with validation script` | Files: src/data/campus-wgs84.geojson, src/data/validate-geojson.ts

- [x] 2. GeoJSON 헬퍼 유틸 + 타입 정의

  **What to do**:
  1. `src/types/geojson.ts` 생성 — GeoJSON Feature/FeatureCollection 타입 (기존 `@types/geojson` 또는 수동 정의), 캠퍼스 특화 프로퍼티 타입:
     ```typescript
     interface CampusFeatureProperties {
       name: string;
       name_ko: string;
       level: number;
       level_id: string;
       building_id: string;
       category: 'classroom' | 'room' | 'stair' | 'elevator' | 'restroom' | 'facility' | 'structural' | 'unknown' | 'corridor';
       interactive: boolean;
       source: string;
     }
     interface CampusFeature extends Feature<Polygon, CampusFeatureProperties> {}
     interface CampusGeoJSON extends FeatureCollection<Polygon, CampusFeatureProperties> {}
     ```
  2. `src/utils/geoJsonHelpers.ts` 생성:
     - `getFeaturesForLevel(geojson: CampusGeoJSON, level: number): CampusFeature[]` — level 프로퍼티로 필터
     - `getBuildingBounds(geojson: CampusGeoJSON): [number, number, number, number]` — [west, south, east, north] 바운드
     - `getLevelKeys(geojson: CampusGeoJSON): number[]` — [1, 2, 3, 4] 층 키 목록
     - `getInteractiveFeatures(geojson: CampusGeoJSON): CampusFeature[]` — interactive=true만
     - `getFeatureById(geojson: CampusGeoJSON, id: string): CampusFeature | undefined`
  **Must NOT do**: 기존 `src/types/floorMap.ts` 수정하지 않음 (RTT 코드 의존). 새 타입은 별도 파일.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: 타입 정의 + 순수 함수 유틸
  - Skills: [] - 필요 없음

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: T5, T6 | Blocked By: T1

  **References**:
  - GeoJSON 구조: `src/data/campus-wgs84.geojson` — properties 키: name, name_ko, level, level_id, building_id, category, interactive, source
  - 기존 타입 패턴: `src/types/floorMap.ts` — FloorElement, Floor, FloorMapData 인터페이스 패턴 참고
  - 기존 유틸 패턴: `src/utils/coordinate.ts` — PercentPoint, PercentRect 타입 + clamp 함수 패턴

  **Acceptance Criteria**:
  - [ ] `npx tsc --noEmit` → 0 errors
  - [ ] `getFeaturesForLevel(geojson, 1)` returns 125 features
  - [ ] `getBuildingBounds(geojson)` returns `[128.9028093785, 35.1875835655, 128.9040774736, 35.1893144661]` (대략)

  **QA Scenarios**:
  ```
  Scenario: 레벨 필터링 정확도
    Tool: Bash (node 스크립트)
    Steps: campus-wgs84.geojson 로드 → getFeaturesForLevel(1) → 결과 수 확인
    Expected: 125 features for level 1, 114 for level 2, 115 for level 3, 64 for level 4
    Evidence: .sisyphus/evidence/task-2-level-filter.txt

  Scenario: 바운드 계산
    Tool: Bash (node 스크립트)
    Steps: getBuildingBounds(geojson) 실행
    Expected: [~128.9028, ~35.1876, ~128.9041, ~35.1893]
    Evidence: .sisyphus/evidence/task-2-bounds.txt
  ```

  **Commit**: YES | Message: `feat(utils): add GeoJSON types and helper utilities` | Files: src/types/geojson.ts, src/utils/geoJsonHelpers.ts

- [x] 3. 건물 감지 로직 (point-in-polygon)

  **What to do**:
  1. `src/utils/buildingDetection.ts` 생성:
     - `isPointInBuilding(lng: number, lat: number, geojson: CampusGeoJSON): boolean` — GPS 좌표가 건물 polygon 내부인지 판별
     - `getDetectedBuildingId(lng: number, lat: number, geojson: CampusGeoJSON): string | null` — 포함된 건물의 building_id 반환
     - `getFloorFromAltitude(altitude: number): number | null` — 항상 null 반환 (GPS 고도 불신뢰). JSDoc으로 추후 구현 예정 명시
  2. turf.js 없이 자체 구현 (ray-casting algorithm). 의존성 추가 최소화.
     ```typescript
     // point-in-polygon (ray casting)
     function pointInPolygon(lng: number, lat: number, polygon: number[][]): boolean
     ```
  **Must NOT do**: turf.js 의존성 추가하지 않음. `npm install @turf/boolean-point-in-polygon` 금지.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: 단일 파일 순수 함수
  - Skills: [] - 필요 없음

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: T9 | Blocked By: T1

  **References**:
  - GeoJSON polygon 구조: `src/data/campus-wgs84.geojson` — coordinates[0] = exterior ring, 각 point = [lon, lat]
  - Ray-casting algorithm: 점에서 수평 ray를 쏴서 polygon edge와의 교차 횟수로 내부/외부 판별

  **Acceptance Criteria**:
  - [ ] `npx tsc --noEmit` → 0 errors
  - [ ] `isPointInBuilding(128.903, 35.188, geojson)` → true
  - [ ] `isPointInBuilding(127.0, 37.0, geojson)` → false (서울, 외부)
  - [ ] `getDetectedBuildingId(128.903, 35.188, geojson)` → "campus-main"

  **QA Scenarios**:
  ```
  Scenario: 건물 내부 포인트 감지
    Tool: Bash (node 스크립트)
    Steps: campus-wgs84.geojson 로드 → isPointInBuilding(128.9035, 35.1885, geojson)
    Expected: true
    Evidence: .sisyphus/evidence/task-3-inside-building.txt

  Scenario: 건물 외부 포인트 거부
    Tool: Bash (node 스크립트)
    Steps: isPointInBuilding(127.0, 37.0, geojson) + isPointInBuilding(128.9, 35.18, geojson)
    Expected: false, false
    Evidence: .sisyphus/evidence/task-3-outside-building.txt
  ```

  **Commit**: YES | Message: `feat(utils): add building detection via point-in-polygon` | Files: src/utils/buildingDetection.ts

- [x] 4. MapLibre 설치 + Expo config plugin + 첫 dev build 검증

  **What to do**:
  1. `npx expo install @maplibre/maplibre-react-native` 실행
  2. `app.config.js`의 plugins 배열에 `"@maplibre/maplibre-react-native"` 추가:
     ```javascript
     plugins: [
       // ... 기존 plugins ...
       "@maplibre/maplibre-react-native",
     ],
     ```
  3. `npx expo prebuild --clean` 실행
  4. iOS dev build: `npx expo run:ios` 실행 → 앱 런칭 확인
  5. Android dev build: `npx expo run:android` 실행 → 앱 런칭 확인
  6. MapLibre 기본 맵이 화면에 보이는지 확인 (아직 GeoJSON 없이, 빈 지도)
  **Must NOT do**: expo-location 설치하지 않음. react-native-web 제거하지 않음. 기존 코드 수정하지 않음.

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: 네이티브 의존성 설치 + dev build 디버깅 필요. 예상치 못한 이슈 발생 가능.
  - Skills: [] - 필요 없음

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: T5, T6, T7, T8, T9 | Blocked By: none

  **References**:
  - Expo config: `app.config.js` — 현재 plugins 배열에 RTT/BLE 권한 플러그인 있음
  - Package.json: 현재 deps — expo 54, rn 0.81.5, react-native-worklets 0.5.1
  - Babel: `babel.config.js` — react-native-worklets/plugin 포함. MapLibre와 충돌 가능성 주의
  - MapLibre Expo setup: `npx expo install @maplibre/maplibre-react-native` + plugins 배열에 추가
  - MapLibre v11 주의사항: New Architecture 전용 (현재 newArchEnabled: true OK), Expo Go 불가

  **Acceptance Criteria**:
  - [ ] `cat package.json | grep maplibre` → @maplibre/maplibre-react-native 존재
  - [ ] `cat app.config.js | grep maplibre` → plugins 배열에 존재
  - [ ] `npx tsc --noEmit` → 0 errors
  - [ ] iOS 빌드 성공 + 앱 런칭
  - [ ] Android 빌드 성공 + 앱 런칭

  **QA Scenarios**:
  ```
  Scenario: MapLibre 설치 후 정상 빌드
    Tool: Bash
    Steps: npx expo prebuild --clean && npx expo run:ios
    Expected: 앱이 크래시 없이 런칭. 기본 맵 뷰 또는 기존 화면 정상 표시
    Evidence: .sisyphus/evidence/task-4-maplibre-install.txt

  Scenario: worklets plugin 충돌 확인
    Tool: Bash
    Steps: 빌드 로그에서 react-native-worklets 관련 에러/워닝 확인
    Expected: 에러 없음. 워닝만 있을 수 있으나 빌드는 성공
    Evidence: .sisyphus/evidence/task-4-worklets-check.txt
  ```

  **Commit**: YES | Message: `chore: install @maplibre/maplibre-react-native + configure Expo plugin` | Files: package.json, app.config.js, package-lock.json

- [x] 5. 기본 MapLibre 맵 + GeoJSON 교실 폴리곤 렌더링

  **What to do**:
  1. `src/components/map/CampusMap.tsx` 생성:
     ```tsx
     import MapLibreGL from '@maplibre/maplibre-react-native';
     
     // 타일 스타일 — OSM 기반 공개 타일 (API Key 불필요)
     const styleURL = 'https://demotiles.maplibre.org/style.json'; 
     // 또는 커스텀 스타일 JSON with OSM raster tiles
     
     function CampusMap() {
       return (
         <MapLibreGL.MapView style={{flex: 1}} styleURL={styleURL}>
           <MapLibreGL.Camera
             ref={cameraRef}
             zoomLevel={17}
             centerCoordinate={[128.9035, 35.1885]}
           />
           <MapLibreGL.GeoJSONSource
             id="campus-rooms"
             shape={geojsonData}
           >
             <MapLibreGL.FillLayer
               id="room-fill"
               sourceID="campus-rooms"
               style={{fillColor: '#e8e8e8', fillOpacity: 0.7}}
             />
             <MapLibreGL.LineLayer
               id="room-line"
               sourceID="campus-rooms"
               style={{lineColor: '#333', lineWidth: 1}}
             />
           </MapLibreGL.GeoJSONSource>
         </MapLibreGL.MapView>
       );
     }
     ```
  2. GeoJSON 데이터를 import 또는 fetch로 로드
  3. Android에서 `androidView="texture"` 필요한지 테스트하고 필요시 추가
  **Must NOT do**: 기존 NativeFloorMap.tsx 수정하지 않음. 별도 컴포넌트로 생성.

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: MapLibre API 학습 + 컴포넌트 아키텍처 결정. 첫 MapLibre 컴포넌트.
  - Skills: [] - 필요 없음

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: T6, T7, T8, T10 | Blocked By: T1, T2, T4

  **References**:
  - GeoJSON 데이터: `src/data/campus-wgs84.geojson`
  - GeoJSON 타입: `src/types/geojson.ts` (T2에서 생성)
  - 헬퍼: `src/utils/geoJsonHelpers.ts` — getBuildingBounds, getLevelKeys (T2에서 생성)
  - MapLibre GeoJSONSource: `<MapLibreGL.GeoJSONSource id="..." shape={geojson}>` + 자식 `<Layer>` 패턴
  - MapLibre Layer paint props: fillColor, fillOpacity, lineColor, lineWidth
  - MapLibre Camera: centerCoordinate, zoomLevel, fitBounds 메서드
  - 기존 렌더링 패턴: `src/components/map/NativeFloorMap.tsx` — SVG 렌더링 구조 참고 (대체 대상)
  - Building bounds: lon 128.9028~128.9041, lat 35.1876~35.1893
  - OSM 공개 타일: `https://demotiles.maplibre.org/style.json` (데모용) 또는 커스텀 스타일 JSON 작성

  **Acceptance Criteria**:
  - [ ] `npx tsc --noEmit` → 0 errors
  - [ ] 기기에서 앱 실행 시 건물 교실 폴리곤이 지도 위에 렌더링됨
  - [ ] 팬/줌 동작 (MapLibre 내장)
  - [ ] Android에서 크래시 없음 (texture view 체크)

  **QA Scenarios**:
  ```
  Scenario: 교실 폴리곤 렌더링
    Tool: interactive_bash (기기 테스트)
    Steps: 앱 실행 → 지도 화면 진입 → 건물 중심에 교실 폴리곤 보이는지 확인
    Expected: 회색 fill + 검정 outline 폴리곤 418개가 지도 위에 표시
    Evidence: .sisyphus/evidence/task-5-polygon-render.txt

  Scenario: 팬/줌 동작
    Tool: interactive_bash (기기 테스트)
    Steps: 핀치 줌, 드래그 팬, 더블 탭 줌
    Expected: 모든 제스처가 자연스럽게 동작. 폴리곤이 지도와 함께 이동/확대
    Evidence: .sisyphus/evidence/task-5-gestures.txt
  ```

  **Commit**: YES | Message: `feat(map): add CampusMap component with MapLibre GeoJSON rendering` | Files: src/components/map/CampusMap.tsx

- [x] 6. 층 전환 — GeoJSON 레벨 필터링

  **What to do**:
  1. CampusMap의 FillLayer/LineLayer에 filter prop 추가:
     ```tsx
     <MapLibreGL.FillLayer
       filter={["==", ["get", "level"], selectedFloor]}
       // ...
     />
     ```
  2. mapStore의 `selectedFloorKey`를 읽어 selectedFloor 값으로 사용
  3. FloorSelector 컴포넌트 재사용 — 이미 1층~4층 선택 UI 있음
  4. 층 전환 시 선택된 교실(selectedRoomId) 초기화
  **Must NOT do**: FloorSelector 컴포넌트를 새로 만들지 않음. 기존 것 재사용.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: MapLibre filter prop 추가 + 기존 store 연동
  - Skills: [] - 필요 없음

  **Parallelization**: Can Parallel: YES (T7, T8과 병렬) | Wave 3 | Blocks: T10 | Blocked By: T5

  **References**:
  - CampusMap: `src/components/map/CampusMap.tsx` (T5에서 생성)
  - GeoJSON level property: features[].properties.level = 1|2|3|4
  - Store: `src/store/mapStore.ts` — selectedFloorKey 상태
  - FloorSelector: `src/components/map/FloorSelector.tsx` — 층 선택 UI (1층~4층)
  - MapLibre filter syntax: `filter={["==", ["get", "level"], selectedFloor]}`

  **Acceptance Criteria**:
  - [ ] `npx tsc --noEmit` → 0 errors
  - [ ] 기본 1층 로드 시 level=1인 125개 feature만 렌더링
  - [ ] 2층 선택 시 → 114개 feature로 전환
  - [ ] 층 전환 시 selectedRoomId 초기화

  **QA Scenarios**:
  ```
  Scenario: 층 전환 필터링
    Tool: interactive_bash (기기 테스트)
    Steps: 앱 실행(1층) → FloorSelector에서 2층 탭 → 3층 탭 → 4층 탭
    Expected: 각 층 선택 시 해당 층 교실만 표시. 이전 층 교실 사라짐.
    Evidence: .sisyphus/evidence/task-6-floor-switch.txt

  Scenario: 층 전환 시 선택 초기화
    Tool: interactive_bash (기기 테스트)
    Steps: 교실 하나 탭(선택) → 다른 층으로 전환
    Expected: 선택 해제. 하이라이트 사라짐.
    Evidence: .sisyphus/evidence/task-6-floor-reset.txt
  ```

  **Commit**: YES | Message: `feat(map): add floor switching with GeoJSON level filter` | Files: src/components/map/CampusMap.tsx

- [x] 7. 교실 탭 선택 + 하이라이트

  **What to do**:
  1. MapLibre MapView의 `onPress` 이벤트에서 `queryRenderedFeatures` 호출:
     ```tsx
     const handleMapPress = async (event: MapLibreGL.MapboxGLEvent) => {
       const {geometry} = event;
       const features = await mapRef.current?.queryRenderedFeatures({
         point: [geometry.coordinates[0], geometry.coordinates[1]],
         layerIDs: ['room-fill'],
       });
       if (features?.length && features[0].properties?.interactive) {
         mapStore.setSelectedRoomId(features[0].id);
       }
     };
     ```
  2. 하이라이트 레이어 추가 (FillLayer, 기존 room-fill 위에):
     ```tsx
     <MapLibreGL.FillLayer
       id="room-highlight"
       sourceID="campus-rooms"
       filter={["==", ["get", "id"], selectedRoomId]}
       style={{fillColor: '#4A90D9', fillOpacity: 0.5}}
       aboveLayerID="room-fill"
     />
     ```
  3. interactive=false feature는 무시 (계단, 엘리베이터 등)
  **Must NOT do**: ShapeSource.onPress 사용하지 않음 (GeoJSONSource + queryRenderedFeatures 패턴).

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: 이벤트 핸들러 + 레이어 추가
  - Skills: [] - 필요 없음

  **Parallelization**: Can Parallel: YES (T6, T8과 병렬) | Wave 3 | Blocks: T10 | Blocked By: T5

  **References**:
  - CampusMap: `src/components/map/CampusMap.tsx` (T5에서 생성)
  - MapLibre queryRenderedFeatures: `mapRef.current.queryRenderedFeatures({point, layerIDs})`
  - Store: `src/store/mapStore.ts` — selectedRoomId, setSelectedRoomId
  - 기존 패턴: `src/components/map/NativeFloorMap.tsx` — RoomBlock onPress 핸들러 참고
  - GeoJSON interactive property: features[].properties.interactive (boolean)
  - GeoJSON id format: "1-4-7" (level-?-?)

  **Acceptance Criteria**:
  - [ ] `npx tsc --noEmit` → 0 errors
  - [ ] 교실 탭 → 파란 하이라이트 + mapStore.selectedRoomId 업데이트
  - [ ] 비인터랙티브 요소(계단 등) 탭 → 반응 없음
  - [ ] 이미 선택된 교실 다시 탭 → 선택 해제

  **QA Scenarios**:
  ```
  Scenario: 교실 탭 선택
    Tool: interactive_bash (기기 테스트)
    Steps: 교실 하나 탭
    Expected: 파란 하이라이트 표시. 콘솔에 selectedRoomId 로그.
    Evidence: .sisyphus/evidence/task-7-room-select.txt

  Scenario: 비인터랙티브 요소 무시
    Tool: interactive_bash (기기 테스트)
    Steps: 계단 영역 탭 (category: "stair")
    Expected: 선택되지 않음. 하이라이트 변화 없음.
    Evidence: .sisyphus/evidence/task-7-noninteractive.txt

  Scenario: 선택 해제
    Tool: interactive_bash (기기 테스트)
    Steps: 교실 선택 → 같은 교실 다시 탭
    Expected: 하이라이트 사라짐. selectedRoomId = null.
    Evidence: .sisyphus/evidence/task-7-deselect.txt
  ```

  **Commit**: YES | Message: `feat(map): add room tap selection with highlight layer` | Files: src/components/map/CampusMap.tsx, src/store/mapStore.ts

- [x] 8. 교실 이름 라벨 — SymbolLayer

  **What to do**:
  1. CampusMap에 SymbolLayer 추가:
     ```tsx
     <MapLibreGL.SymbolLayer
       id="room-labels"
       sourceID="campus-rooms"
       filter={["==", ["get", "level"], selectedFloor]}
       style={{
         textField: ['get', 'name'],
         textSize: 11,
         textAnchor: 'center',
         textAllowOverlap: false,
         textOptional: true,
         textMaxWidth: 6,
       }}
       aboveLayerID="room-fill"
     />
     ```
  2. 줌 레벨에 따라 라벨 표시/숨김 (minZoomLevel prop)
  **Must NOT do**: 라벨을 위해 별도 데이터 소스 만들지 않음. 같은 GeoJSONSource 사용.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: 단일 레이어 추가
  - Skills: [] - 필요 없음

  **Parallelization**: Can Parallel: YES (T6, T7과 병렬) | Wave 3 | Blocks: T10 | Blocked By: T5

  **References**:
  - CampusMap: `src/components/map/CampusMap.tsx` (T5에서 생성)
  - GeoJSON name property: features[].properties.name — 교실 이름 (한글)
  - MapLibre SymbolLayer: textField, textSize, textAllowOverlap, textOptional
  - 기존 패턴: `src/components/map/NativeFloorMap.tsx` — SvgText 렌더링 참고

  **Acceptance Criteria**:
  - [ ] `npx tsc --noEmit` → 0 errors
  - [ ] 줌인 시 교실 이름 표시
  - [ ] 줌아웃 시 라벨 자동 숨김 (겹침 방지)
  - [ ] 현재 선택 층의 교실만 라벨 표시

  **QA Scenarios**:
  ```
  Scenario: 라벨 가시성
    Tool: interactive_bash (기기 테스트)
    Steps: 줌인 (zoomLevel > 17) → 교실 이름 보이는지 확인 → 줌아웃
    Expected: 줌인 시 교실명 표시, 줌아웃 시 자동 숨김
    Evidence: .sisyphus/evidence/task-8-labels.txt
  ```

  **Commit**: YES | Message: `feat(map): add room name labels via SymbolLayer` | Files: src/components/map/CampusMap.tsx

- [x] 9. GPS UserLocation + 건물 자동 감지 연동

  **What to do**:
  1. CampusMap에 MapLibre 내장 UserLocation 추가:
     ```tsx
     <MapLibreGL.UserLocation visible={true} />
     ```
     또는 v11:
     ```tsx
     <MapLibreGL.NativeUserLocation />
     ```
     MapLibre v11 API 확인하여 올바른 컴포넌트 사용.
  2. 위치 권한 요청 — MapLibre가 자동 처리. Android의 경우 app.config.js에 위치 권한이 이미 있을 것 (확인 필요)
  3. 건물 감지: MapLibre의 `onDidUpdateUserLocation` 콜백에서 GPS 좌표 획득 → `isPointInBuilding()` 호출 → 건물 내부면 mapStore에 건물 정보 저장
  4. "내 위치" 버튼: cameraRef.flyTo([lng, lat]) 호출
  **Must NOT do**: expo-location 설치하지 않음. MapLibre 내장 location 사용.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: 권한 처리 + 네이티브 API 연동 + 건물 감지 로직 통합
  - Skills: [] - 필요 없음

  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: T10 | Blocked By: T3, T5, T4

  **References**:
  - CampusMap: `src/components/map/CampusMap.tsx` (T5에서 생성)
  - Building detection: `src/utils/buildingDetection.ts` (T3에서 생성)
  - MapLibre UserLocation: `<MapLibreGL.UserLocation visible={true} />` 또는 v11 `<NativeUserLocation />`
  - MapLibre location callback: `onDidUpdateUserLocation` 이벤트
  - MapLibre Camera flyTo: `cameraRef.current.flyTo([lng, lat])`
  - 권한: app.config.js — 기존 RTT/BLE 권한 설정 확인. LOCATION 권한 필요 시 추가
  - Store: `src/store/mapStore.ts` — 건물/위치 상태

  **Acceptance Criteria**:
  - [ ] `npx tsc --noEmit` → 0 errors
  - [ ] 기기에서 GPS 권한 허용 → 파란 점 표시
  - [ ] 건물 내부에 있을 때 자동으로 campus-main 감지
  - [ ] "내 위치" 버튼 → 카메라가 GPS 위치로 이동

  **QA Scenarios**:
  ```
  Scenario: GPS 위치 표시
    Tool: interactive_bash (실제 기기, 위치 권한 필요)
    Steps: 앱 실행 → 위치 권한 허용 → 지도에 파란 점 표시 확인
    Expected: 현재 GPS 위치에 파란 점 + 정확도 원 표시
    Evidence: .sisyphus/evidence/task-9-gps-location.txt

  Scenario: 건물 자동 감지
    Tool: interactive_bash (실제 기기, 학교 건물 내부)
    Steps: 건물 내부에서 앱 실행 → GPS 업데이트 대기
    Expected: mapStore에 detectedBuildingId = "campus-main" 저장
    Evidence: .sisyphus/evidence/task-9-building-detect.txt

  Scenario: 위치 권한 거부
    Tool: interactive_bash (실제 기기)
    Steps: 위치 권한 거부 → 앱 동작 확인
    Expected: 앱 크래시 없음. 지도는 정상 표시. 파란 점만 안 보임.
    Evidence: .sisyphus/evidence/task-9-location-denied.txt
  ```

  **Commit**: YES | Message: `feat(map): add GPS user location and building auto-detection` | Files: src/components/map/CampusMap.tsx, src/store/mapStore.ts

- [x] 10. MapScreen 통합 + 줌 컨트롤 + 검색 연동

  **What to do**:
  1. `src/screens/MapScreen.tsx` 수정:
     - NativeFloorMap → CampusMap으로 교체
     - FloorSelector, PlaceDetailBottomSheet, MapStatusCard 유지
     - 검색 결과 선택 시 → cameraRef.flyTo()로 해당 교실 위치로 이동
  2. `src/components/map/ZoomControls.tsx` 생성:
     - +/- / 리셋 버튼을 MapLibre MapView 위에 오버레이
     - `cameraRef.zoomTo(currentZoom + 1)` / `cameraRef.zoomTo(currentZoom - 1)`
     - 리셋: `cameraRef.fitBounds(buildingBounds, {padding: 50})`
  3. PlaceDetailBottomSheet가 GeoJSON 프로퍼티와 호환되도록 mapStore 상태 조정
  **Must NOT do**: MapScreen을 완전히 재작성하지 않음. 기존 레이아웃/검색 로직 유지.

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: 여러 컴포넌트 통합 + 기존 로직 이해 필요
  - Skills: [] - 필요 없음

  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: T11, T12 | Blocked By: T6, T7, T8, T9

  **References**:
  - MapScreen: `src/screens/MapScreen.tsx` — 메인 스크린. NativeFloorMap, FloorSelector, 검색, AP 토글, locate 버튼 모두 포함
  - CampusMap: `src/components/map/CampusMap.tsx` (T5에서 생성)
  - FloorSelector: `src/components/map/FloorSelector.tsx` — 층 선택 칩
  - PlaceDetailBottomSheet: `src/components/map/PlaceDetailBottomSheet.tsx` — 교실 정보 카드
  - MapStatusCard: `src/components/map/MapStatusCard.tsx` — 상태 요약
  - Store: `src/store/mapStore.ts` — selectedFloorKey, selectedRoomId, showApMarkers
  - MapLibre Camera: fitBounds, flyTo, zoomTo
  - 기존 줌 컨트롤: NativeFloorMap.tsx 내부에 구현됨 — 독립 컴포넌트로 추출

  **Acceptance Criteria**:
  - [ ] `npx tsc --noEmit` → 0 errors
  - [ ] MapScreen에 MapLibre 지도 표시
  - [ ] 줌 +/- 버튼 동작
  - [ ] 리셋 버튼 → 건물 전체 바운드로 복귀
  - [ ] 검색 → 교실 선택 → 카메라가 해당 위치로 이동 + 하이라이트
  - [ ] PlaceDetailBottomSheet에 교실 정보 표시

  **QA Scenarios**:
  ```
  Scenario: MapScreen 통합
    Tool: interactive_bash (기기 테스트)
    Steps: 앱 실행 → 지도 화면 → FloorSelector, 검색바, 줌 버튼 확인
    Expected: 모든 UI 요소 정상 배치. MapLibre 지도가 메인 영역 차지.
    Evidence: .sisyphus/evidence/task-10-mapscreen.txt

  Scenario: 검색 → 교실 이동
    Tool: interactive_bash (기기 테스트)
    Steps: 검색바에 "프로그래밍" 입력 → 결과 탭
    Expected: 카메라가 해당 교실로 이동 + 하이라이트 + 정보 카드
    Evidence: .sisyphus/evidence/task-10-search.txt

  Scenario: 줌 컨트롤
    Tool: interactive_bash (기기 테스트)
    Steps: + 버튼 탭 → - 버튼 탭 → 리셋 버튼 탭
    Expected: 줌 인/아웃/리셋 동작. 리셋 시 건물 전체가 화면에 보임.
    Evidence: .sisyphus/evidence/task-10-zoom.txt
  ```

  **Commit**: YES | Message: `feat(map): integrate CampusMap into MapScreen with zoom controls and search` | Files: src/screens/MapScreen.tsx, src/components/map/ZoomControls.tsx, src/store/mapStore.ts

- [x] 11. 기존 코드 정리 — NativeFloorMap 레거시 보존 + 미사용 import cleanup

  **What to do**:
  1. NativeFloorMap.tsx 삭제하지 않음. 주석으로 `[LEGACY - deprecated in favor of CampusMap]` 표시
  2. RoomBlock.tsx, ApMarker.tsx, AccuracyCircle.tsx, UserPositionMarker.tsx — 삭제하지 않음 (RTT 재활용 가능성)
  3. MapScreen에서 NativeFloorMap import 제거
  4. `src/constants/bssmFloorMap.ts` — 삭제하지 않음 (RTT 코드가 의존)
  5. react-native-web 의존성은 유지 (별도 cleanup 태스크)
  **Must NOT do**: RTT 관련 파일(positoning.ts, accessPoint.ts, calibration/) 삭제하지 않음. bssmFloorMap.ts 삭제하지 않음.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: 정리 작업
  - Skills: [] - 필요 없음

  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: T12 | Blocked By: T10

  **References**:
  - MapScreen: `src/screens/MapScreen.tsx` (T10에서 수정됨)
  - NativeFloorMap: `src/components/map/NativeFloorMap.tsx` — 레거시 표시만
  - RTT 관련: `src/utils/positioning.ts`, `src/utils/accessPoint.ts`, `src/services/calibration/` — 보존

  **Acceptance Criteria**:
  - [ ] `npx tsc --noEmit` → 0 errors
  - [ ] NativeFloorMap에 deprecated 주석 있음
  - [ ] MapScreen에서 NativeFloorMap import 없음
  - [ ] RTT 관련 파일은 수정되지 않음

  **QA Scenarios**:
  ```
  Scenario: 타입 체크
    Tool: Bash
    Steps: npx tsc --noEmit
    Expected: 0 errors. 레거시 파일은 unused warning만.
    Evidence: .sisyphus/evidence/task-11-cleanup.txt
  ```

  **Commit**: YES | Message: `refactor: mark NativeFloorMap as legacy, clean up imports` | Files: src/screens/MapScreen.tsx, src/components/map/NativeFloorMap.tsx

- [x] 12. 최종 기기 QA — iOS + Android 풀 스모크 테스트

  **What to do**:
  1. iOS 실기기 테스트:
     - 앱 런칭 → 지도 로드 → 교실 폴리곤 표시
     - 층 전환 (1-4층)
     - 교실 탭 → 하이라이트 → 정보 카드
     - GPS 권한 → 파란 점
     - 검색 → 교실 이동
     - 줌 컨트롤
  2. Android 실기기 테스트 (동일 시나리오)
  3. 크래시, 메모리 릭, 성능 이슈 확인
  **Must NOT do**: 코드 수정하지 않음. 발견된 이슈는 별도로 기록.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: 철저한 수동 QA
  - Skills: [] - 필요 없음

  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: F1-F4 | Blocked By: T11

  **References**:
  - 모든 이전 태스크의 QA 시나리오 참고

  **Acceptance Criteria**:
  - [ ] iOS: 앱 런칭 + 지도 + 교실 + 층 전환 + GPS + 검색 + 줌 모두 정상
  - [ ] Android: 동일
  - [ ] 크래시 없음

  **QA Scenarios**:
  ```
  Scenario: iOS 풀 스모크 테스트
    Tool: interactive_bash (실제 기기)
    Steps: 앱 런칭 → 지도 확인 → 1-4층 전환 → 교실 탭 → GPS 확인 → 검색 → 줌
    Expected: 모든 기능 정상 동작. 크래시 없음.
    Evidence: .sisyphus/evidence/task-12-ios-smoke.txt

  Scenario: Android 풀 스모크 테스트
    Tool: interactive_bash (실제 기기)
    Steps: 동일
    Expected: 모든 기능 정상 동작. 크래시 없음.
    Evidence: .sisyphus/evidence/task-12-android-smoke.txt
  ```

  **Commit**: NO | 검증만 수행

## Final Verification Wave (MANDATORY — after ALL implementation tasks)
> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.
- [x] F1. Plan Compliance Audit — oracle
- [x] F2. Code Quality Review — unspecified-high
- [x] F3. Real Manual QA — unspecified-high (+ interactive_bash for device testing)
- [x] F4. Scope Fidelity Check — deep

## Commit Strategy
- 각 태스크 완료 후 원자적 커밋
- 커밋 메시지: conventional commits (feat/chore/refactor)
- 최종: 모든 커밋이 tsc --noEmit 통과한 상태에서만 푸시

## Success Criteria
1. MapLibre 기반 지도에 WGS84 GeoJSON 교실 폴리곤이 정확히 렌더링됨
2. 층 전환 시 해당 층 교실만 표시
3. 교실 탭 → 하이라이트 + 정보 카드
4. GPS 파란 점 + 정확도 원 표시
5. 건물 내부 진입 시 자동 건물 감지
6. 검색 → 교실 위치로 카메라 이동
7. 줌 +/-/리셋 버튼 동작
8. 기존 RTT/BLE 코드 보존 (빌드 에러 없이)
9. iOS + Android 모두 크래시 없이 동작
10. tsc --noEmit 0 errors
