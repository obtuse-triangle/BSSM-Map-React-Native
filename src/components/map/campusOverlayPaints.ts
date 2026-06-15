import { MAP_STYLES } from '../../constants/mapStyles';
import type { MapBaseLayer } from '../../store/mapStore';

export const LIGHT_CAMPUS_OVERLAY = {
  fillOpacity: 0.85,
  outlineColor: '#333333',
  outlineWidth: 1,
  labelColor: '#333333',
  labelHaloColor: '#ffffff',
  labelHaloWidth: 1.5,
  selectedFillColor: '#2979FF',
  selectedFillOpacity: 0.6,
  schoolOutlineFillColor: '#E0E0E0',
  schoolOutlineFillOpacity: 0.3,
  schoolOutlineLineColor: '#666666',
  schoolOutlineLineWidth: 1.5,
  categories: {
    classroom: '#D4E8FC',
    room: '#FFF9C4',
    facility: '#C8E6C9',
    restroom: '#B3E5FC',
    stair: '#D7CCC8',
    elevator: '#CFD8DC',
    corridor: '#F5F5F5',
    structural: '#EEEEEE',
    fallback: '#F9F9F9',
  },
} as const;

export const DARK_CAMPUS_OVERLAY = {
  fillOpacity: 0.68,
  outlineColor: '#8FA3B8',
  outlineWidth: 1.15,
  labelColor: '#F5F7FA',
  labelHaloColor: '#111827',
  labelHaloWidth: 1.8,
  selectedFillColor: '#38BDF8',
  selectedFillOpacity: 0.72,
  schoolOutlineFillColor: '#0F172A',
  schoolOutlineFillOpacity: 0.22,
  schoolOutlineLineColor: '#94A3B8',
  schoolOutlineLineWidth: 1.5,
  categories: {
    classroom: '#2563EB',
    room: '#B45309',
    facility: '#15803D',
    restroom: '#0891B2',
    stair: '#A16207',
    elevator: '#64748B',
    corridor: '#334155',
    structural: '#475569',
    fallback: '#1F2937',
  },
} as const;

type CampusOverlayPalette = typeof LIGHT_CAMPUS_OVERLAY | typeof DARK_CAMPUS_OVERLAY;

type CampusOverlayPaints = {
  schoolOutlineFill: {
    'fill-color': CampusOverlayPalette['schoolOutlineFillColor'];
    'fill-opacity': CampusOverlayPalette['schoolOutlineFillOpacity'];
  };
  schoolOutlineLine: {
    'line-color': CampusOverlayPalette['schoolOutlineLineColor'];
    'line-width': CampusOverlayPalette['schoolOutlineLineWidth'];
  };
  campusFillMatch: [
    'match',
    ['get', 'category'],
    'classroom',
    string,
    'room',
    string,
    'facility',
    string,
    'restroom',
    string,
    'stair',
    string,
    'elevator',
    string,
    'corridor',
    string,
    'structural',
    string,
    string,
  ];
  campusFillOpacity: CampusOverlayPalette['fillOpacity'];
  roomHighlight: {
    'fill-color': CampusOverlayPalette['selectedFillColor'];
    'fill-opacity': CampusOverlayPalette['selectedFillOpacity'];
  };
  campusOutline: {
    'line-color': CampusOverlayPalette['outlineColor'];
    'line-width': CampusOverlayPalette['outlineWidth'];
  };
  roomLabel: {
    'text-color': CampusOverlayPalette['labelColor'];
    'text-halo-color': CampusOverlayPalette['labelHaloColor'];
    'text-halo-width': CampusOverlayPalette['labelHaloWidth'];
  };
};

function createCampusFillMatch(palette: CampusOverlayPalette): CampusOverlayPaints['campusFillMatch'] {
  return [
    'match',
    ['get', 'category'],
    'classroom', palette.categories.classroom,
    'room', palette.categories.room,
    'facility', palette.categories.facility,
    'restroom', palette.categories.restroom,
    'stair', palette.categories.stair,
    'elevator', palette.categories.elevator,
    'corridor', palette.categories.corridor,
    'structural', palette.categories.structural,
    palette.categories.fallback,
  ] as CampusOverlayPaints['campusFillMatch'];
}

export function getCampusOverlayPaints(baseLayer: MapBaseLayer): CampusOverlayPaints {
  const palette = MAP_STYLES.find((style) => style.id === baseLayer)?.theme === 'dark'
    ? DARK_CAMPUS_OVERLAY
    : LIGHT_CAMPUS_OVERLAY;

  return {
    schoolOutlineFill: {
      'fill-color': palette.schoolOutlineFillColor,
      'fill-opacity': palette.schoolOutlineFillOpacity,
    },
    schoolOutlineLine: {
      'line-color': palette.schoolOutlineLineColor,
      'line-width': palette.schoolOutlineLineWidth,
    },
    campusFillMatch: createCampusFillMatch(palette),
    campusFillOpacity: palette.fillOpacity,
    roomHighlight: {
      'fill-color': palette.selectedFillColor,
      'fill-opacity': palette.selectedFillOpacity,
    },
    campusOutline: {
      'line-color': palette.outlineColor,
      'line-width': palette.outlineWidth,
    },
    roomLabel: {
      'text-color': palette.labelColor,
      'text-halo-color': palette.labelHaloColor,
      'text-halo-width': palette.labelHaloWidth,
    },
  };
}
