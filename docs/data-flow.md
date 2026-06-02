# Data Flow

## Core invariant

All indoor map positions in the app are stored and rendered as map-percent `x/y`.
The app does not convert BSSM floor coordinates to geographic latitude/longitude.

## BSSM -> map -> APs -> RTT

1. `src/constants/bssmFloorMap.ts` provides the floor JSON in map-percent space.
2. `src/utils/floorMap.ts` selects the active floor.
3. `src/utils/accessPoint.ts` generates APs from interactive rooms by taking room centers.
4. `src/services/rtt/mockRttScanner.ts` simulates RTT measurements from those APs.
5. `src/utils/positioning.ts` estimates position with inverse-distance weighting.
6. `src/store/positionStore.ts` stores the result and mirrors debug data into `src/store/debugStore.ts`.
7. `src/components/map/NativeFloorMap.tsx` renders room blocks, AP markers, the accuracy circle, and the user marker.

## Debug RTT

- `DebugRttScreen` reads the latest floor, AP list, scan result, and position from stores.
- The screen shows measurement counts, reference/mock position, estimated position, and per-AP rows.

## iOS calibration path

1. A future iOS integration can read Core Location latitude/longitude.
2. `src/services/calibration/iosCalibration.ts` converts that reading into map-percent using explicit bounds or anchors.
3. The calibrated position is marked as limited precision.
4. Floor and room precision are explicitly not guaranteed.

## Provider abstraction

- `src/services/location/locationTypes.ts` defines the provider contract.
- `src/services/location/indoorLocationProvider.ts` keeps Mock RTT as the default provider.
- `src/services/location/mockIndoorLocationProvider.ts` adapts the existing mock RTT pipeline to the provider contract.
