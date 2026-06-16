import type { CampusFeature, CampusFeatureCategory } from '../types/geojson';
import type { RouteResult, RouteFloorSegment } from '../types/routing';
import type { SavedPlace } from '../types/savedPlaces';

export const CATEGORY_LABELS: Record<CampusFeatureCategory, string> = {
  classroom: '강의실',
  corridor: '복도',
  elevator: '엘리베이터',
  facility: '시설',
  restroom: '화장실',
  room: '공간',
  stair: '계단',
  structural: '구조물',
  unknown: '',
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function formatValue(value: string | number | null | undefined): string {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }

  return isNonEmptyString(value) ? value.trim() : '';
}

function getCategoryLabel(category: unknown): string {
  return typeof category === 'string' && category in CATEGORY_LABELS
    ? CATEGORY_LABELS[category as CampusFeatureCategory]
    : '';
}

function getFeatureName(feature: Pick<CampusFeature, 'properties'> | null | undefined): string {
  const properties = feature?.properties;
  if (!properties) {
    return '이름 없는 장소';
  }

  const displayName = formatValue(properties.name_ko) || formatValue(properties.name);
  return displayName || '이름 없는 장소';
}

function getSavedPlaceName(place: SavedPlace | null | undefined): string {
  if (!place) {
    return '';
  }

  const campusPlace = place.type === 'campus' ? place : null;
  return (
    formatValue(campusPlace?.nameKo) ||
    formatValue(place.name) ||
    ''
  );
}

function getPlaceCategoryLabel(place: SavedPlace | null | undefined): string {
  if (!place || place.type !== 'campus') {
    return '';
  }

  return getCategoryLabel(place.category);
}

function getFloorText(level: string | number | null | undefined): string {
  const normalized = formatValue(level);
  return normalized ? `${normalized}층` : '';
}

function formatRouteBadge(result: RouteResult): string {
  if (!result.ok) {
    return '';
  }

  const hasStair = result.floorSegments.some(segment => getConnectorId(segment.connectorTransition).includes('stair'));
  const hasElevator = result.floorSegments.some(segment => getConnectorId(segment.connectorTransition).includes('elevator'));

  if (hasStair && hasElevator) return '계단/엘리베이터';
  if (hasStair) return '계단 포함';
  if (hasElevator) return '엘리베이터';
  return '같은 층';
}

function formatRouteMetric(value: number | null | undefined, unit: string): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '';
  }

  return `${Math.round(value)}${unit}`;
}

function getConnectorId(transition: RouteFloorSegment['connectorTransition'] | null | undefined): string {
  if (!transition) {
    return '';
  }

  const connector = transition as Partial<{ connectorId: string; id: string }>;
  return formatValue(connector.connectorId) || formatValue(connector.id);
}

function getTransitionFloorText(transition: RouteFloorSegment['connectorTransition'] | null | undefined): string {
  if (!transition) {
    return '';
  }

  const connector = transition as Partial<{ fromLevel: number; toLevel: number }>;
  const fromLevel = formatValue(connector.fromLevel);
  const toLevel = formatValue(connector.toLevel);

  if (!fromLevel || !toLevel) {
    return '';
  }

  return `${fromLevel}층에서 ${toLevel}층으로`;
}

export function formatFeatureLabel(feature: Pick<CampusFeature, 'properties'> | null | undefined): string {
  return getFeatureName(feature);
}

export function formatFeatureA11yLabel(feature: Pick<CampusFeature, 'properties'> | null | undefined): string {
  const properties = feature?.properties;
  const label = getFeatureName(feature);
  const levelText = properties ? getFloorText(properties.level) : '';
  const categoryLabel = properties ? getCategoryLabel(properties.category) : '';

  const segments = [label];
  if (levelText) segments.push(levelText);
  if (categoryLabel) segments.push(categoryLabel);

  return segments.join(', ');
}

export function formatSearchResultLabel(feature: Pick<CampusFeature, 'properties'> | null | undefined): string {
  return `검색 결과 ${formatFeatureA11yLabel(feature)}`;
}

export function formatSavedPlaceLabel(place: SavedPlace | null | undefined): string {
  const name = getSavedPlaceName(place);
  return name ? `저장된 장소 ${name}` : '저장된 장소';
}

export function formatSavedPlaceSubtitle(place: SavedPlace | null | undefined): string {
  if (!place) {
    return '위치 정보 없음';
  }

  const levelText = getFloorText(place.level);
  const categoryLabel = getPlaceCategoryLabel(place);
  const segments = [levelText, categoryLabel].filter(isNonEmptyString);

  return segments.length > 0 ? segments.join(' · ') : '위치 정보 없음';
}

export function getRouteBadgeText(result: RouteResult | null | undefined): string {
  if (!result || !result.ok) {
    return '';
  }

  return formatRouteBadge(result);
}

export function formatRouteTimeMinutes(seconds: number | null | undefined): string {
  const minutes = formatRouteMetric(typeof seconds === 'number' ? seconds / 60 : undefined, '분');
  return minutes || '시간 정보 없음';
}

export function formatRouteDistance(meters: number | null | undefined): string {
  const distance = formatRouteMetric(meters, '미터');
  return distance || '거리 정보 없음';
}

export function formatRouteSummary(result: RouteResult | null | undefined): string {
  if (!result || !result.ok) {
    return '경로 정보 없음';
  }

  const time = formatRouteTimeMinutes(result.estimatedTimeSeconds);
  const distance = formatRouteDistance(result.totalDistanceMeters);
  const badge = getRouteBadgeText(result);
  const segments = [time, distance, badge].filter(isNonEmptyString);

  return segments.length > 0 ? segments.join(', ') : '경로 정보 없음';
}

export function formatFloorTransition(
  transition: RouteFloorSegment['connectorTransition'] | null | undefined,
): string {
  const connectorId = getConnectorId(transition);
  const floorText = getTransitionFloorText(transition);

  if (!connectorId || !floorText) {
    return '층 이동 정보 없음';
  }

  if (connectorId.includes('stair')) {
    return `${floorText} 계단 이동`;
  }

  if (connectorId.includes('elevator') || connectorId.includes('ev')) {
    return `${floorText} 엘리베이터 이동`;
  }

  return `${floorText} 층간 이동`;
}

export function formatFloorButtonA11y(level: string | number, selected = false): string {
  const levelText = formatValue(level);
  return `${levelText}층 ${selected ? '선택됨' : '선택'}`.trim();
}

export function formatRoomA11yLabel(
  element: { name?: string | null },
  floorKey?: string | number | null,
): string {
  const name = formatValue(element?.name);
  if (!name) {
    return '이름 없는 공간';
  }

  const floorText = getFloorText(floorKey);
  return floorText ? `${name}, ${floorText}` : name;
}

export function formatMapControlLabel(
  action: 'zoomIn' | 'zoomOut' | 'reset' | 'locate' | 'toggleAp' | 'settings' | 'info',
): string {
  switch (action) {
    case 'zoomIn':
      return '지도 확대';
    case 'zoomOut':
      return '지도 축소';
    case 'reset':
      return '지도 초기화';
    case 'locate':
      return '현재 위치 찾기';
    case 'toggleAp':
      return 'AP 위치 표시 전환';
    case 'settings':
      return '지도 설정 열기';
    case 'info':
      return '지도 정보 열기';
  }
}

export function formatToggleLabel(label: string, enabled: boolean): string {
  return `${label} ${enabled ? '켜짐' : '꺼짐'}`;
}
