import { Platform } from 'react-native';
import { createMockIndoorLocationProvider } from './mockIndoorLocationProvider';
import type { IndoorLocationProvider } from './locationTypes';
import type { IosCalibrationInput } from '../calibration/iosCalibration';

const DEFAULT_IOS_CALIBRATION: IosCalibrationInput = {
  kind: 'bounds',
  bounds: { topLatitude: 37.5, bottomLatitude: 37.4, leftLongitude: 127.0, rightLongitude: 127.1 },
  accuracyMeters: 18,
};

const createDefaultProvider = (): IndoorLocationProvider => {
  if (Platform.OS === 'android') {
    const { createAndroidRttProvider } = require('./androidRttProvider');
    return createAndroidRttProvider();
  }
  if (Platform.OS === 'ios') {
    const { createIosBleProvider } = require('./iosBleProvider');
    return createIosBleProvider(DEFAULT_IOS_CALIBRATION);
  }
  return createMockIndoorLocationProvider();
};

let activeIndoorLocationProvider: IndoorLocationProvider = createDefaultProvider();

export const getIndoorLocationProvider = (): IndoorLocationProvider => {
  return activeIndoorLocationProvider;
};

export const setIndoorLocationProvider = (provider: IndoorLocationProvider): void => {
  activeIndoorLocationProvider = provider;
};

export const resetIndoorLocationProvider = (): void => {
  activeIndoorLocationProvider = createDefaultProvider();
};
