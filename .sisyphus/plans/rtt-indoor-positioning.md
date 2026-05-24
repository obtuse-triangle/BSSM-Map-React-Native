# AP RTT 기반 실내 위치 측위 기능 구현

## TL;DR
> **Summary**: Android WiFi RTT(802.11mc) 네이티브 모듈 + iOS BLE RSSI/Core Location provider를 Expo Config Plugin으로 통합하여, 기존 mock 측위 프레임워크를 실제 하드웨어 동작으로 교체한다.
> **Deliverables**: Android WiFi RTT Expo 네이티브 모듈, iOS BLE/Core Location Expo 네이티브 모듈, Expo Config Plugin (권한 자동 설정), 플랫폼별 provider 자동 선택, 빌드 인프라 (expo-dev-client + eas.json)
> **Effort**: Large
> **Parallel**: YES - 4 waves
> **Critical Path**: Wave 1 (인프라) → Wave 2 (Android RTT) → Wave 3 (iOS BLE) → Wave 4 (통합)

## Context
### Original Request
모바일 프로그래밍 수행평가용 학교 지도 앱에 AP RTT 기반 실내 위치 측위 기능을 추가. Android에서 WiFi RTT API를 활용하고, iPhone에서는 BLE 비콘 시뮬레이션으로 대안 제공. 실제 하드웨어에서 동작 필수.

### Interview Summary
- **과제 완성도**: 실제 하드웨어 동작 필수 (Android 기기에서 802.11mc AP 스캔/측위)
- **iOS 대안**: BLE 비콘 시뮬레이션 (RSSI 기반 3-5m 정확도)
- **Expo 통합**: Config Plugin + Custom Dev Client (EAS Build)
- **AP 데이터**: 직접 발로 뛰면서 각 실 AP 위치(map-percent 좌표) + BSSID 수집
- **학교 AP**: 802.11mc 지원 예상, 좌표값은 없어서 수동 수집 필요

### Metis Review (gaps addressed)
- **Critical**: `positioning.ts:86`에 `source: 'mock-rtt'` 하드코딩 → `source` 파라미터화 필요
- **Critical**: `eas.json`, `expo-dev-client`, `android.package`, `ios.bundleIdentifier` 미설정 → 빌드 인프라 구축 선행 필요
- **Guard**: Expo Modules API 사용 필수 (raw NativeModules 말고) — New Architecture 호환
- **Guard**: Android API 33+에서 `NEARBY_WIFI_DEVICES` 권한 추가 필요
- **Guard**: iOS Info.plist에 `NSLocationWhenInUseUsageDescription`, `NSBluetoothAlwaysUsageDescription` 필요
- **Guard**: `pnpm + node-linker=hoisted`로 autolinking 이미 해결됨
- **Scope guard**: 인앱 AP 데이터 수집 도구는 이번 scope에서 제외 (수동 JSON 편집으로)

## Work Objectives
### Core Objective
기존 mock 기반 실내 측위를 실제 WiFi RTT (Android) + BLE RSSI (iOS) 하드웨어 측위로 교체하여, 실제 기기에서 교내 위치를 1-5m 정확도로 표시한다.

### Deliverables
1. `expo-dev-client` 설정 + `eas.json` 빌드 프로파일
2. `app.json` → `app.config.js` 전환 + Config Plugin
3. Android WiFi RTT Expo 네이티브 모듈 (Kotlin)
4. iOS BLE/Core Location Expo 네이티브 모듈 (Swift)
5. `androidRttProvider.ts` (JS bridge)
6. `iosBleProvider.ts` (JS bridge)
7. 플랫폼 자동 감지 provider 선택 로직
8. `estimateIndoorPositionFromRtt` source 파라미터화 패치

### Definition of Done (verifiable conditions with commands)
- [ ] `npx tsc --noEmit` passes
- [ ] `npx expo prebuild --clean` generates android/ with ACCESS_FINE_LOCATION + NEARBY_WIFI_DEVICES in AndroidManifest.xml
- [ ] `npx expo prebuild --clean` generates ios/ with NSLocationWhenInUseUsageDescription in Info.plist
- [ ] Android 기기에서 앱 실행 시 WiFi RTT 스캔 동작 (로그에 RttMeasurement 출력)
- [ ] iOS 기기에서 앱 실행 시 BLE 스캔 동작
- [ ] MapScreen에서 유저 위치 마커가 실제 측위 데이터로 표시
- [ ] DebugRttScreen에 실제 RTT 측정치 표시

### Must Have
- Android WiFi RTT 실측 동작
- iOS BLE RSSI 기반 측위 (Core Location fallback 포함)
- Config Plugin으로 권한 자동 설정
- 기존 provider 패턴과 호환
- `npx tsc --noEmit` 통과

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)
- **No** `android/` `ios/` 디렉토리를 git에 커밋 (gitignore 유지)
- **No** raw `ReactContextBaseJavaModule` 사용 — Expo Modules API만 사용
- **No** `positionStore.ts`, `debugStore.ts`, `DebugRttScreen.tsx` 수정 (이미 제네릭함)
- **No** 기존 type 정의 변경 (`locationTypes.ts`, `rttTypes.ts`, `position.ts`)
- **No** 인앱 AP 수집 도구 (이번 scope 제외)
- **No** 불필요한 abstraction layer (YAGNI)
- **No** AI slop: 불필요한 주석, 과도한 에러 핸들링 래퍼, unused imports

## Verification Strategy
> ZERO HUMAN INTERVENTION - all verification is agent-executed.
- Test decision: tests-after (네이티브 모듈은 JS 테스트로 타입/구조 검증, 실동작은 기기에서만 가능)
- QA policy: Every task has agent-executed scenarios
- Evidence: .sisyphus/evidence/task-{N}-{slug}.{ext}

## Execution Strategy
### Parallel Execution Waves

**Wave 1: Infrastructure** (2 tasks, foundation)
- T1: 빌드 인프라 설정 (expo-dev-client, eas.json, app.config.js 전환)
- T2: positioning.ts source 파라미터화 패치

**Wave 2: Android WiFi RTT** (3 tasks, core feature)
- T3: Expo 네이티브 모듈 스캐폴드 (Kotlin) + Config Plugin Android 권한
- T4: WifiRttManager Kotlin 구현
- T5: androidRttProvider.ts JS bridge + provider 자동 선택 로직

**Wave 3: iOS BLE/Core Location** (3 tasks, iOS alternative)
- T6: Expo 네이티브 모듈 스캐폴드 (Swift) + Config Plugin iOS 권한
- T7: BLE/CoreLocation Swift 구현
- T8: iosBleProvider.ts JS bridge

**Wave 4: Integration** (1 task)
- T9: 엔드투엔드 통합 테스트 + 실제 AP 데이터 파일 준비 가이드

### Dependency Matrix
```
T1 ──→ T3, T6
T2 ──→ T5, T8
T3 ──→ T4 ──→ T5
T6 ──→ T7 ──→ T8
T5, T8 ──→ T9
```

### Agent Dispatch Summary
| Wave | Tasks | Categories |
|------|-------|------------|
| 1 | 2 | quick, quick |
| 2 | 3 | deep, deep, unspecified-high |
| 3 | 3 | deep, deep, unspecified-high |
| 4 | 1 | unspecified-high |

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [x] 1. 빌드 인프라 설정 (expo-dev-client, eas.json, app.config.js)

  **What to do**:
  1. `npx expo install expo-dev-client` 실행
  2. `app.json` → `app.config.js`로 변환 (dynamic config 필요)
  3. `app.config.js`에 `android.package` (예: `com.schoolmap`)와 `ios.bundleIdentifier` 설정
  4. `eas.json` 생성 (development, preview, production 프로파일)
  5. `.gitignore`에 `android/`, `ios/` 있는지 확인 (이미 있으면 유지)
  **Must NOT do**: android/ ios/ 디렉토리를 생성하거나 커밋하지 않음. `npx expo prebuild`는 나중에 함.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: 설정 파일 수정만, 복잡도 낮음
  - Skills: `customize-opencode` - Expo 설정 수정
  - Omitted: 불필요

  **Parallelization**: Can Parallel: YES (T2와 병렬) | Wave 1 | Blocks: T3, T6 | Blocked By: none

  **References**:
  - Current: `app.json` - Expo 설정 현재 상태
  - Pattern: Expo SDK 54 docs - `expo-dev-client` 설치, `app.config.js` 변환, `eas.json` 스키마
  - Current: `.gitignore` - android/ ios/ 제외 확인

  **Acceptance Criteria** (agent-executable only):
  - [ ] `package.json`에 `expo-dev-client` 의존성 존재
  - [ ] `app.config.js` 파일 존재, `app.json` 제거 또는 최소화
  - [ ] `app.config.js`에 `android.package` 문자열 정의됨
  - [ ] `app.config.js`에 `ios.bundleIdentifier` 문자열 정의됨
  - [ ] `eas.json` 파일 존재, `builds.development`, `builds.preview`, `builds.production` 프로파일 포함
  - [ ] `.gitignore`에 `android/` 및 `ios/` 항목 존재
  - [ ] `npx tsc --noEmit` 통과

  **QA Scenarios** (MANDATORY):
  ```
  Scenario: Config 파일 구조 검증
    Tool: Bash
    Steps: 
      1. cat app.config.js | grep "android" -A 3
      2. cat app.config.js | grep "ios" -A 3
      3. cat eas.json | python3 -m json.tool
    Expected: android.package, ios.bundleIdentifier 문자열 존재, eas.json 유효한 JSON
    Evidence: .sisyphus/evidence/task-1-infra-config.txt

  Scenario: TypeScript 컴파일 통과
    Tool: Bash
    Steps: npx tsc --noEmit
    Expected: exit code 0, no errors
    Evidence: .sisyphus/evidence/task-1-tsc.txt
  ```

  **Commit**: YES | Message: `build: add expo-dev-client, eas.json, convert to app.config.js` | Files: package.json, app.config.js, eas.json, .gitignore

- [x] 2. positioning.ts source 파라미터화 패치

  **What to do**:
  1. `src/utils/positioning.ts`의 `estimateIndoorPositionFromRtt` 함수에 `source?: IndoorPositionSource` 파라미터 추가 (기본값 `'mock-rtt'` 유지)
  2. 반환 객체의 `source` 필드에 파라미터 값 사용 (하드코딩 `'mock-rtt'` 교체)
  3. 기존 호출부 (`mockIndoorLocationProvider.ts`)는 변경 불필요 (기본값으로 동작)
  **Must NOT do**: 기존 mock 동작 변경하지 않음. source 파라미터 없이 호출 시 기존과 동일하게 동작해야 함.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: 단일 함수 시그니처 수정
  - Skills: [] 
  - Omitted: 불필요

  **Parallelization**: Can Parallel: YES (T1과 병렬) | Wave 1 | Blocks: T5, T8 | Blocked By: none

  **References**:
  - Target: `src/utils/positioning.ts:86` - 하드코딩된 `source: 'mock-rtt'` 위치
  - Type: `src/types/position.ts` - `IndoorPositionSource` 타입 정의
  - Pattern: `src/services/location/mockIndoorLocationProvider.ts` - 기존 호출부 (변경 불필요, 기본값 사용)

  **Acceptance Criteria** (agent-executable only):
  - [ ] `estimateIndoorPositionFromRtt` 함수 시그니처에 `source` 파라미터 존재
  - [ ] `source` 파라미터 기본값이 `'mock-rtt'`
  - [ ] 반환 객체의 `position.source`가 파라미터 값 사용
  - [ ] `npx tsc --noEmit` 통과
  - [ ] 기존 mock provider 테스트와 동일한 동작 보장 (source 생략 시 'mock-rtt')

  **QA Scenarios** (MANDATORY):
  ```
  Scenario: source 파라미터 동작 검증
    Tool: Bash
    Steps:
      1. npx tsc --noEmit
      2. grep -n "source" src/utils/positioning.ts
    Expected: source 파라미터 존재, 기본값 'mock-rtt', 하드코딩 제거됨
    Evidence: .sisyphus/evidence/task-2-source-param.txt

  Scenario: 기존 동작 보존
    Tool: Bash
    Steps: npx tsc --noEmit
    Expected: exit code 0 — mockIndoorLocationProvider.ts 변경 없이도 컴파일 통과
    Evidence: .sisyphus/evidence/task-2-tsc.txt
  ```

  **Commit**: YES | Message: `refactor: parameterize source in estimateIndoorPositionFromRtt` | Files: src/utils/positioning.ts

- [x] 3. Android WiFi RTT Expo 네이티브 모듈 스캐폴드 + Config Plugin 권한

  **What to do**:
  1. `modules/` 디렉토리 생성 (프로젝트 루트)
  2. `modules/android-wifi-rtt/` Expo 모듈 스캐폴드 생성:
     - `expo-module.config.json`
     - `android/build.gradle`
     - `android/src/main/java/expo/modules/wifirtt/WifiRttModule.kt` (빈 클래스)
     - `src/index.ts` (TS 타입 정의 + 함수 export)
  3. Config Plugin 작성:
     - `app.config.js`의 plugins 배열에 추가
     - Android: `AndroidManifest.xml`에 `ACCESS_FINE_LOCATION`, `ACCESS_WIFI_STATE`, `NEARBY_WIFI_DEVICES` (API 33+) 추가
     - `NEARBY_WIFI_DEVICES`는 API 33+ 전용이므로 `<uses-permission android:maxSdkVersion="32">` 분기 처리
  4. `package.json`에 로컬 모듈 참조 추가
  **Must NOT do**: android/ ios/ 루트 디렉토리 생성하지 않음. modules/ 안에만 작업.

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: Expo Modules API + Config Plugin은 복잡한 설정 필요
  - Skills: []
  - Omitted: 불필요

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: T4 | Blocked By: T1

  **References**:
  - Pattern: Expo Modules API — `expo-module` 패키지로 네이티브 모듈 생성 방법
  - Pattern: Expo Config Plugin — `withAndroidManifest`, `withInfoPlist` mod 상속
  - Target: `app.config.js` (T1에서 생성) — plugins 배열에 추가
  - Existing types: `src/services/rtt/rttTypes.ts` — `RttMeasurement`, `RttScanResult` 타입 (JS 브릿지와 동일한 구조 사용)
  - Existing types: `src/types/accessPoint.ts` — `AccessPoint` 타입
  - Android API: `WifiRttManager` — `ACTION_WIFI_RTT_STATE_CHANGED`, `RttManager.startRtt()`

  **Acceptance Criteria** (agent-executable only):
  - [ ] `modules/android-wifi-rtt/expo-module.config.json` 존재
  - [ ] `modules/android-wifi-rtt/android/build.gradle` 존재
  - [ ] `modules/android-wifi-rtt/android/src/main/java/expo/modules/wifirtt/WifiRttModule.kt` 존재, ` ExpoModuleBase` 상속
  - [ ] `modules/android-wifi-rtt/src/index.ts` export 존재
  - [ ] `app.config.js` plugins 배열에 config plugin 참조 포함
  - [ ] `npx expo prebuild --clean` 후 `android/app/src/main/AndroidManifest.xml`에 `ACCESS_FINE_LOCATION` 포함
  - [ ] `npx expo prebuild --clean` 후 AndroidManifest.xml에 `NEARBY_WIFI_DEVICES` 포함
  - [ ] `npx tsc --noEmit` 통과

  **QA Scenarios** (MANDATORY):
  ```
  Scenario: 모듈 스캐폴드 구조 검증
    Tool: Bash
    Steps:
      1. ls -la modules/android-wifi-rtt/
      2. cat modules/android-wifi-rtt/expo-module.config.json
      3. cat modules/android-wifi-rtt/android/build.gradle
    Expected: 모든 필수 파일 존재, build.gradle에 올바른 의존성
    Evidence: .sisyphus/evidence/task-3-scaffold.txt

  Scenario: Config Plugin 권한 삽입 검증
    Tool: Bash
    Steps:
      1. npx expo prebuild --clean --platform android
      2. grep "ACCESS_FINE_LOCATION" android/app/src/main/AndroidManifest.xml
      3. grep "NEARBY_WIFI_DEVICES" android/app/src/main/AndroidManifest.xml
    Expected: 두 권한 모두 Manifest에 존재
    Evidence: .sisyphus/evidence/task-3-permissions.txt
  ```

  **Commit**: YES | Message: `feat(android): scaffold Expo native module for WiFi RTT` | Files: modules/android-wifi-rtt/**, app.config.js

- [x] 4. WifiRttManager Kotlin 구현

  **What to do**:
  1. `WifiRttModule.kt`에 다음 함수 구현:
     - `isAvailable(): Boolean` — `WifiRttManager.isAvailable()` 래핑
     - `startRttScan(bssids: List<String>): Promise<List<RttMeasurement>>` — 지정된 BSSID 목록에 대해 RTT ranging 수행
     - `getAvailableAccessPoints(): Promise<List<ScanResult>>` — 현재 스캔 가능한 AP 목록 반환 (RTT 지원 필터링)
  2. RTT 측정 결과를 `RttMeasurement` 타입으로 매핑:
     - `bssid`: String
     - `distanceMm`: Int (RTT 결과)
     - `distanceStdDevMm`: Int
     - `rssi`: Int
     - `success`: Boolean
  3. 에러 처리: RTT 미지원 기기, 위치 서비스 OFF, 권한 거부 케이스
  4. `expo-modules-core`의 `Promise` 타입 사용하여 비동기 결과 반환
  **Must NOT do**: UI 코드 포함하지 않음. JS 브릿지 역할만. 순수 Kotlin.

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: WifiRttManager API 이해 + Kotlin 네이티브 구현 + 비동기 처리
  - Skills: []
  - Omitted: 불필요

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: T5 | Blocked By: T3

  **References**:
  - Target: `modules/android-wifi-rtt/android/src/main/java/expo/modules/wifirtt/WifiRttModule.kt` (T3에서 생성)
  - API: Android `WifiRttManager` — `startRttRanging()`, `RangingResult`, `RangingRequest`
  - API: Android `WifiManager.scanResults` — AP BSSID/SSID 조회
  - API: Android `ScanResult.is80211mcResponder()` — RTT 지원 AP 필터링
  - Type: `src/services/rtt/rttTypes.ts` — `RttMeasurement` 인터페이스 (distanceMm, distanceStdDevMm, rssi, success, bssid)
  - Pattern: Expo Modules API async function — `AsyncFunction` 어노테이션

  **Acceptance Criteria** (agent-executable only):
  - [ ] `WifiRttModule.kt`에 `isAvailable()` 함수 존재
  - [ ] `startRttScan(bssids)` AsyncFunction 존재
  - [ ] `getAvailableAccessPoints()` AsyncFunction 존재
  - [ ] RTT 결과가 `RttMeasurement` 구조로 매핑됨 (bssid, distanceMm, distanceStdDevMm, rssi, success)
  - [ ] 에러 케이스: RTT 미지원 → 의미 있는 에러 메시지
  - [ ] `npx tsc --noEmit` 통과

  **QA Scenarios** (MANDATORY):
  ```
  Scenario: Kotlin 코드 컴파일 검증
    Tool: Bash
    Steps:
      1. npx expo prebuild --clean --platform android
      2. ./android/gradlew -p android assembleDebug 2>&1 | tail -20
    Expected: BUILD SUCCESSFUL (compile error 없음)
    Evidence: .sisyphus/evidence/task-4-kotlin-compile.txt

  Scenario: 함수 export 검증
    Tool: Bash
    Steps:
      1. grep -n "AsyncFunction\|Function" modules/android-wifi-rtt/android/src/main/java/expo/modules/wifirtt/WifiRttModule.kt
    Expected: isAvailable, startRttScan, getAvailableAccessPoints 3개 함수 정의됨
    Evidence: .sisyphus/evidence/task-4-functions.txt
  ```

  **Commit**: YES | Message: `feat(android): implement WifiRttManager Kotlin scanner` | Files: modules/android-wifi-rtt/android/**

- [x] 5. androidRttProvider.ts JS bridge + 플랫폼 자동 선택 로직

  **What to do**:
  1. `src/services/location/androidRttProvider.ts` 생성:
     - `IndoorLocationProvider` 인터페이스 구현
     - `kind: 'android-wifi-rtt'`
     - `locate()` 메서드: 네이티브 모듈 호출 → `estimateIndoorPositionFromRtt(측정치, source='android-wifi-rtt')`
     - AP 데이터에서 BSSID 목록 생성 후 `startRttScan()` 호출
  2. `src/services/location/providerRegistry.ts` (또는 기존 `indoorLocationProvider.ts` 확장):
     - `Platform.OS` 기반 자동 provider 선택
     - Android → `androidRttProvider`
     - iOS → `iosBleProvider` (Wave 3에서 구현)
     - Fallback → `mockIndoorLocationProvider`
  3. 앱 초기화 시 provider 자동 등록
  **Must NOT do**: `positionStore.ts`, `MapScreen`, `DebugRttScreen` 수정 불필요. Provider만 교체.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: JS bridge 로직 + 기존 패턴과의 통합
  - Skills: []
  - Omitted: 불필요

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: T9 | Blocked By: T2, T4

  **References**:
  - Interface: `src/services/location/locationTypes.ts` — `IndoorLocationProvider` 인터페이스 (`kind`, `label`, `locate()`)
  - Pattern: `src/services/location/mockIndoorLocationProvider.ts` — 참조 구현체 (동일한 인터페이스 구현 방식)
  - Pattern: `src/services/location/indoorLocationProvider.ts` — singleton get/set/reset
  - Target: `src/utils/positioning.ts` — `estimateIndoorPositionFromRtt(measurements, accessPoints, floorKey, source='android-wifi-rtt')` (T2에서 파라미터화됨)
  - Native module: `modules/android-wifi-rtt/src/index.ts` — 네이티브 모듈 export (T3에서 생성)
  - Types: `src/services/rtt/rttTypes.ts` — `RttMeasurement`, `RttScanRequest`, `RttScanResult`
  - Data: `src/utils/accessPoint.ts` — `getAccessPointsForFloor()` AP 데이터 접근

  **Acceptance Criteria** (agent-executable only):
  - [ ] `src/services/location/androidRttProvider.ts` 파일 존재
  - [ ] `createAndroidRttProvider()` 함수가 `IndoorLocationProvider` 타입 반환
  - [ ] 반환 객체의 `kind`가 `'android-wifi-rtt'`
  - [ ] `locate()` 메서드가 `estimateIndoorPositionFromRtt` 호출 시 `source='android-wifi-rtt'` 전달
  - [ ] Platform.OS 기반 자동 선택 로직 존재
  - [ ] Android에서 `getIndoorLocationProvider().kind === 'android-wifi-rtt'`
  - [ ] `npx tsc --noEmit` 통과

  **QA Scenarios** (MANDATORY):
  ```
  Scenario: Provider 타입 검증
    Tool: Bash
    Steps:
      1. npx tsc --noEmit
      2. grep -n "kind.*android-wifi-rtt" src/services/location/androidRttProvider.ts
    Expected: kind 프로퍼티가 'android-wifi-rtt'로 설정됨
    Evidence: .sisyphus/evidence/task-5-provider-type.txt

  Scenario: 자동 선택 로직 검증
    Tool: Bash
    Steps:
      1. grep -n "Platform.OS\|getIndoorLocationProvider\|setIndoorLocationProvider" src/services/location/indoorLocationProvider.ts
    Expected: Platform import 존재, OS 분기 로직 존재
    Evidence: .sisyphus/evidence/task-5-auto-select.txt
  ```

  **Commit**: YES | Message: `feat(android): add androidRttProvider JS bridge + auto-selection` | Files: src/services/location/androidRttProvider.ts, src/services/location/indoorLocationProvider.ts

- [x] 6. iOS BLE/Core Location Expo 네이티브 모듈 스캐폴드 + Config Plugin 권한

  **What to do**:
  1. `modules/ios-ble-positioning/` Expo 모듈 스캐폴드 생성:
     - `expo-module.config.json`
     - `ios/*.podspec` 또는 SPM 설정
     - `ios/ExpoBlePositioningModule.swift` (빈 클래스)
     - `src/index.ts` (TS 타입 정의 + 함수 export)
  2. Config Plugin에 iOS 권한 추가:
     - `NSLocationWhenInUseUsageDescription` — "교내 위치 안내를 위해 위치 접근이 필요합니다."
     - `NSBluetoothAlwaysUsageDescription` — "실내 위치 측위를 위해 Bluetooth 접근이 필요합니다."
     - `NSBluetoothPeripheralUsageDescription` (iOS 13 이전 호환)
  3. `package.json`에 로컬 모듈 참조 추가
  **Must NOT do**: ios/ 루트 디렉토리 생성하지 않음. modules/ 안에만 작업.

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: Expo Modules API iOS 설정 + 권한
  - Skills: []
  - Omitted: 불필요

  **Parallelization**: Can Parallel: YES (T3-T5와 병렬 실행 가능, T1 이후) | Wave 3 | Blocks: T7 | Blocked By: T1

  **References**:
  - Pattern: T3과 동일한 Expo Modules API 패턴 (iOS 버전)
  - Target: `app.config.js` (T1에서 생성, T3에서 plugins 추가됨) — iOS 권한 추가
  - Existing types: `src/services/rtt/rttTypes.ts` — `RttMeasurement` 구조 (BLE에서도 동일 구조 재사용)
  - API: iOS `CoreBluetooth` — `CBCentralManager`, `CBPeripheral`, RSSI
  - API: iOS `CoreLocation` — `CLLocationManager`, lat/lng (fallback)

  **Acceptance Criteria** (agent-executable only):
  - [ ] `modules/ios-ble-positioning/expo-module.config.json` 존재
  - [ ] `modules/ios-ble-positioning/ios/` 디렉토리에 Swift 모듈 파일 존재
  - [ ] `modules/ios-ble-positioning/src/index.ts` export 존재
  - [ ] `npx expo prebuild --clean --platform ios` 후 Info.plist에 `NSLocationWhenInUseUsageDescription` 포함
  - [ ] Info.plist에 `NSBluetoothAlwaysUsageDescription` 포함
  - [ ] `npx tsc --noEmit` 통과

  **QA Scenarios** (MANDATORY):
  ```
  Scenario: iOS 모듈 스캐폴드 검증
    Tool: Bash
    Steps:
      1. ls -la modules/ios-ble-positioning/
      2. cat modules/ios-ble-positioning/expo-module.config.json
    Expected: 필수 파일 존재
    Evidence: .sisyphus/evidence/task-6-ios-scaffold.txt

  Scenario: iOS 권한 삽입 검증
    Tool: Bash
    Steps:
      1. npx expo prebuild --clean --platform ios
      2. grep "NSLocationWhenInUseUsageDescription" ios/<project>/Info.plist
      3. grep "NSBluetoothAlwaysUsageDescription" ios/<project>/Info.plist
    Expected: 두 권한 모두 Info.plist에 존재
    Evidence: .sisyphus/evidence/task-6-ios-permissions.txt
  ```

  **Commit**: YES | Message: `feat(ios): scaffold Expo native module for BLE/Core Location` | Files: modules/ios-ble-positioning/**, app.config.js

- [x] 7. BLE/CoreLocation Swift 구현

  **What to do**:
  1. `ExpoBlePositioningModule.swift`에 다음 구현:
     - **BLE RSSI scanning**: `CBCentralManager`로 주변 BLE 기기 스캔
     - `startBleScan(serviceUuids: List<String>?): Promise<List<BleMeasurement>>` — BLE 스캔 결과 반환
     - `BleMeasurement` 구조: `identifier`, `rssi`, `distanceEstimate` (RSSI → 거리 변환)
     - RSSI → 거리 변환: log-distance path loss 모델 사용 (`d = 10^((txPower - rssi) / (10 * N))`)
     - **Core Location fallback**: `CLLocationManager`로 lat/lng 획득 (BLE 불가 시)
     - `getCurrentLocation(): Promise<LatLn>` — Core Location 결과 반환
  2. `iosCoreLocationAdapter.ts` (기존)와 연동 가능한 구조 유지
  3. 에러 처리: Bluetooth OFF, 권한 거부, Bluetooth unavailable (iPad 등)
  **Must NOT do**: UI 코드 포함하지 않음. 순수 Swift.

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: CoreBluetooth + CoreLocation API 조합 + RSSI→거리 변환
  - Skills: []
  - Omitted: 불필요

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: T8 | Blocked By: T6

  **References**:
  - Target: `modules/ios-ble-positioning/ios/ExpoBlePositioningModule.swift` (T6에서 생성)
  - Existing: `src/services/calibration/iosCalibration.ts` — lat/lng → map-percent 변환 (Core Location fallback 시 사용)
  - Existing: `src/services/location/iosCoreLocationAdapter.ts` — 기존 iOS adapter (참고용)
  - Type: `src/services/rtt/rttTypes.ts` — `RttMeasurement` 구조 (BLE에서도 동일 구조로 매핑)
  - API: iOS `CBCentralManager` — `scanForPeripherals()`, `delegate.didDiscover`
  - API: iOS `CLLocationManager` — `requestLocation()`, `delegate.didUpdateLocations`
  - RSSI→거리 모델: Path-loss model `d = 10^((TxPower - RSSI) / (10 * N))`, N=2 (free space) ~ 4 (indoor)

  **Acceptance Criteria** (agent-executable only):
  - [ ] `startBleScan()` AsyncFunction 존재
  - [ ] `getCurrentLocation()` AsyncFunction 존재
  - [ ] BLE 결과가 `RttMeasurement` 호환 구조로 매핑됨
  - [ ] RSSI → 거리 변환 로직 포함
  - [ ] Core Location fallback 포함
  - [ ] `npx tsc --noEmit` 통과

  **QA Scenarios** (MANDATORY):
  ```
  Scenario: Swift 코드 구조 검증
    Tool: Bash
    Steps:
      1. grep -n "AsyncFunction\|Function" modules/ios-ble-positioning/ios/ExpoBlePositioningModule.swift
      2. grep -n "CBCentralManager\|CLLocationManager" modules/ios-ble-positioning/ios/ExpoBlePositioningModule.swift
    Expected: startBleScan, getCurrentLocation 함수 정의됨, CBCentralManager/CLLocationManager import 존재
    Evidence: .sisyphus/evidence/task-7-swift-structure.txt

  Scenario: iOS 빌드 검증
    Tool: Bash
    Steps:
      1. npx expo prebuild --clean --platform ios
      2. xcodebuild -workspace ios/*.xcworkspace -scheme <scheme> -sdk iphonesimulator build 2>&1 | tail -20
    Expected: BUILD SUCCEEDED
    Evidence: .sisyphus/evidence/task-7-ios-build.txt
  ```

  **Commit**: YES | Message: `feat(ios): implement BLE/CoreLocation Swift scanner` | Files: modules/ios-ble-positioning/ios/**

- [x] 8. iosBleProvider.ts JS bridge

  **What to do**:
  1. `src/services/location/iosBleProvider.ts` 생성:
     - `IndoorLocationProvider` 인터페이스 구현
     - `kind: 'ios-core-location'` (기존 타입 재사용)
     - `locate()` 메서드: 
       - 우선 BLE 스캔 시도 → RSSI 결과로 `estimateIndoorPositionFromRtt(measurements, aps, floorKey, 'ios-core-location')` 
       - BLE 실패 시 Core Location lat/lng → 기존 `iosCalibration.ts`로 map-percent 변환
  2. T5에서 만든 자동 선택 로직에 iOS 분기 추가 (Android는 이미 추가됨)
  **Must NOT do**: positionStore, MapScreen, DebugRttScreen 수정 불필요.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: 기존 패턴 따라 구현
  - Skills: []
  - Omitted: 불필요

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: T9 | Blocked By: T2, T7

  **References**:
  - Interface: `src/services/location/locationTypes.ts` — `IndoorLocationProvider`
  - Pattern: `src/services/location/androidRttProvider.ts` (T5에서 생성) — 동일한 패턴
  - Pattern: `src/services/location/mockIndoorLocationProvider.ts` — 원래 참조 구현
  - Existing: `src/services/calibration/iosCalibration.ts` — `calibrateLatLngToMapPercent()`, `createIosCalibratedIndoorPosition()` (Core Location fallback용)
  - Existing: `src/services/location/iosCoreLocationAdapter.ts` — 기존 iOS adapter 참고
  - Native module: `modules/ios-ble-positioning/src/index.ts` (T6에서 생성)
  - Target: `src/services/location/indoorLocationProvider.ts` — iOS 분기 추가

  **Acceptance Criteria** (agent-executable only):
  - [ ] `src/services/location/iosBleProvider.ts` 파일 존재
  - [ ] `createIosBleProvider()` 함수가 `IndoorLocationProvider` 타입 반환
  - [ ] 반환 객체의 `kind`가 `'ios-core-location'`
  - [ ] BLE 우선 → Core Location fallback 로직 포함
  - [ ] iOS에서 `getIndoorLocationProvider().kind === 'ios-core-location'`
  - [ ] `npx tsc --noEmit` 통과

  **QA Scenarios** (MANDATORY):
  ```
  Scenario: iOS provider 타입 검증
    Tool: Bash
    Steps:
      1. npx tsc --noEmit
      2. grep -n "kind.*ios-core-location" src/services/location/iosBleProvider.ts
    Expected: kind가 'ios-core-location', tsc 통과
    Evidence: .sisyphus/evidence/task-8-ios-provider.txt

  Scenario: Fallback 로직 검증
    Tool: Bash
    Steps: grep -n "CoreLocation\|calibrat\|fallback" src/services/location/iosBleProvider.ts
    Expected: BLE → Core Location fallback 분기 로직 존재
    Evidence: .sisyphus/evidence/task-8-fallback.txt
  ```

  **Commit**: YES | Message: `feat(ios): add iosBleProvider JS bridge` | Files: src/services/location/iosBleProvider.ts, src/services/location/indoorLocationProvider.ts

- [x] 9. 엔드투엔드 통합 테스트 + AP 데이터 수집 가이드

  **What to do**:
  1. 통합 테스트:
     - `npx expo prebuild --clean` → android/ ios/ 생성 확인
     - Android 빌드: `./android/gradlew assembleDebug`
     - iOS 빌드: `xcodebuild` (시뮬레이터)
     - TypeScript: `npx tsc --noEmit`
  2. `docs/ap-data-collection-guide.md` 작성:
     - 학교 AP BSSID 수집 방법 (Android WiFi 스캐너 앱 사용)
     - map-percent 좌표 계산 방법 (SVG 맵 기준)
     - `src/constants/bssmFloorMap.ts`의 AP 데이터 입력 형식 가이드
     - 예시 JSON 구조 (BSSID, map-percent x/y, floor, room)
  3. 샘플 AP 데이터 파일: `src/constants/realAccessPoints.ts` (빈 템플릿 + 타입 가이드)
  **Must NOT do**: 실제 AP 데이터를 입력하지 않음 (사용자가 직접 수집). 템플릿만 제공.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: 통합 검증 + 문서 작성
  - Skills: []
  - Omitted: 불필요

  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: none | Blocked By: T5, T8

  **References**:
  - Target: `app.config.js` — 전체 설정
  - Target: `modules/android-wifi-rtt/` — Android 네이티브 모듈
  - Target: `modules/ios-ble-positioning/` — iOS 네이티브 모듈
  - Existing: `src/constants/bssmFloorMap.ts` — 현재 floor 데이터 구조 (AP 데이터 추가 위치)
  - Existing: `src/types/accessPoint.ts` — `AccessPoint` 타입 (BSSID, x, y 등)
  - Existing: `src/utils/accessPoint.ts` — `getAccessPointsForFloor()` (현재 mock → real 데이터로 교체 가이드)

  **Acceptance Criteria** (agent-executable only):
  - [ ] `npx tsc --noEmit` 통과
  - [ ] `npx expo prebuild --clean --platform android` 성공
  - [ ] `npx expo prebuild --clean --platform ios` 성공
  - [ ] Android Manifest에 필수 권한 포함
  - [ ] iOS Info.plist에 필수 권한 설명 포함
  - [ ] `docs/ap-data-collection-guide.md` 존재
  - [ ] `src/constants/realAccessPoints.ts` 템플릿 존재
  - [ ] 모든 provider가 올바른 `kind` 반환

  **QA Scenarios** (MANDATORY):
  ```
  Scenario: 전체 빌드 파이프라인
    Tool: Bash
    Steps:
      1. npx tsc --noEmit
      2. npx expo prebuild --clean
      3. grep "ACCESS_FINE_LOCATION" android/app/src/main/AndroidManifest.xml
      4. grep "NSLocationWhenInUseUsageDescription" ios/*/Info.plist
      5. grep "android-wifi-rtt\|ios-core-location" src/services/location/indoorLocationProvider.ts
    Expected: TypeScript 통과, prebuild 성공, 권한 존재, provider 자동 선택 로직 존재
    Evidence: .sisyphus/evidence/task-9-e2e.txt

  Scenario: 가이드 문서 검증
    Tool: Bash
    Steps:
      1. test -f docs/ap-data-collection-guide.md && echo "EXISTS"
      2. test -f src/constants/realAccessPoints.ts && echo "EXISTS"
    Expected: 두 파일 모두 존재
    Evidence: .sisyphus/evidence/task-9-docs.txt
  ```

  **Commit**: YES | Message: `docs: add AP data collection guide and real data template` | Files: docs/ap-data-collection-guide.md, src/constants/realAccessPoints.ts

## Final Verification Wave (MANDATORY — after ALL implementation tasks)
> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.
- [ ] F1. Plan Compliance Audit — oracle
- [ ] F2. Code Quality Review — unspecified-high
- [ ] F3. Real Manual QA — unspecified-high (+ playwright if UI)
- [ ] F4. Scope Fidelity Check — deep

## Commit Strategy
```
1. build: add expo-dev-client, eas.json, convert app.json to app.config.js
2. refactor: parameterize source in estimateIndoorPositionFromRtt
3. feat(android): scaffold Expo native module for WiFi RTT
4. feat(android): implement WifiRttManager Kotlin scanner
5. feat(android): add androidRttProvider JS bridge + auto-selection
6. feat(ios): scaffold Expo native module for BLE/Core Location
7. feat(ios): implement BLE/CoreLocation Swift scanner
8. feat(ios): add iosBleProvider JS bridge
9. docs: add AP data collection guide
```
각 커밋은 `npx tsc --noEmit` 통과 필수.

## Success Criteria
1. `npx tsc --noEmit` 통과
2. `npx expo prebuild --clean` 성공적으로 android/ ios/ 생성
3. Android 기기에서 실제 WiFi RTT 스캔 동작
4. iOS 기기에서 BLE 스캔 또는 Core Location 동작
5. MapScreen에 실제 측위 기반 유저 위치 마커 표시
6. DebugRttScreen에 실제 측정치 표시
7. mock provider를 real provider로 자동 전환
