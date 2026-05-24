import { createMockIndoorLocationProvider } from './mockIndoorLocationProvider';
import type { IndoorLocationProvider } from './locationTypes';

let activeIndoorLocationProvider: IndoorLocationProvider = createMockIndoorLocationProvider();

export const getIndoorLocationProvider = (): IndoorLocationProvider => {
  return activeIndoorLocationProvider;
};

export const setIndoorLocationProvider = (provider: IndoorLocationProvider): void => {
  activeIndoorLocationProvider = provider;
};

export const resetIndoorLocationProvider = (): void => {
  activeIndoorLocationProvider = createMockIndoorLocationProvider();
};
