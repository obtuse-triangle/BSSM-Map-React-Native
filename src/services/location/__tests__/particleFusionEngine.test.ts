import campusDataUntyped from '../../../data/campus-wgs84.json';
import type { CampusGeoJSON } from '../../../types/geojson';
import {
  FUSION_ACCURACY_MAX_M,
  FUSION_ACCURACY_MIN_M,
  FUSION_UNKNOWN_AFTER_STEPS,
  PARTICLE_COUNT,
  PARTICLE_INIT_RADIUS_M,
} from '../../../constants/fusionConfig';
import { BLE_AP_FIXTURES } from '../../../constants/bleAccessPoints';
import { ParticleFusionEngine } from '../particleFusionEngine';

const campusData = campusDataUntyped as unknown as CampusGeoJSON;

const chosenRoom = campusData.features.find(
  (feature) => feature.geometry.type === 'Polygon' && String(feature.properties.level_id) === '1' && feature.id === '1-1-67',
);

if (chosenRoom === undefined || chosenRoom.geometry.type !== 'Polygon') {
  throw new Error('Expected fixture room 1-1-67 to exist in campus data');
}

const chosenRing = chosenRoom.geometry.coordinates[0];
const chosenCenterLng = (Math.min(...chosenRing.map(([lng]) => lng)) + Math.max(...chosenRing.map(([lng]) => lng))) / 2;
const chosenCenterLat = (Math.min(...chosenRing.map(([, lat]) => lat)) + Math.max(...chosenRing.map(([, lat]) => lat))) / 2;

const EARTH_RADIUS_M = 6_371_000;

const toRadians = (deg: number): number => (deg * Math.PI) / 180;

const moveByMeters = (
  lat: number,
  lng: number,
  headingDeg: number,
  distanceM: number,
): { lat: number; lng: number } => {
  const headingRad = toRadians(headingDeg);
  const latRad = toRadians(lat);
  const dLat = (distanceM * Math.cos(headingRad)) / EARTH_RADIUS_M;
  const dLng = (distanceM * Math.sin(headingRad)) / (EARTH_RADIUS_M * Math.cos(latRad));

  return {
    lat: lat + dLat * (180 / Math.PI),
    lng: lng + dLng * (180 / Math.PI),
  };
};

const haversineDistanceMeters = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number => {
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLng = toRadians(lng2 - lng1);
  const lat1Rad = toRadians(lat1);
  const lat2Rad = toRadians(lat2);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(deltaLng / 2) ** 2;

  return EARTH_RADIUS_M * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

const makeObservation = (lat: number, lng: number, confidence = 0.9, floorKey = '1', timestamp = 1_000): Parameters<ParticleFusionEngine['resetFromBle']>[0] => ({
  lat,
  lng,
  confidence,
  floorKey,
  accuracyMeters: 6,
  timestamp,
  apCount: 6,
});

const makeMotion = (heading: number, steps = 1, timestamp = 2_000): Parameters<ParticleFusionEngine['applyMotion']>[0] => ({
  steps,
  heading,
  userAccelerationMagnitude: 1,
  timestamp,
});

const primeSyntheticState = (
  engine: ParticleFusionEngine,
  accuracyTargetMeters: number,
  options: { lastBleConfidence?: number; stepsSinceLastBle?: number; motionContinuity?: boolean; hasBleAnchor?: boolean; floorKey?: string } = {},
): void => {
  const center = { lat: chosenCenterLat, lng: chosenCenterLng };
  const offset = moveByMeters(center.lat, center.lng, 90, accuracyTargetMeters * 2);
  const particles = [
    { lat: center.lat, lng: center.lng, weight: 0.5, floorKey: options.floorKey ?? '1', headingDeg: 0 },
    { lat: offset.lat, lng: offset.lng, weight: 0.5, floorKey: options.floorKey ?? '1', headingDeg: 180 },
  ];

  Reflect.set(engine, 'particles', particles);
  Reflect.set(engine, 'hasBleAnchor', options.hasBleAnchor ?? true);
  Reflect.set(engine, 'lastBleConfidence', options.lastBleConfidence ?? 1);
  Reflect.set(engine, 'stepsSinceLastBle', options.stepsSinceLastBle ?? 0);
  Reflect.set(engine, 'lastMotionFiniteEstimate', options.motionContinuity ?? false);
  Reflect.set(engine, 'lastUpdateTime', 3_000);
  Reflect.set(engine, 'floorKey', options.floorKey ?? '1');
  Reflect.set(engine, 'unavailableReason', null);
};

describe('ParticleFusionEngine', () => {
  it('produces identical fused output for the same seed and operations', () => {
    const engineA = new ParticleFusionEngine({ rngSeed: 42 });
    const engineB = new ParticleFusionEngine({ rngSeed: 42 });
    const observation = makeObservation(chosenCenterLat, chosenCenterLng, 0.88);
    const targetObservation = makeObservation(chosenCenterLat + 0.00003, chosenCenterLng + 0.00003, 0.82, '1', 1_100);

    engineA.resetFromBle(observation);
    engineB.resetFromBle(observation);
    engineA.applyMotion(makeMotion(90));
    engineB.applyMotion(makeMotion(90));
    engineA.applyBleCorrection(targetObservation);
    engineB.applyBleCorrection(targetObservation);

    expect(engineA.getState()).toEqual(engineB.getState());
  });

  it('moves longitude eastward and keeps latitude approximately stable', () => {
    const engine = new ParticleFusionEngine({ rngSeed: 42 });
    const observation = makeObservation(chosenCenterLat, chosenCenterLng, 0.95);

    engine.resetFromBle(observation);
    const before = engine.getState();
    engine.applyMotion(makeMotion(90));
    const after = engine.getState();

    expect(after.lng).toBeGreaterThan(before.lng);
    expect(Math.abs(after.lat - before.lat)).toBeLessThan(0.0002);
  });

  it('pulls the fused position toward BLE observations without collapsing spread', () => {
    const engine = new ParticleFusionEngine({ rngSeed: 42 });
    const startObservation = makeObservation(chosenCenterLat, chosenCenterLng, 0.65, '1', 1_000);
    const targetObservation = makeObservation(chosenCenterLat + 0.00008, chosenCenterLng + 0.00008, 0.92, '1', 1_100);

    engine.resetFromBle(startObservation);
    const before = engine.getState();
    const beforeDistance = haversineDistanceMeters(before.lat, before.lng, targetObservation.lat, targetObservation.lng);

    engine.applyBleCorrection(targetObservation);
    const after = engine.getState();
    const afterDistance = haversineDistanceMeters(after.lat, after.lng, targetObservation.lat, targetObservation.lng);

    expect(afterDistance).toBeLessThan(beforeDistance);
    expect(after.particleSpread).toBeGreaterThan(FUSION_ACCURACY_MIN_M);
  });

  it('drops confidence to unknown after repeated motion without BLE', () => {
    const engine = new ParticleFusionEngine({ rngSeed: 42 });
    engine.resetFromBle(makeObservation(chosenCenterLat, chosenCenterLng, 0.9));

    engine.applyMotion(makeMotion(0, FUSION_UNKNOWN_AFTER_STEPS));

    const state = engine.getState();
    expect(state.stepsSinceLastBle).toBe(FUSION_UNKNOWN_AFTER_STEPS);
    expect(state.confidenceLevel).toBe('unknown');
  });

  it('penalizes particles outside known polygons without deleting them', () => {
    const engine = new ParticleFusionEngine({ rngSeed: 42 });
    const outsideObservation = makeObservation(0, 0, 0.75, '1', 1_000);

    engine.resetFromBle(outsideObservation);
    engine.applyBleCorrection(outsideObservation);

    const state = engine.getState();
    expect(state.particleCount).toBe(PARTICLE_COUNT);
    expect(state.particleSpread).toBeGreaterThan(0);
  });

  it('applies the exact confidence formula and threshold mapping', () => {
    const engine = new ParticleFusionEngine({ rngSeed: 42 });
    primeSyntheticState(engine, 10, {
      lastBleConfidence: 0.6,
      stepsSinceLastBle: 5,
      motionContinuity: true,
      hasBleAnchor: true,
    });

    const state = engine.getState();
    const particleConcentration = Math.min(
      1,
      Math.max(
        0,
        1 - ((state.accuracyMeters - FUSION_ACCURACY_MIN_M) / (FUSION_ACCURACY_MAX_M - FUSION_ACCURACY_MIN_M)),
      ),
    );
    const bleRecencyScore = Math.min(1, Math.max(0, 1 - 5 / FUSION_UNKNOWN_AFTER_STEPS)) * 0.6;
    const expectedConfidence = Math.min(
      1,
      Math.max(0, 0.45 * particleConcentration + 0.35 * bleRecencyScore + 0.20 * 1),
    );

    expect(state.confidence).toBeCloseTo(expectedConfidence, 12);
    expect(state.confidenceLevel).toBe('high');

    primeSyntheticState(engine, 10, {
      lastBleConfidence: 0,
      stepsSinceLastBle: 10,
      motionContinuity: false,
      hasBleAnchor: true,
    });
    expect(engine.getState().confidenceLevel).toBe('medium');

    primeSyntheticState(engine, 25, {
      lastBleConfidence: 0,
      stepsSinceLastBle: 10,
      motionContinuity: false,
      hasBleAnchor: true,
    });
    expect(engine.getState().confidenceLevel).toBe('low');

    primeSyntheticState(engine, 10, {
      lastBleConfidence: 1,
      stepsSinceLastBle: FUSION_UNKNOWN_AFTER_STEPS,
      motionContinuity: true,
      hasBleAnchor: true,
    });
    expect(engine.getState().confidenceLevel).toBe('unknown');

    const noAnchorEngine = new ParticleFusionEngine({ rngSeed: 42 });
    noAnchorEngine.resetUnavailable('missing anchor');
    expect(noAnchorEngine.getState().confidenceLevel).toBe('unknown');
    expect(noAnchorEngine.getState().unavailableReason).toBe('missing anchor');
  });

  it('retains the last estimate when BLE evidence is unavailable', () => {
    const engine = new ParticleFusionEngine({ rngSeed: 42 });
    primeSyntheticState(engine, 8, {
      lastBleConfidence: 0.6,
      stepsSinceLastBle: 10,
      motionContinuity: true,
      hasBleAnchor: true,
    });

    const before = engine.getState();
    engine.setUnavailableReason('insufficient_ble_evidence');
    const unavailable = engine.getState();

    expect(unavailable.unavailableReason).toBe('insufficient_ble_evidence');
    expect(unavailable.lat).toBeCloseTo(before.lat, 12);
    expect(unavailable.lng).toBeCloseTo(before.lng, 12);
    expect(unavailable.confidence).toBeCloseTo(before.confidence, 12);

    engine.applyMotion(makeMotion(0, FUSION_UNKNOWN_AFTER_STEPS - 10));
    const decayed = engine.getState();
    expect(decayed.confidenceLevel).toBe('unknown');
    expect(decayed.unavailableReason).toBe('insufficient_ble_evidence');
  });

  it('can represent a zero-AP floor without special-casing floor identifiers', () => {
    const emptyFloorKey = '__test_empty_floor__';
    expect(BLE_AP_FIXTURES.some((ap) => ap.floorKey === emptyFloorKey)).toBe(false);

    const engine = new ParticleFusionEngine({ rngSeed: 42 });
    primeSyntheticState(engine, 6, {
      floorKey: emptyFloorKey,
      hasBleAnchor: true,
      lastBleConfidence: 0.75,
      stepsSinceLastBle: 2,
      motionContinuity: true,
    });

    engine.setUnavailableReason('no_ap_fixtures_for_floor');
    const state = engine.getState();

    expect(state.floorKey).toBe(emptyFloorKey);
    expect(state.unavailableReason).toBe('no_ap_fixtures_for_floor');
    expect(state.confidenceLevel).not.toBe('unknown');
  });

  it('clusters initial particles around the BLE observation center', () => {
    const engine = new ParticleFusionEngine({ rngSeed: 42 });
    const observation = makeObservation(chosenCenterLat, chosenCenterLng, 0.98);

    engine.resetFromBle(observation);
    const state = engine.getState();

    expect(haversineDistanceMeters(state.lat, state.lng, observation.lat, observation.lng)).toBeLessThan(1.5);
    expect(state.particleSpread).toBeGreaterThan(0);
    expect(state.particleSpread).toBeLessThanOrEqual(PARTICLE_INIT_RADIUS_M);
  });

  it('converges toward the same BLE observation across repeated corrections', () => {
    const engine = new ParticleFusionEngine({ rngSeed: 42 });
    const startObservation = makeObservation(chosenCenterLat, chosenCenterLng, 0.7);
    const targetObservation = makeObservation(chosenCenterLat + 0.0001, chosenCenterLng + 0.0001, 0.9, '1', 1_100);

    engine.resetFromBle(startObservation);
    engine.applyBleCorrection(targetObservation);
    const firstDistance = haversineDistanceMeters(engine.getState().lat, engine.getState().lng, targetObservation.lat, targetObservation.lng);

    engine.applyBleCorrection(targetObservation);
    engine.applyBleCorrection(targetObservation);
    const laterDistance = haversineDistanceMeters(engine.getState().lat, engine.getState().lng, targetObservation.lat, targetObservation.lng);

    expect(laterDistance).toBeLessThan(firstDistance);
  });
});
