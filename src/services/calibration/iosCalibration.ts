import type { FloorKey } from '../../types/floorMap';
import type { IndoorPosition } from '../../types/position';
import { clampPercent } from '../../utils/coordinate';

export interface IosCalibrationBounds {
  topLatitude: number;
  bottomLatitude: number;
  leftLongitude: number;
  rightLongitude: number;
}

export interface IosCalibrationAnchor {
  latitude: number;
  longitude: number;
  x: number;
  y: number;
}

export interface IosLatLngInput {
  latitude: number;
  longitude: number;
}

export type IosCalibrationInput =
  | {
      kind: 'bounds';
      bounds: IosCalibrationBounds;
      accuracyMeters?: number;
    }
  | {
      kind: 'anchors';
      anchors: readonly IosCalibrationAnchor[];
      accuracyMeters?: number;
    };

export const IOS_CALIBRATION_LIMITATIONS = [
  'iOS Core Location only provides a coarse calibration input.',
  'Floor identity is not guaranteed from Core Location alone.',
  'Room-level accuracy is not guaranteed.',
] as const;

const interpolate = (value: number, start: number, end: number, startTarget: number, endTarget: number): number => {
  if (start === end) {
    return (startTarget + endTarget) / 2;
  }

  const ratio = (value - start) / (end - start);

  return startTarget + ratio * (endTarget - startTarget);
};

const normalizeBounds = (bounds: IosCalibrationBounds): IosCalibrationBounds => {
  const topLatitude = Math.max(bounds.topLatitude, bounds.bottomLatitude);
  const bottomLatitude = Math.min(bounds.topLatitude, bounds.bottomLatitude);
  const leftLongitude = Math.min(bounds.leftLongitude, bounds.rightLongitude);
  const rightLongitude = Math.max(bounds.leftLongitude, bounds.rightLongitude);

  return {
    topLatitude,
    bottomLatitude,
    leftLongitude,
    rightLongitude,
  };
};

const normalizeAnchors = (anchors: readonly IosCalibrationAnchor[]) => {
  if (anchors.length < 2) {
    throw new Error('iOS calibration anchors require at least two points.');
  }

  return {
    topLatitude: Math.max(...anchors.map((anchor) => anchor.latitude)),
    bottomLatitude: Math.min(...anchors.map((anchor) => anchor.latitude)),
    leftLongitude: Math.min(...anchors.map((anchor) => anchor.longitude)),
    rightLongitude: Math.max(...anchors.map((anchor) => anchor.longitude)),
    minX: Math.min(...anchors.map((anchor) => anchor.x)),
    maxX: Math.max(...anchors.map((anchor) => anchor.x)),
    minY: Math.min(...anchors.map((anchor) => anchor.y)),
    maxY: Math.max(...anchors.map((anchor) => anchor.y)),
  };
};

const mapLatLngToMapPercent = (reading: IosLatLngInput, bounds: IosCalibrationBounds): { x: number; y: number } => {
  const normalized = normalizeBounds(bounds);

  return {
    x: clampPercent(interpolate(reading.longitude, normalized.leftLongitude, normalized.rightLongitude, 0, 100)),
    y: clampPercent(interpolate(reading.latitude, normalized.topLatitude, normalized.bottomLatitude, 0, 100)),
  };
};

export const calibrateLatLngToMapPercent = (reading: IosLatLngInput, bounds: IosCalibrationBounds): { x: number; y: number } => {
  return mapLatLngToMapPercent(reading, bounds);
};

export const calibrateLatLngToMapPercentFromAnchors = (
  reading: IosLatLngInput,
  anchors: readonly IosCalibrationAnchor[],
): { x: number; y: number } => {
  const normalized = normalizeAnchors(anchors);

  return {
    x: clampPercent(interpolate(reading.longitude, normalized.leftLongitude, normalized.rightLongitude, normalized.minX, normalized.maxX)),
    y: clampPercent(interpolate(reading.latitude, normalized.topLatitude, normalized.bottomLatitude, normalized.minY, normalized.maxY)),
  };
};

export const createIosCalibratedIndoorPosition = ({
  floorKey,
  latitude,
  longitude,
  calibration,
  measuredAt = Date.now(),
}: {
  floorKey: FloorKey;
  latitude: number;
  longitude: number;
  calibration: IosCalibrationInput;
  measuredAt?: number;
}): IndoorPosition => {
  const point = calibration.kind === 'bounds'
    ? calibrateLatLngToMapPercent({ latitude, longitude }, calibration.bounds)
    : calibrateLatLngToMapPercentFromAnchors({ latitude, longitude }, calibration.anchors);

  return {
    floorKey,
    x: point.x,
    y: point.y,
    accuracyMeters: Math.max(calibration.accuracyMeters ?? 18, 1.5),
    source: 'ios-core-location',
    precision: 'limited',
    precisionNotes: IOS_CALIBRATION_LIMITATIONS,
    isIndoorPrecise: false,
    isFloorGuaranteed: false,
    isRoomGuaranteed: false,
    coordinateMode: 'map-percent',
    updatedAt: measuredAt,
  };
};
