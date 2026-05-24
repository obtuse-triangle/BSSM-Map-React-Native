import type { IndoorPosition } from '../../types/position';
import { createIosCalibratedIndoorPosition, type IosCalibrationInput } from '../calibration/iosCalibration';
import type { IosCoreLocationReading } from './locationTypes';

export interface IosCoreLocationAdapterRequest {
  reading: IosCoreLocationReading;
  calibration: IosCalibrationInput;
}

export const adaptIosCoreLocationReadingToIndoorPosition = ({ reading, calibration }: IosCoreLocationAdapterRequest): IndoorPosition => {
  return createIosCalibratedIndoorPosition({
    floorKey: reading.floorKey,
    latitude: reading.latitude,
    longitude: reading.longitude,
    calibration,
    measuredAt: reading.measuredAt,
  });
};
