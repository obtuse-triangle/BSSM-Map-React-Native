# AP 데이터 수집 가이드

이 문서는 BSSM 학교 지도 앱에서 실제 AP(Access Point) 데이터를 수집하여 `src/constants/realAccessPoints.ts`에 입력하는 방법을 안내합니다.

---

## 1. BSSID 수집 방법

### 필요한 도구
- **Android**: WiFi Analyzer ([Google Play](https://play.google.com/store/apps/details?id=com.farproc.wifi.analyzer)) 또는 유사한 WiFi 스캐너 앱
- **iOS**: Apple은 WiFi 스캔 API를 제한하므로, Android 기기로 수집 후 iOS에서 동일한 BSSID 사용

### 수집 절차
1. 각 교실 중앙에 서서 WiFi 스캐너 앱 실행
2. 해당 교실의 AP(또는 가장 가까운 AP)의 **BSSID** (MAC 주소 형식, 예: `AA:BB:CC:DD:EE:01`) 기록
3. AP의 **SSID** (네트워크 이름)도 함께 기록
4. 동일 교실에서 여러 AP가 감지되면 **신호 세기가 가장 강한 AP** 선택
5. 교실 번호, BSSID, SSID를 함께 기록

### 기록 양식 (예시)
| 교실 | BSSID | SSID | 비고 |
|------|-------|------|------|
| 3-1 | AA:BB:CC:DD:EE:01 | BSSM-WIFI | 교실 중앙 |
| 3-2 | AA:BB:CC:DD:EE:02 | BSSM-WIFI | 창가 쪽 |
| 3-3 | AA:BB:CC:DD:EE:03 | BSSM-WIFI | 교실 중앙 |

> **참고**: AP BSSID는 건물 WiFi 인프라에 따라 동일한 SSID를 가진 여러 AP가 존재할 수 있습니다. 가장 가까운 AP의 BSSID를 기록하세요.

---

## 2. map-percent 좌표 계산 방법

이 앱은 지리적 좌표(lat/lng) 대신 **map-percent** 좌표계를 사용합니다.
SVG 맵 기준으로 각 교실의 중심 좌표를 계산합니다.

### 좌표 확인 방법

**방법 A: bssmFloorMap.ts에서 확인 (권장)**
`src/constants/bssmFloorMap.ts`에 각 교실의 `x`, `y`, `width`, `height`가 퍼센트 값으로 저장되어 있습니다.

교실의 중심 좌표는 다음과 같이 계산합니다:

```
centerX = room.x + room.width / 2
centerY = room.y + room.height / 2
```

예시: `bssmFloorMap.ts`에서 3층 3-1 교실 데이터
```typescript
{
  id: 12,
  name: "3-1",
  x: 62.49,       // ← 왼쪽 기준 퍼센트
  y: 13,           // ← 위쪽 기준 퍼센트
  width: 5.59,
  height: 6,
  interactive: true
}
```

계산:
```
centerX = 62.49 + 5.59 / 2 ≈ 65.29
centerY = 13 + 6 / 2 = 16
```

**방법 B: SVG 맵에서 직접 측정**
- 웹 브라우저에서 SVG 맵을 열고 각 교실 영역의 중앙 좌표를 측정
- 측정한 px 값을 SVG 전체 크기에 대한 퍼센트로 변환
- `(좌표 / SVG 전체 크기) × 100`

---

## 3. 데이터 입력 형식

AP 데이터는 `AccessPoint` 타입을 따릅니다:

```typescript
// src/types/accessPoint.ts
export interface AccessPoint {
  id: string;                    // 고유 식별자 (예: 'ap-3-12')
  floorKey: FloorKey;            // 층 키 - bssmFloorMap.ts의 키 (예: '1', '2', '3', '4')
  roomId: number;                // 교실 ID - bssmFloorMap.ts의 elements[n].id 값
  roomName: string;              // 교실 이름 (예: '3-1')
  ssid: string;                  // WiFi SSID
  bssid: string;                 // AP MAC 주소 (예: 'AA:BB:CC:DD:EE:01')
  x: number;                     // map-percent x 좌표 (0-100)
  y: number;                     // map-percent y 좌표 (0-100)
  heightMeters: number;          // AP 설치 높이 (일반적으로 2.7)
  coordinateMode: 'map-percent'; // 좌표 모드 (고정값)
  source: 'room-center';         // 데이터 소스 (타입 확장 필요, 아래 설명 참고)
}
```

### ⚠️ `source` 필드 타입 확장 필요

현재 `AccessPointSource` 타입은 `'room-center'`만 허용합니다.
수동 수집 데이터를 추가하려면 **타입 확장**이 필요합니다:

```typescript
// src/types/accessPoint.ts
// 변경 전: export type AccessPointSource = 'room-center';
// 변경 후: export type AccessPointSource = 'room-center' | 'manual-collection';
```

데이터를 `realAccessPoints.ts`에 추가할 때는 `source: 'room-center' as const`로 작성하거나,
타입을 먼저 확장한 후 `source: 'manual-collection'`을 사용하세요.

### 전체 예시 (realAccessPoints.ts에 추가할 데이터)

```typescript
{
  id: 'ap-3-12',
  floorKey: '3',
  roomId: 12,
  roomName: '3-1',
  ssid: 'BSSM-WIFI',          // ← 실제 WiFi SSID로 교체
  bssid: 'AA:BB:CC:DD:EE:01', // ← 실제 수집한 BSSID로 교체
  x: 65.29,                    // ← 계산한 map-percent x 좌표
  y: 16,                       // ← 계산한 map-percent y 좌표
  heightMeters: 2.7,
  coordinateMode: 'map-percent',
  source: 'room-center' as const,
}
```

---

## 4. 802.11mc (WiFi RTT) 확인

802.11mc(WiFi RTT, IEEE 802.11mc-2016)를 지원하는 AP는 더 정밀한 거리 측정이 가능합니다.

### Android에서 확인 방법

Android WiFi RTT 네이티브 모듈의 `getAvailableAccessPoints()` 메서드를 사용하면
각 AP의 `is80211mcResponder` 속성을 확인할 수 있습니다:

```typescript
import { AndroidWifiRtt } from '../../modules/android-wifi-rtt/src';

const accessPoints = await AndroidWifiRtt.getAvailableAccessPoints();
for (const ap of accessPoints) {
  console.log(`${ap.bssid}: 802.11mc=${ap.is80211mcResponder}`);
}
```

### 지원 여부 판단 기준
- **지원 AP (`is80211mcResponder === true`)**: 최신 기업용 AP (Cisco, Aruba, Ubiquiti 등)
- **미지원 AP (`is80211mcResponder === false`)**: 오래된 라우터, 저가형 AP
- Android 9+ 기기는 RTT 지원, AP 자체가 802.11mc responder 역할을 해야 함

### RTT 지원 AP 선호
- `is80211mcResponder === true`인 AP가 있다면 해당 AP 우선 사용
- RTT 미지원 AP는 RSSI 기반 거리 추정만 가능 (정밀도 낮음)
- 가능하면 교실당 3개 이상의 RTT 지원 AP 수집 권장

### 앱 디버그 화면에서 확인
앱의 Debug RTT 화면에서 AP 목록과 802.11mc 지원 여부를 확인할 수 있습니다.

---

## 5. mock BSSID와 실제 BSSID 구분

### mock BSSID 특징
- `02:XX:XX:XX:XX:XX` 형식 (로컬 관리 MAC 주소, IEEE 로컬 비트 설정)
- `src/utils/accessPoint.ts`의 `buildMockBssid()` 함수로 해시 기반 생성
- 동일 교실에서는 항상 같은 mock BSSID 생성 (결정적)
- **테스트용** — 실제 WiFi 신호와 무관, 앱 단독 테스트 시 사용

### 실제 BSSID 특징
- 제조사별 OUI(Organizationally Unique Identifier)로 시작
- 첫 3옥텟으로 제조사 식별 가능
- WiFi 스캐너 앱으로 직접 확인

| OUI 예시 | 제조사 |
|----------|--------|
| 00:1A:XX | Cisco |
| 00:0C:XX | Aruba |
| 74:DA:XX | Ubiquiti |
| E0:3F:XX | Samsung |

### 구분 표

| 구분 | mock BSSID | 실제 BSSID |
|------|-----------|-----------|
| 형식 | `02:XX:XX:XX:XX:XX` | 제조사 할당 MAC |
| 첫 옥텟 | `02` (로컬 비트) | 제조사 OUI |
| 용도 | 개발/테스트 | 실제 운영 |
| 생성 위치 | `src/utils/accessPoint.ts` | WiFi 스캐너 앱 |
| 등록 파일 | `bssmFloorMap.ts` (runtime 생성) | `realAccessPoints.ts` |

### 전환 가이드
1. `src/constants/realAccessPoints.ts`에 실제 BSSID 데이터 추가
2. `getAccessPointsForFloor()` 호출 시 전달할 AP 목록에 `realAccessPoints` 포함
3. `npx tsc --noEmit`으로 타입 검사 통과 확인

---

## 6. 데이터 수집 체크리스트

수집 전:
- [ ] WiFi Analyzer 앱 설치 (Android)
- [ ] 수집할 교실 목록 준비 (`bssmFloorMap.ts`의 elements 참고)
- [ ] 기록용 시트 준비 (교실명, BSSID, SSID, 비고)

수집 후:
- [ ] 모든 교실의 BSSID 기록 완료
- [ ] `bssmFloorMap.ts`에서 각 교실의 좌표 확인/계산 완료
- [ ] `source` 타입 확장 완료 (필요시 `src/types/accessPoint.ts` 수정)
- [ ] `src/constants/realAccessPoints.ts`에 데이터 입력 완료
- [ ] `npx tsc --noEmit` 통과 확인
- [ ] 앱 실행 후 Debug 화면에서 AP 목록 정상 표시 확인

---

## 참고 자료

- `src/constants/bssmFloorMap.ts` — 교실 좌표 데이터 (map-percent)
- `src/constants/realAccessPoints.ts` — 실제 AP 데이터 입력 템플릿
- `src/types/accessPoint.ts` — AccessPoint 타입 정의
- `src/utils/accessPoint.ts` — mock AP 생성 및 `getAccessPointsForFloor()` 유틸리티
