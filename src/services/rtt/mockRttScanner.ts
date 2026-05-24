import { clampPercent } from '../../utils/coordinate';
import type { AccessPoint } from '../../types/accessPoint';
import type { RttMeasurement, RttScanRequest, RttScanResult } from './rttTypes';

const METERS_PER_PERCENT = 0.62;
const SCAN_DELAY_MS = 360;

const hashString = (value: string): number => {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
};

const toUnitInterval = (seed: number): number => {
  return (seed >>> 0) / 4294967295;
};

const getReferencePosition = (floorKey: string, accessPoints: readonly AccessPoint[]): { x: number; y: number } => {
  if (accessPoints.length === 0) {
    return {
      x: 50,
      y: 50,
    };
  }

  const centroid = accessPoints.reduce(
    (accumulator, accessPoint) => ({
      x: accumulator.x + accessPoint.x,
      y: accumulator.y + accessPoint.y,
    }),
    { x: 0, y: 0 },
  );

  centroid.x /= accessPoints.length;
  centroid.y /= accessPoints.length;

  const spread = accessPoints.reduce((accumulator, accessPoint) => {
    const deltaX = accessPoint.x - centroid.x;
    const deltaY = accessPoint.y - centroid.y;

    return accumulator + Math.hypot(deltaX, deltaY);
  }, 0) / accessPoints.length;

  const seed = hashString(`${floorKey}:${accessPoints.map((accessPoint) => accessPoint.id).join('|')}`);
  const offsetMagnitude = Math.max(2.5, Math.min(8, spread * 0.35));
  const offsetX = (toUnitInterval(seed) - 0.5) * offsetMagnitude;
  const offsetY = (toUnitInterval(seed ^ 0x9e3779b9) - 0.5) * offsetMagnitude;

  return {
    x: clampPercent(centroid.x + offsetX),
    y: clampPercent(centroid.y + offsetY),
  };
};

const buildMeasurement = (
  accessPoint: AccessPoint,
  referencePosition: { x: number; y: number },
  measuredAt: number,
): RttMeasurement => {
  const seed = hashString(`${accessPoint.id}:${accessPoint.floorKey}`);
  const deterministicJitter = (toUnitInterval(seed) - 0.5) * 1.15;
  const deltaX = accessPoint.x - referencePosition.x;
  const deltaY = accessPoint.y - referencePosition.y;
  const distancePercent = Math.hypot(deltaX, deltaY);
  const distanceMeters = Math.max(1.4, distancePercent * METERS_PER_PERCENT + deterministicJitter);
  const rssiDbm = Math.round(-38 - distanceMeters * 1.85 - Math.abs(deterministicJitter) * 5);

  return {
    accessPointId: accessPoint.id,
    floorKey: accessPoint.floorKey,
    ssid: accessPoint.ssid,
    bssid: accessPoint.bssid,
    distanceMeters,
    rssiDbm,
    measuredAt,
    source: 'mock-rtt',
    isValid: Number.isFinite(distanceMeters) && distanceMeters > 0,
  };
};

export const createMockRttScanResult = ({ floorKey, accessPoints, measuredAt = Date.now() }: RttScanRequest): RttScanResult => {
  const referencePosition = getReferencePosition(floorKey, accessPoints);
  const measurements = accessPoints.map((accessPoint) => buildMeasurement(accessPoint, referencePosition, measuredAt));

  return {
    floorKey,
    accessPoints,
    measurements,
    referencePosition,
    measuredAt,
    source: 'mock-rtt',
  };
};

export const scanMockRtt = async (request: RttScanRequest): Promise<RttScanResult> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, SCAN_DELAY_MS);
  });

  return createMockRttScanResult(request);
};
