import type { AccessPoint } from '../types/accessPoint';
import type { IndoorPosition, IndoorPositionSource } from '../types/position';
import { clamp, clampPercent } from './coordinate';
import type { RttMeasurement } from '../services/rtt/rttTypes';

export type IndoorPositionEstimateInput = {
  floorKey: string;
  accessPoints: readonly AccessPoint[];
  measurements: readonly RttMeasurement[];
  updatedAt?: number;
  source?: IndoorPositionSource;
};

export type IndoorPositionEstimate = {
  position: IndoorPosition;
  validMeasurementCount: number;
  usedMeasurements: readonly RttMeasurement[];
};

const MIN_VALID_MEASUREMENTS = 3;
const MAX_USED_MEASUREMENTS = 6;

export const estimateIndoorPositionFromRtt = ({
  floorKey,
  accessPoints,
  measurements,
  updatedAt = Date.now(),
  source = 'mock-rtt' as IndoorPositionSource,
}: IndoorPositionEstimateInput): IndoorPositionEstimate => {
  const accessPointById = new Map(accessPoints.map((accessPoint) => [accessPoint.id, accessPoint]));

  const validMeasurements = measurements
    .filter((measurement) => measurement.isValid && Number.isFinite(measurement.distanceMeters) && measurement.distanceMeters > 0)
    .filter((measurement) => {
      const accessPoint = accessPointById.get(measurement.accessPointId);

      return accessPoint !== undefined && accessPoint.floorKey === floorKey;
    })
    .slice()
    .sort((left, right) => left.distanceMeters - right.distanceMeters)
    .slice(0, MAX_USED_MEASUREMENTS);

  if (validMeasurements.length < MIN_VALID_MEASUREMENTS) {
    throw new Error('RTT 측정값이 충분하지 않아 현재 위치를 계산할 수 없습니다.');
  }

  const weightedPosition = validMeasurements.reduce(
    (accumulator, measurement) => {
      const accessPoint = accessPointById.get(measurement.accessPointId);

      if (!accessPoint) {
        return accumulator;
      }

      const weight = 1 / Math.max(measurement.distanceMeters, 0.1);

      return {
        x: accumulator.x + accessPoint.x * weight,
        y: accumulator.y + accessPoint.y * weight,
        weightSum: accumulator.weightSum + weight,
      };
    },
    { x: 0, y: 0, weightSum: 0 },
  );

  if (weightedPosition.weightSum <= 0) {
    throw new Error('RTT 측정값에서 위치를 계산할 수 없습니다.');
  }

  const averageDistance = validMeasurements.reduce((accumulator, measurement) => accumulator + measurement.distanceMeters, 0) / validMeasurements.length;
  const squaredSpread = validMeasurements.reduce((accumulator, measurement) => {
    const delta = measurement.distanceMeters - averageDistance;

    return accumulator + delta * delta;
  }, 0);
  const spread = Math.sqrt(squaredSpread / validMeasurements.length);

  const x = clampPercent(weightedPosition.x / weightedPosition.weightSum);
  const y = clampPercent(weightedPosition.y / weightedPosition.weightSum);
  const accuracyMeters = clamp(averageDistance * 0.28 + spread * 0.18 + 1.4, 1.5, 18);

  return {
    position: {
      floorKey,
      x,
      y,
      accuracyMeters,
      source,
      precision: 'precise',
      precisionNotes: [],
      isIndoorPrecise: true,
      isFloorGuaranteed: true,
      isRoomGuaranteed: true,
      coordinateMode: 'map-percent',
      updatedAt,
    },
    validMeasurementCount: validMeasurements.length,
    usedMeasurements: validMeasurements,
  };
};
