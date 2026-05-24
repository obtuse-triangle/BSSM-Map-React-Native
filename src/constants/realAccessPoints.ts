import type { AccessPoint } from '../types/accessPoint';

/**
 * 실제 수집한 AP 데이터
 *
 * 사용 방법:
 * 1. WiFi Scanner 앱으로 각 교실의 AP BSSID 수집 (docs/ap-data-collection-guide.md 참고)
 * 2. `bssmFloorMap.ts`에서 해당 교실의 map-percent 좌표 계산
 * 3. 아래 배열에 새 AccessPoint 항목 추가
 * 4. `getAccessPointsForFloor()`에서 사용하도록 전환
 *
 * ⚠️ source 타입: AccessPointSource가 'room-center'만 허용하므로
 *    src/types/accessPoint.ts에서 'manual-collection'을 추가하거나
 *    source: 'room-center' as const 로 작성하세요.
 *
 * @see docs/ap-data-collection-guide.md
 */
export const realAccessPoints: AccessPoint[] = [];

// TODO: 실제 수집한 AP 데이터로 교체
// 1. 각 교실 방문
// 2. WiFi Scanner 앱으로 BSSID 기록
// 3. 아래 형식으로 추가 (bssmFloorMap.ts에서 좌표 확인 후 값 입력):
//
// {
//   id: 'ap-3-12',
//   floorKey: '3',
//   roomId: 12,           // ← bssmFloorMap.ts 3층 elements 중 name: "3-1"의 id 값
//   roomName: '3-1',
//   ssid: 'BSSM-WIFI',    // ← 실제 WiFi SSID
//   bssid: 'AA:BB:CC:DD:EE:01',  // ← WiFi Scanner 앱에서 수집한 실제 BSSID
//   x: 65.29,             // ← bssmFloorMap.ts 좌표로 계산 (room.x + room.width / 2)
//   y: 16,                // ← bssmFloorMap.ts 좌표로 계산 (room.y + room.height / 2)
//   heightMeters: 2.7,
//   coordinateMode: 'map-percent',
//   source: 'room-center' as const,
// },
//
// 4. 추가 완료 후 `npx tsc --noEmit`으로 타입 검사 통과 확인
