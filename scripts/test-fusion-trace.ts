import fs from 'node:fs/promises';
import path from 'node:path';

import { BLE_AP_FIXTURES } from '../src/constants/bleAccessPoints';
import { ParticleFusionEngine } from '../src/services/location/particleFusionEngine';
import { transformEpsg5183ToWgs84 } from '../src/utils/coordinateTransform';

type TraceEvent = MotionEvent | BleEvent | GroundTruthEvent;

interface BaseTraceEvent {
  timestamp: number;
}

interface MotionEvent extends BaseTraceEvent {
  type: 'motion';
  steps: number;
  heading: number;
  userAccelerationMagnitude: number;
}

interface BleEvent extends BaseTraceEvent {
  type: 'ble';
  lat: number;
  lng: number;
  confidence: number;
  accuracyMeters: number;
  apCount: number;
  floorKey: string;
}

interface GroundTruthEvent extends BaseTraceEvent {
  type: 'groundTruth';
  lat: number;
  lng: number;
  label: string;
}

interface TraceExpectation {
  maxAlongAxisErrorMeters: number;
  maxCrossAxisErrorMeters: number;
  finalConfidence: number;
  zoneTransitionDetected: boolean;
  zoneTransitionWithinSteps: number;
}

interface TraceFile {
  traceId: string;
  floorKey: string;
  initialBle: BleObservation;
  events: TraceEvent[];
  expectations: TraceExpectation;
}

interface BleObservation {
  lat: number;
  lng: number;
  confidence: number;
  accuracyMeters: number;
  apCount: number;
  floorKey: string;
  timestamp: number;
}

interface Summary {
  traceId: string;
  floorKey: string;
  maxAlongAxisErrorMeters: number;
  maxCrossAxisErrorMeters: number;
  finalConfidence: number;
  zoneTransitionDetected: boolean;
  zoneTransitionWithinSteps: number;
  flipFlopFreeForSixStepsAfterTransition: boolean;
  finalZoneId: string | null;
}

const EARTH_RADIUS_M = 6_371_000;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isString = (value: unknown): value is string => typeof value === 'string';

const toLocalMeters = (
  origin: { lat: number; lng: number },
  point: { lat: number; lng: number },
): { x: number; y: number } => {
  const avgLatRad = ((origin.lat + point.lat) / 2) * (Math.PI / 180);
  return {
    x: ((point.lng - origin.lng) * Math.PI / 180) * Math.cos(avgLatRad) * EARTH_RADIUS_M,
    y: ((point.lat - origin.lat) * Math.PI / 180) * EARTH_RADIUS_M,
  };
};

const haversineDistanceMeters = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number => {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const deltaLat = ((b.lat - a.lat) * Math.PI) / 180;
  const deltaLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(deltaLat / 2);
  const sinLng = Math.sin(deltaLng / 2);
  const aa = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return EARTH_RADIUS_M * (2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa)));
};

const getAp = (id: string): { lat: number; lng: number } => {
  const ap = BLE_AP_FIXTURES.find((entry) => entry.id === id);
  if (ap === undefined) {
    throw new Error(`Missing AP fixture: ${id}`);
  }

  const [lng, lat] = transformEpsg5183ToWgs84(ap.x5183, ap.y5183);
  return { lat, lng };
};

const getAxis = (startId: string, endId: string): { x: number; y: number } => {
  const start = getAp(startId);
  const end = getAp(endId);
  const delta = toLocalMeters(start, end);
  const length = Math.hypot(delta.x, delta.y);

  if (length === 0) {
    throw new Error(`Axis endpoints are identical: ${startId} -> ${endId}`);
  }

  return { x: delta.x / length, y: delta.y / length };
};

const floorAxisByKey = (floorKey: string): { x: number; y: number } => {
  if (floorKey === '3') {
    return getAxis('M-3F-A06', 'M-3F-A02');
  }

  if (floorKey === '1') {
    return getAxis('MA-1F-A06', 'MA-1F-A04');
  }

  return getAxis('M-3F-A06', 'M-3F-A02');
};

const parseTraceFile = (raw: unknown): TraceFile => {
  if (!isObject(raw)) {
    throw new Error('Trace file must contain a JSON object.');
  }

  const traceId = raw.traceId;
  const floorKey = raw.floorKey;
  const initialBle = raw.initialBle;
  const events = raw.events;
  const expectations = raw.expectations;

  if (!isString(traceId) || traceId.length === 0) {
    throw new Error('Invalid traceId.');
  }

  if (!isString(floorKey) || floorKey.length === 0) {
    throw new Error('Invalid floorKey.');
  }

  if (!isObject(initialBle)) {
    throw new Error('Invalid initialBle object.');
  }

  if (!Array.isArray(events) || events.length === 0) {
    throw new Error('Trace must include a non-empty events array.');
  }

  if (!isObject(expectations)) {
    throw new Error('Invalid expectations object.');
  }

  const parsedInitialBle = parseInitialBle(initialBle);
  const parsedEvents = events.map((event, index) => parseEvent(event, index));

  return {
    traceId,
    floorKey,
    initialBle: parsedInitialBle,
    events: parsedEvents,
    expectations: parseExpectations(expectations),
  };
};

const parseExpectations = (value: Record<string, unknown>): TraceExpectation => {
  const maxAlongAxisErrorMeters = value.maxAlongAxisErrorMeters;
  const maxCrossAxisErrorMeters = value.maxCrossAxisErrorMeters;
  const finalConfidence = value.finalConfidence;
  const zoneTransitionDetected = value.zoneTransitionDetected;
  const zoneTransitionWithinSteps = value.zoneTransitionWithinSteps;

  if (
    !isFiniteNumber(maxAlongAxisErrorMeters) ||
    !isFiniteNumber(maxCrossAxisErrorMeters) ||
    !isFiniteNumber(finalConfidence) ||
    typeof zoneTransitionDetected !== 'boolean' ||
    !isFiniteNumber(zoneTransitionWithinSteps)
  ) {
    throw new Error('Invalid expectations schema.');
  }

  return {
    maxAlongAxisErrorMeters,
    maxCrossAxisErrorMeters,
    finalConfidence,
    zoneTransitionDetected,
    zoneTransitionWithinSteps,
  };
};

const parseInitialBle = (value: unknown): BleObservation => {
  if (!isObject(value)) {
    throw new Error('Invalid initialBle object.');
  }

  if (
    !isFiniteNumber(value.lat) ||
    !isFiniteNumber(value.lng) ||
    !isFiniteNumber(value.confidence) ||
    !isFiniteNumber(value.accuracyMeters) ||
    !isFiniteNumber(value.apCount) ||
    !isString(value.floorKey) ||
    !isFiniteNumber(value.timestamp)
  ) {
    throw new Error('Invalid initialBle schema.');
  }

  return {
    lat: value.lat,
    lng: value.lng,
    confidence: value.confidence,
    accuracyMeters: value.accuracyMeters,
    apCount: value.apCount,
    floorKey: value.floorKey,
    timestamp: value.timestamp,
  };
};

const parseBleEvent = (value: unknown, label: string): BleEvent => {
  if (!isObject(value)) {
    throw new Error(`Invalid ${label} object.`);
  }

  if (
    value.type !== 'ble' ||
    !isFiniteNumber(value.lat) ||
    !isFiniteNumber(value.lng) ||
    !isFiniteNumber(value.confidence) ||
    !isFiniteNumber(value.accuracyMeters) ||
    !isFiniteNumber(value.apCount) ||
    !isString(value.floorKey) ||
    !isFiniteNumber(value.timestamp)
  ) {
    throw new Error(`Invalid ${label} schema.`);
  }

  return {
    type: 'ble',
    lat: value.lat,
    lng: value.lng,
    confidence: value.confidence,
    accuracyMeters: value.accuracyMeters,
    apCount: value.apCount,
    floorKey: value.floorKey,
    timestamp: value.timestamp,
  };
};

const parseMotionEvent = (value: unknown, index: number): MotionEvent => {
  if (!isObject(value)) {
    throw new Error(`Invalid motion event at index ${index}.`);
  }

  if (
    value.type !== 'motion' ||
    !isFiniteNumber(value.steps) ||
    !isFiniteNumber(value.heading) ||
    !isFiniteNumber(value.userAccelerationMagnitude) ||
    !isFiniteNumber(value.timestamp)
  ) {
    throw new Error(`Invalid motion event schema at index ${index}.`);
  }

  return {
    type: 'motion',
    steps: value.steps,
    heading: value.heading,
    userAccelerationMagnitude: value.userAccelerationMagnitude,
    timestamp: value.timestamp,
  };
};

const parseGroundTruthEvent = (value: unknown, index: number): GroundTruthEvent => {
  if (!isObject(value)) {
    throw new Error(`Invalid groundTruth event at index ${index}.`);
  }

  if (
    value.type !== 'groundTruth' ||
    !isFiniteNumber(value.lat) ||
    !isFiniteNumber(value.lng) ||
    !isString(value.label) ||
    !isFiniteNumber(value.timestamp)
  ) {
    throw new Error(`Invalid groundTruth event schema at index ${index}.`);
  }

  return {
    type: 'groundTruth',
    lat: value.lat,
    lng: value.lng,
    label: value.label,
    timestamp: value.timestamp,
  };
};

const parseEvent = (value: unknown, index: number): TraceEvent => {
  if (!isObject(value) || !isString(value.type)) {
    throw new Error(`Event at index ${index} must be an object with a type.`);
  }

  if (value.type === 'motion') {
    return parseMotionEvent(value, index);
  }

  if (value.type === 'ble') {
    return parseBleEvent(value, `event at index ${index}`);
  }

  if (value.type === 'groundTruth') {
    return parseGroundTruthEvent(value, index);
  }

  throw new Error(`Unsupported event type at index ${index}: ${value.type}`);
};

const runTrace = (trace: TraceFile): Summary => {
  const engine = new ParticleFusionEngine({ rngSeed: 42 });
  engine.resetFromBle(trace.initialBle);

  const axis = floorAxisByKey(trace.floorKey);
  const axisPerpendicular = { x: -axis.y, y: axis.x };

  let previousZoneId = engine.getState().inferredZone?.zoneId ?? null;
  let motionStepsSinceStart = 0;
  let transitionStepCount: number | null = null;
  let transitionDetected = false;
  let flipFlopFreeForSixStepsAfterTransition = true;
  let maxAlongAxisErrorMeters = 0;
  let maxCrossAxisErrorMeters = 0;

  for (const event of trace.events) {
    if (event.type === 'motion') {
      engine.applyMotion(event);
      motionStepsSinceStart += event.steps;
    } else if (event.type === 'ble') {
      engine.applyBleCorrection(event);
    } else {
      const state = engine.getState();
      const errorVector = toLocalMeters(event, { lat: state.lat, lng: state.lng });
      const alongAxisErrorMeters = Math.abs(errorVector.x * axis.x + errorVector.y * axis.y);
      const crossAxisErrorMeters = Math.abs(errorVector.x * axisPerpendicular.x + errorVector.y * axisPerpendicular.y);
      const distanceMeters = haversineDistanceMeters(event, { lat: state.lat, lng: state.lng });

      maxAlongAxisErrorMeters = Math.max(maxAlongAxisErrorMeters, alongAxisErrorMeters);
      maxCrossAxisErrorMeters = Math.max(maxCrossAxisErrorMeters, crossAxisErrorMeters);

      console.log(
        `[groundTruth] ${event.label} dist=${distanceMeters.toFixed(2)}m along=${alongAxisErrorMeters.toFixed(2)}m cross=${crossAxisErrorMeters.toFixed(2)}m`,
      );
    }

    const state = engine.getState();
    const zoneId = state.inferredZone?.zoneId ?? null;

    if (zoneId !== previousZoneId) {
      if (!transitionDetected && zoneId !== null) {
        transitionDetected = true;
        transitionStepCount = motionStepsSinceStart;
      } else if (
        transitionDetected &&
        transitionStepCount !== null &&
        motionStepsSinceStart > transitionStepCount &&
        motionStepsSinceStart - transitionStepCount <= 6
      ) {
        flipFlopFreeForSixStepsAfterTransition = false;
      }

      previousZoneId = zoneId;
    }
  }

  const finalState = engine.getState();
  const summary: Summary = {
    traceId: trace.traceId,
    floorKey: trace.floorKey,
    maxAlongAxisErrorMeters,
    maxCrossAxisErrorMeters,
    finalConfidence: finalState.confidence,
    zoneTransitionDetected: transitionDetected,
    zoneTransitionWithinSteps: transitionStepCount ?? 0,
    flipFlopFreeForSixStepsAfterTransition,
    finalZoneId: finalState.inferredZone?.zoneId ?? null,
  };

  console.log(JSON.stringify(summary, null, 2));

  const failures: string[] = [];
  if (summary.maxAlongAxisErrorMeters > trace.expectations.maxAlongAxisErrorMeters) {
    failures.push(
      `maxAlongAxisErrorMeters ${summary.maxAlongAxisErrorMeters.toFixed(3)} > ${trace.expectations.maxAlongAxisErrorMeters}`,
    );
  }
  if (summary.maxCrossAxisErrorMeters > trace.expectations.maxCrossAxisErrorMeters) {
    failures.push(
      `maxCrossAxisErrorMeters ${summary.maxCrossAxisErrorMeters.toFixed(3)} > ${trace.expectations.maxCrossAxisErrorMeters}`,
    );
  }
  if (summary.finalConfidence < trace.expectations.finalConfidence) {
    failures.push(`finalConfidence ${summary.finalConfidence.toFixed(3)} < ${trace.expectations.finalConfidence}`);
  }
  if (summary.zoneTransitionDetected !== trace.expectations.zoneTransitionDetected) {
    failures.push(
      `zoneTransitionDetected ${summary.zoneTransitionDetected} !== ${trace.expectations.zoneTransitionDetected}`,
    );
  }
  if (
    summary.zoneTransitionDetected &&
    summary.zoneTransitionWithinSteps > trace.expectations.zoneTransitionWithinSteps
  ) {
    failures.push(
      `zoneTransitionWithinSteps ${summary.zoneTransitionWithinSteps} > ${trace.expectations.zoneTransitionWithinSteps}`,
    );
  }
  if (trace.expectations.zoneTransitionDetected && !summary.flipFlopFreeForSixStepsAfterTransition) {
    failures.push('zone flip-flop detected within 6 steps after transition');
  }

  if (failures.length > 0) {
    throw new Error(`Trace verification failed for ${trace.traceId}:\n- ${failures.join('\n- ')}`);
  }

  console.log(`PASS: ${trace.traceId}`);
  return summary;
};

const main = async (): Promise<void> => {
  const traceArg = process.argv.find((arg) => arg.startsWith('--trace='));
  if (traceArg === undefined) {
    throw new Error('Missing required --trace=path/to/trace.json argument.');
  }

  const tracePath = traceArg.slice('--trace='.length);
  if (tracePath.length === 0) {
    throw new Error('Missing trace path in --trace= argument.');
  }

  const resolvedPath = path.resolve(process.cwd(), tracePath);
  const rawContent = await fs.readFile(resolvedPath, 'utf8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse JSON trace at ${resolvedPath}: ${message}`);
  }

  const trace = parseTraceFile(parsed);
  runTrace(trace);
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
