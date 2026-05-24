import { estimateIndoorPositionFromRtt } from '../../utils/positioning';
import { scanMockRtt } from '../rtt/mockRttScanner';
import type { IndoorLocationProvider, IndoorLocationRequest, IndoorLocationResult } from './locationTypes';

const buildMockIndoorLocationResult = async (request: IndoorLocationRequest): Promise<IndoorLocationResult> => {
  const scanResult = await scanMockRtt(request);
  const estimate = estimateIndoorPositionFromRtt({
    floorKey: request.floorKey,
    accessPoints: request.accessPoints,
    measurements: scanResult.measurements,
    updatedAt: scanResult.measuredAt,
  });

  return {
    providerKind: 'mock-rtt',
    measuredAt: scanResult.measuredAt,
    floorKey: request.floorKey,
    accessPoints: request.accessPoints,
    measurements: scanResult.measurements,
    referencePosition: scanResult.referencePosition,
    scanResult,
    position: estimate.position,
    measurementCount: scanResult.measurements.length,
    validMeasurementCount: estimate.validMeasurementCount,
    precision: estimate.position.precision,
    precisionNotes: estimate.position.precisionNotes,
    floorGuaranteed: estimate.position.isFloorGuaranteed,
    roomGuaranteed: estimate.position.isRoomGuaranteed,
  };
};

export const createMockIndoorLocationProvider = (): IndoorLocationProvider => ({
  kind: 'mock-rtt',
  label: 'Mock RTT',
  locate: (request) => buildMockIndoorLocationResult(request),
});
