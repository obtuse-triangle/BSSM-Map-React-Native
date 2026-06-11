export type MapStyleId =
  | 'osm'
  | 'osm-hot'
  | 'positron'
  | 'dark'
  | 'voyager'
  | 'topo'
  | 'satellite'
  | 'design';

export type MapStyleConfig = {
  id: MapStyleId;
  label: string;
  icon: string;
  theme: 'dark' | 'light';
  source: {
    type: 'raster';
    tiles: string[];
    tileSize: number;
    maxzoom: number;
    attribution: string;
  };
};

/**
 * 무료 레스터 타일 프로바이더 목록.
 * - OSM Standard: 기본 OpenStreetMap
 * - OSM HOT: Humanitarian 스타일 (따뜻한 톤)
 * - Positron: CartoDB 밝은/미니멀 (라벨은 별도 레이어로 오버레이 가능하지만 여기서는 합쳐진 타일 사용)
 * - Dark Matter: CartoDB 다크모드
 * - Voyager: CartoDB 컬러풀 스타일
 * - OpenTopoMap: 지형도 (등고선 + 셰이딩)
 * - Esri Satellite: 위성 지도
 */
export const MAP_STYLES: MapStyleConfig[] = [
  {
    id: 'osm',
    label: '일반 지도',
    icon: '🗺',
    theme: 'light',
    source: {
      type: 'raster',
      tiles: [
        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© OpenStreetMap contributors',
    },
  },
  {
    id: 'osm-hot',
    label: '휴머니타리안',
    icon: '🌍',
    theme: 'light',
    source: {
      type: 'raster',
      tiles: [
        'https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
        'https://b.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
        'https://c.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© OpenStreetMap contributors, Humanitarian OpenStreetMap Team',
    },
  },
  {
    id: 'positron',
    label: '밝은 (미니멀)',
    icon: '◐',
    theme: 'light',
    source: {
      type: 'raster',
      tiles: [
        'https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© CartoDB © OpenStreetMap contributors',
    },
  },
  {
    id: 'dark',
    label: '다크모드',
    icon: '🌙',
    theme: 'dark',
    source: {
      type: 'raster',
      tiles: [
        'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© CartoDB © OpenStreetMap contributors',
    },
  },
  {
    id: 'voyager',
    label: '보이저',
    icon: '🎨',
    theme: 'light',
    source: {
      type: 'raster',
      tiles: [
        'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© CartoDB © OpenStreetMap contributors',
    },
  },
  {
    id: 'topo',
    label: '지형도',
    icon: '⛰',
    theme: 'light',
    source: {
      type: 'raster',
      tiles: [
        'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
        'https://b.tile.opentopomap.org/{z}/{x}/{y}.png',
        'https://c.tile.opentopomap.org/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      maxzoom: 17,
      attribution: '© OpenTopoMap (CC-BY-SA) © OpenStreetMap contributors',
    },
  },
  {
    id: 'satellite',
    label: '위성',
    icon: '🛰',
    theme: 'dark',
    source: {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© Esri',
    },
  },
  {
    id: 'design',
    label: '설계도',
    icon: '▦',
    theme: 'light',
    source: {
      type: 'raster',
      tiles: [],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'BSSM-Map',
    },
  },
];
