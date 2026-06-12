import { useMapStore } from '../mapStore';

describe('mapStore source ownership', () => {
  beforeEach(() => {
    // Reset to default state using setState with initial values
    useMapStore.setState({
      gpsTrackingEnabled: false,
      bleTrackingEnabled: false,
      gpsCoordinates: null,
      bleCoordinates: null,
      userCoordinates: null,
      userCoordinatesSource: null,
      showApMarkers: false,
    });
  });

  // ── Defaults ────────────────────────────────────────────────────────

  describe('default state', () => {
    it('has both toggles false and all coordinate fields null by default', () => {
      const state = useMapStore.getState();
      expect(state.gpsTrackingEnabled).toBe(false);
      expect(state.bleTrackingEnabled).toBe(false);
      expect(state.gpsCoordinates).toBeNull();
      expect(state.bleCoordinates).toBeNull();
      expect(state.userCoordinates).toBeNull();
      expect(state.userCoordinatesSource).toBeNull();
    });
  });

  // ── Single source active ────────────────────────────────────────────

  describe('single source active', () => {
    it('sets userCoordinatesSource to gps when GPS enabled with coordinates and BLE off', () => {
      useMapStore.getState().setGpsTrackingEnabled(true);
      useMapStore.getState().setGpsCoordinates({ longitude: 127.1, latitude: 37.5 });
      const state = useMapStore.getState();
      expect(state.userCoordinates).toEqual({ longitude: 127.1, latitude: 37.5 });
      expect(state.userCoordinatesSource).toBe('gps');
    });

    it('sets userCoordinatesSource to ble when BLE enabled with coordinates and GPS off', () => {
      useMapStore.getState().setBleTrackingEnabled(true);
      useMapStore.getState().setBleCoordinates({ longitude: 127.2, latitude: 37.6 });
      const state = useMapStore.getState();
      expect(state.userCoordinates).toEqual({ longitude: 127.2, latitude: 37.6 });
      expect(state.userCoordinatesSource).toBe('ble');
    });
  });

  // ── BLE priority ────────────────────────────────────────────────────

  describe('BLE priority over GPS', () => {
    it('gives BLE priority over GPS when both enabled with coordinates', () => {
      useMapStore.getState().setGpsTrackingEnabled(true);
      useMapStore.getState().setGpsCoordinates({ longitude: 127.1, latitude: 37.5 });
      useMapStore.getState().setBleTrackingEnabled(true);
      useMapStore.getState().setBleCoordinates({ longitude: 127.2, latitude: 37.6 });
      const state = useMapStore.getState();
      expect(state.userCoordinates).toEqual({ longitude: 127.2, latitude: 37.6 });
      expect(state.userCoordinatesSource).toBe('ble');
    });
  });

  // ── Toggle transitions ──────────────────────────────────────────────

  describe('toggle transitions', () => {
    it('keeps BLE as source when GPS is toggled off while BLE is active', () => {
      useMapStore.getState().setGpsTrackingEnabled(true);
      useMapStore.getState().setGpsCoordinates({ longitude: 127.1, latitude: 37.5 });
      useMapStore.getState().setBleTrackingEnabled(true);
      useMapStore.getState().setBleCoordinates({ longitude: 127.2, latitude: 37.6 });
      useMapStore.getState().setGpsTrackingEnabled(false);
      const state = useMapStore.getState();
      expect(state.userCoordinates).toEqual({ longitude: 127.2, latitude: 37.6 });
      expect(state.userCoordinatesSource).toBe('ble');
      expect(state.gpsCoordinates).toBeNull();
    });

    it('reverts to GPS when BLE is toggled off while GPS is active with coordinates', () => {
      useMapStore.getState().setGpsTrackingEnabled(true);
      useMapStore.getState().setGpsCoordinates({ longitude: 127.1, latitude: 37.5 });
      useMapStore.getState().setBleTrackingEnabled(true);
      useMapStore.getState().setBleCoordinates({ longitude: 127.2, latitude: 37.6 });
      useMapStore.getState().setBleTrackingEnabled(false);
      const state = useMapStore.getState();
      expect(state.userCoordinates).toEqual({ longitude: 127.1, latitude: 37.5 });
      expect(state.userCoordinatesSource).toBe('gps');
      expect(state.bleCoordinates).toBeNull();
    });

    it('clears all merged coordinates when both sources are disabled', () => {
      useMapStore.getState().setGpsTrackingEnabled(true);
      useMapStore.getState().setGpsCoordinates({ longitude: 127.1, latitude: 37.5 });
      useMapStore.getState().setBleTrackingEnabled(true);
      useMapStore.getState().setBleCoordinates({ longitude: 127.2, latitude: 37.6 });
      useMapStore.getState().setGpsTrackingEnabled(false);
      useMapStore.getState().setBleTrackingEnabled(false);
      const state = useMapStore.getState();
      expect(state.userCoordinates).toBeNull();
      expect(state.userCoordinatesSource).toBeNull();
      expect(state.gpsCoordinates).toBeNull();
      expect(state.bleCoordinates).toBeNull();
    });
  });

  // ── Disabled source ignores updates ─────────────────────────────────

  describe('disabled source ignores updates', () => {
    it('ignores GPS coordinate update when GPS is disabled', () => {
      useMapStore.getState().setGpsCoordinates({ longitude: 127.1, latitude: 37.5 });
      const state = useMapStore.getState();
      expect(state.gpsCoordinates).toBeNull();
      expect(state.userCoordinates).toBeNull();
      expect(state.userCoordinatesSource).toBeNull();
    });

    it('ignores BLE coordinate update when BLE is disabled', () => {
      useMapStore.getState().setBleCoordinates({ longitude: 127.2, latitude: 37.6 });
      const state = useMapStore.getState();
      expect(state.bleCoordinates).toBeNull();
      expect(state.userCoordinates).toBeNull();
      expect(state.userCoordinatesSource).toBeNull();
    });
  });
});

describe('mapStore AP marker visibility', () => {
  beforeEach(() => {
    useMapStore.setState({ showApMarkers: false });
  });

  describe('default state', () => {
    it('has showApMarkers false by default', () => {
      expect(useMapStore.getState().showApMarkers).toBe(false);
    });
  });

  describe('setShowApMarkers', () => {
    it('sets showApMarkers to true', () => {
      useMapStore.getState().setShowApMarkers(true);
      expect(useMapStore.getState().showApMarkers).toBe(true);
    });

    it('sets showApMarkers to false', () => {
      useMapStore.getState().setShowApMarkers(true);
      useMapStore.getState().setShowApMarkers(false);
      expect(useMapStore.getState().showApMarkers).toBe(false);
    });
  });

  describe('toggleApMarkers', () => {
    it('toggles from false to true', () => {
      useMapStore.getState().toggleApMarkers();
      expect(useMapStore.getState().showApMarkers).toBe(true);
    });

    it('toggles from true back to false', () => {
      useMapStore.getState().toggleApMarkers();
      useMapStore.getState().toggleApMarkers();
      expect(useMapStore.getState().showApMarkers).toBe(false);
    });
  });

  describe('AP toggle isolation', () => {
    it('does not modify gpsTrackingEnabled when toggling AP markers', () => {
      useMapStore.getState().setGpsTrackingEnabled(true);
      useMapStore.getState().toggleApMarkers();
      expect(useMapStore.getState().gpsTrackingEnabled).toBe(true);
    });

    it('does not modify bleTrackingEnabled when toggling AP markers', () => {
      useMapStore.getState().setBleTrackingEnabled(true);
      useMapStore.getState().toggleApMarkers();
      expect(useMapStore.getState().bleTrackingEnabled).toBe(true);
    });

    it('does not modify userCoordinatesSource when toggling AP markers', () => {
      useMapStore.getState().setGpsTrackingEnabled(true);
      useMapStore.getState().setGpsCoordinates({ longitude: 127.1, latitude: 37.5 });
      const sourceBefore = useMapStore.getState().userCoordinatesSource;
      useMapStore.getState().toggleApMarkers();
      expect(useMapStore.getState().userCoordinatesSource).toBe(sourceBefore);
    });

    it('does not modify gpsCoordinates when toggling AP markers', () => {
      useMapStore.getState().setGpsTrackingEnabled(true);
      useMapStore.getState().setGpsCoordinates({ longitude: 127.1, latitude: 37.5 });
      useMapStore.getState().toggleApMarkers();
      expect(useMapStore.getState().gpsCoordinates).toEqual({ longitude: 127.1, latitude: 37.5 });
    });

    it('does not modify bleCoordinates when toggling AP markers', () => {
      useMapStore.getState().setBleTrackingEnabled(true);
      useMapStore.getState().setBleCoordinates({ longitude: 127.2, latitude: 37.6 });
      useMapStore.getState().toggleApMarkers();
      expect(useMapStore.getState().bleCoordinates).toEqual({ longitude: 127.2, latitude: 37.6 });
    });
  });
});
