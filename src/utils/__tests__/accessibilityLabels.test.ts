import {
  formatFeatureA11yLabel,
  formatFeatureLabel,
  formatFloorButtonA11y,
  formatFloorTransition,
  formatMapControlLabel,
  formatRouteDistance,
  formatRouteSummary,
  formatRouteTimeMinutes,
  formatSavedPlaceLabel,
  formatSavedPlaceSubtitle,
  formatSearchResultLabel,
  formatToggleLabel,
  formatRoomA11yLabel,
  getRouteBadgeText,
} from '../accessibilityLabels';

describe('accessibilityLabels', () => {
  const feature = {
    properties: {
      fid: 1,
      id: 'feature-1',
      name: 'Main Hall',
      name_ko: '메인 홀',
      level: 2,
      level_id: 'L2',
      building_id: 'B1',
      category: 'classroom',
      interactive: true,
      source: 'test',
    },
  } as const;

  const featureMissingCategory = {
    properties: {
      fid: 1,
      id: 'feature-1',
      name: 'Main Hall',
      name_ko: '메인 홀',
      level: 2,
      level_id: 'L2',
      building_id: 'B1',
      category: 'unknown',
      interactive: true,
      source: 'test',
    },
  } as const;

  const featureMissingLevel = {
    properties: {
      fid: 1,
      id: 'feature-1',
      name: 'Main Hall',
      name_ko: '메인 홀',
      level: undefined,
      level_id: 'L2',
      building_id: 'B1',
      category: 'classroom',
      interactive: true,
      source: 'test',
    },
  } as const;

  const fullRouteResult = {
    ok: true,
    floorSegments: [
      {
        level: 1,
        nodeIds: ['a', 'b'],
        distanceMeters: 23,
        connectorTransition: {
          connectorId: 'stair-1',
          fromLevel: 1,
          toLevel: 2,
        },
      },
      {
        level: 2,
        nodeIds: ['c', 'd'],
        distanceMeters: 18,
        connectorTransition: {
          connectorId: 'elevator-2',
          fromLevel: 2,
          toLevel: 3,
        },
      },
    ],
    totalDistanceMeters: 123.6,
    estimatedTimeSeconds: 90,
    usedStairsFallback: false,
  } as const;

  const stairOnlyRouteResult = {
    ok: true,
    floorSegments: [
      {
        level: 1,
        nodeIds: ['a', 'b'],
        distanceMeters: 23,
        connectorTransition: {
          connectorId: 'stair-1',
          fromLevel: 1,
          toLevel: 2,
        },
      },
    ],
    totalDistanceMeters: 100,
    estimatedTimeSeconds: 120,
    usedStairsFallback: true,
  } as const;

  const elevatorOnlyRouteResult = {
    ok: true,
    floorSegments: [
      {
        level: 1,
        nodeIds: ['a', 'b'],
        distanceMeters: 23,
        connectorTransition: {
          connectorId: 'elevator-1',
          fromLevel: 1,
          toLevel: 2,
        },
      },
    ],
    totalDistanceMeters: 100,
    estimatedTimeSeconds: 120,
    usedStairsFallback: false,
  } as const;

  const sameFloorRouteResult = {
    ok: true,
    floorSegments: [
      {
        level: 1,
        nodeIds: ['a', 'b'],
        distanceMeters: 23,
      },
    ],
    totalDistanceMeters: 88,
    estimatedTimeSeconds: 75,
    usedStairsFallback: false,
  } as const;

  const failedRouteResult = { ok: false, reason: 'unavailable' } as const;

  const savedCampusPlace = {
    id: 'saved-1',
    type: 'campus',
    featureId: 'feature-1',
    name: 'Main Hall',
    nameKo: '메인 홀',
    category: 'classroom',
    level: 2,
    coordinates: [127, 37],
    color: '#00A676',
    createdAt: '2026-01-01T00:00:00.000Z',
  } as const;

  const savedCustomPin = {
    id: 'saved-2',
    type: 'custom',
    name: 'Personal Pin',
    coordinates: [127, 37],
    color: '#00A676',
    level: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
  } as const;

  it('formats feature labels and fallbacks', () => {
    expect(formatFeatureLabel(feature as never)).toBe('메인 홀');
    expect(formatFeatureLabel({ properties: { ...feature.properties, name_ko: '', name: '' } } as never)).toBe('이름 없는 장소');
    expect(formatFeatureLabel(null)).toBe('이름 없는 장소');
  });

  it('formats feature accessibility labels with optional segments', () => {
    expect(formatFeatureA11yLabel(feature as never)).toBe('메인 홀, 2층, 강의실');
    expect(formatFeatureA11yLabel(featureMissingCategory as never)).toBe('메인 홀, 2층');
    expect(formatFeatureA11yLabel(featureMissingLevel as never)).toBe('메인 홀, 강의실');
    expect(formatFeatureA11yLabel({ properties: { ...feature.properties, name_ko: '', name: '', category: 'unknown' } } as never)).toBe('이름 없는 장소, 2층');
    expect(formatFeatureA11yLabel(undefined)).toBe('이름 없는 장소');
  });

  it('formats search result labels', () => {
    expect(formatSearchResultLabel(feature as never)).toBe('검색 결과 메인 홀, 2층, 강의실');
    expect(formatSearchResultLabel(null)).toBe('검색 결과 이름 없는 장소');
  });

  it('formats saved place labels and subtitles', () => {
    expect(formatSavedPlaceLabel(savedCampusPlace as never)).toBe('저장된 장소 메인 홀');
    expect(formatSavedPlaceLabel(savedCustomPin as never)).toBe('저장된 장소 Personal Pin');
    expect(formatSavedPlaceLabel(undefined)).toBe('저장된 장소');

    expect(formatSavedPlaceSubtitle(savedCampusPlace as never)).toBe('2층 · 강의실');
    expect(formatSavedPlaceSubtitle(savedCustomPin as never)).toBe('3층');
    expect(formatSavedPlaceSubtitle(null)).toBe('위치 정보 없음');
  });

  it('formats route badges from connector usage', () => {
    expect(getRouteBadgeText(fullRouteResult as never)).toBe('계단/엘리베이터');
    expect(getRouteBadgeText(stairOnlyRouteResult as never)).toBe('계단 포함');
    expect(getRouteBadgeText(elevatorOnlyRouteResult as never)).toBe('엘리베이터');
    expect(getRouteBadgeText(sameFloorRouteResult as never)).toBe('같은 층');
    expect(getRouteBadgeText(failedRouteResult as never)).toBe('');
    expect(getRouteBadgeText(undefined)).toBe('');
  });

  it('formats route time and distance', () => {
    expect(formatRouteTimeMinutes(89)).toBe('1분');
    expect(formatRouteTimeMinutes(90)).toBe('2분');
    expect(formatRouteTimeMinutes(null)).toBe('시간 정보 없음');
    expect(formatRouteTimeMinutes(undefined)).toBe('시간 정보 없음');

    expect(formatRouteDistance(123.6)).toBe('124미터');
    expect(formatRouteDistance(100)).toBe('100미터');
    expect(formatRouteDistance(null)).toBe('거리 정보 없음');
    expect(formatRouteDistance(undefined)).toBe('거리 정보 없음');
  });

  it('formats route summaries', () => {
    expect(formatRouteSummary(fullRouteResult as never)).toBe('2분, 124미터, 계단/엘리베이터');
    expect(formatRouteSummary(sameFloorRouteResult as never)).toBe('1분, 88미터, 같은 층');
    expect(formatRouteSummary(failedRouteResult as never)).toBe('경로 정보 없음');
    expect(formatRouteSummary(null)).toBe('경로 정보 없음');
  });

  it('formats floor transitions', () => {
    expect(
      formatFloorTransition({ connectorId: 'stair-2', fromLevel: 1, toLevel: 2 }),
    ).toBe('1층에서 2층으로 계단 이동');
    expect(
      formatFloorTransition({ connectorId: 'elevator-3', fromLevel: 2, toLevel: 4 }),
    ).toBe('2층에서 4층으로 엘리베이터 이동');
    expect(
      formatFloorTransition({ connectorId: 'bridge-1', fromLevel: 3, toLevel: 5 }),
    ).toBe('3층에서 5층으로 층간 이동');
    expect(formatFloorTransition(null)).toBe('층 이동 정보 없음');
  });

  it('formats floor button labels', () => {
    expect(formatFloorButtonA11y(2)).toBe('2층 선택');
    expect(formatFloorButtonA11y('B1', true)).toBe('B1층 선택됨');
  });

  it('formats room labels', () => {
    expect(formatRoomA11yLabel({ name: '세미나실' }, 4)).toBe('세미나실, 4층');
    expect(formatRoomA11yLabel({ name: '' }, 4)).toBe('이름 없는 공간');
    expect(formatRoomA11yLabel({ name: null }, null)).toBe('이름 없는 공간');
  });

  it('formats map control labels', () => {
    expect(formatMapControlLabel('zoomIn')).toBe('지도 확대');
    expect(formatMapControlLabel('zoomOut')).toBe('지도 축소');
    expect(formatMapControlLabel('reset')).toBe('지도 초기화');
    expect(formatMapControlLabel('locate')).toBe('현재 위치 찾기');
    expect(formatMapControlLabel('toggleAp')).toBe('AP 위치 표시 전환');
    expect(formatMapControlLabel('settings')).toBe('지도 설정 열기');
    expect(formatMapControlLabel('info')).toBe('지도 정보 열기');
  });

  it('formats toggle labels', () => {
    expect(formatToggleLabel('AP', true)).toBe('AP 켜짐');
    expect(formatToggleLabel('BLE', false)).toBe('BLE 꺼짐');
  });
});
