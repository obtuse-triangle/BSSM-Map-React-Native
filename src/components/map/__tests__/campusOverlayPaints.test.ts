import { DARK_CAMPUS_OVERLAY, LIGHT_CAMPUS_OVERLAY, getCampusOverlayPaints } from '../campusOverlayPaints';
import type { MapBaseLayer } from '../../../store/mapStore';

function expectOverlayPaints(baseLayer: MapBaseLayer, expectedPalette: typeof LIGHT_CAMPUS_OVERLAY | typeof DARK_CAMPUS_OVERLAY) {
  expect(getCampusOverlayPaints(baseLayer)).toEqual({
    schoolOutlineFill: {
      'fill-color': expectedPalette.schoolOutlineFillColor,
      'fill-opacity': expectedPalette.schoolOutlineFillOpacity,
    },
    schoolOutlineLine: {
      'line-color': expectedPalette.schoolOutlineLineColor,
      'line-width': expectedPalette.schoolOutlineLineWidth,
    },
    campusFillMatch: [
      'match',
      ['get', 'category'],
      'classroom', expectedPalette.categories.classroom,
      'room', expectedPalette.categories.room,
      'facility', expectedPalette.categories.facility,
      'restroom', expectedPalette.categories.restroom,
      'stair', expectedPalette.categories.stair,
      'elevator', expectedPalette.categories.elevator,
      'corridor', expectedPalette.categories.corridor,
      'structural', expectedPalette.categories.structural,
      expectedPalette.categories.fallback,
    ],
    campusFillOpacity: expectedPalette.fillOpacity,
    roomHighlight: {
      'fill-color': expectedPalette.selectedFillColor,
      'fill-opacity': expectedPalette.selectedFillOpacity,
    },
    campusOutline: {
      'line-color': expectedPalette.outlineColor,
      'line-width': expectedPalette.outlineWidth,
    },
    roomLabel: {
      'text-color': expectedPalette.labelColor,
      'text-halo-color': expectedPalette.labelHaloColor,
      'text-halo-width': expectedPalette.labelHaloWidth,
    },
  });
}

describe('getCampusOverlayPaints', () => {
  it('returns dark palette for dark and satellite', () => {
    expectOverlayPaints('dark', DARK_CAMPUS_OVERLAY);
    expectOverlayPaints('satellite', DARK_CAMPUS_OVERLAY);
  });

  it('returns light palette for all light base layers', () => {
    const lightLayers: MapBaseLayer[] = ['osm', 'osm-hot', 'positron', 'voyager', 'topo', 'design'];

    for (const baseLayer of lightLayers) {
      expectOverlayPaints(baseLayer, LIGHT_CAMPUS_OVERLAY);
    }
  });
});
