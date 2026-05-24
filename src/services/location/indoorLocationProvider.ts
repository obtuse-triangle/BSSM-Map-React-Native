import { Platform } from 'react-native';
import { createMockIndoorLocationProvider } from './mockIndoorLocationProvider';
import { createAndroidRttProvider } from './androidRttProvider';
import { createIosBleProvider } from './iosBleProvider';
import type { IndoorLocationProvider } from './locationTypes';

const createDefaultProvider = (): IndoorLocationProvider => {
  if (Platform.OS === 'android') {
    return createAndroidRttProvider();
  }
  if (Platform.OS === 'ios') {
    return createIosBleProvider();
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
