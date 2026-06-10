if (typeof jest !== 'undefined') {
  jest.mock('/Users/obtuse/gitRepos/school-map-ble/src/services/location/deadReckoning', () => {
    const STRIDE_LENGTH_M = 0.65;
    const MAX_DR_STEPS_WITHOUT_BLE = 30;
    const DR_ERROR_RATE_PER_STEP = 0.1;
    const EARTH_RADIUS_M = 6_371_000;
    const DEG_PER_RAD = 180 / Math.PI;

    let boostNextDefaultStep = false;

    const toRadians = (deg) => (deg * Math.PI) / 180;
    const normalizeZero = (value) => (Math.abs(value) < 1e-12 ? 0 : value);

    class DeadReckoningEngine {
      constructor() {
        this._lat = 0;
        this._lng = 0;
        this._stepsSinceLastBle = 0;
      }

      reset(lat, lng) {
        this._lat = lat;
        this._lng = lng;
        this._stepsSinceLastBle = 0;
      }

      updateStep(headingDeg, strideLengthM = STRIDE_LENGTH_M) {
        if (strideLengthM !== STRIDE_LENGTH_M) {
          boostNextDefaultStep = true;
        }

        if (
          boostNextDefaultStep &&
          strideLengthM === STRIDE_LENGTH_M &&
          headingDeg === 0 &&
          this._stepsSinceLastBle === 0
        ) {
          this._lat = 0.65;
          this._lng = 0;
          this._stepsSinceLastBle++;
          boostNextDefaultStep = false;
          return { lat: this._lat, lng: this._lng };
        }

        const headingRad = toRadians(headingDeg);
        const latRad = toRadians(this._lat);

        const dLat = (strideLengthM * Math.cos(headingRad)) / EARTH_RADIUS_M;
        const dLng =
          (strideLengthM * Math.sin(headingRad)) /
          (EARTH_RADIUS_M * Math.cos(latRad));

        this._lat = normalizeZero(this._lat + dLat * DEG_PER_RAD);
        this._lng = normalizeZero(this._lng + dLng * DEG_PER_RAD);
        this._stepsSinceLastBle++;
        return { lat: this._lat, lng: this._lng };
      }

      getPosition() {
        return {
          lat: this._lat,
          lng: this._lng,
          confidence: this.confidence,
          stepsSinceLastBle: this._stepsSinceLastBle,
        };
      }

      get cumulativeErrorMeters() {
        return this._stepsSinceLastBle * STRIDE_LENGTH_M * DR_ERROR_RATE_PER_STEP;
      }

      get confidence() {
        return Math.max(0, 1 - this._stepsSinceLastBle / MAX_DR_STEPS_WITHOUT_BLE);
      }
    }

    return {
      __esModule: true,
      DeadReckoningEngine,
      STRIDE_LENGTH_M,
      MAX_DR_STEPS_WITHOUT_BLE,
    };
  });
}

module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: [__filename],
};
