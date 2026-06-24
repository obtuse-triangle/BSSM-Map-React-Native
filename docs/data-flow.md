# Data Flow

## Core invariant

The legacy RTT/SVG indoor positioning pipeline stores and renders positions as map-percent `x/y`.
The BLE WCL pipeline (iOS foreground only) produces WGS84 `[longitude, latitude]` for MapLibre.

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

## BLE WCL (Weighted Centroid Localisation) — iOS foreground only

BLE WCL is a **parallel pipeline** to the legacy RTT/SVG path. It produces
WGS84 `[longitude, latitude]` coordinates for the MapLibre campus map,
not map-percent coordinates.

### Data flow

1. `modules/ios-ble-positioning/ios/ExpoBlePositioningModule.swift` scans
   foreground CoreBluetooth advertisements and filters for HPE/Aruba
   manufacturer ID `0x011B`.
2. `modules/ios-ble-positioning/src/index.ts` receives `ArubaBleObservation`
   (bleIdentifier, manufacturerId, rssi, payloadHex, observedAt).
3. `src/services/location/bleObservations.ts` — `BleObservationBuffer` stores
   the latest observation per AP identity (O(1) insert, prunes stale >120s).
4. `src/services/location/bleWeightedCentroid.ts` — pure WCL function:
   - Filters by floorKey, manufacturer, RSSI ≥ −90 dBm, age ≤ 120 s.
   - Requires ≥ 2 valid APs (else `INSUFFICIENT_APS`).
   - Computes RSSI-weighted centroid in EPSG:5183.
   - Converts centroid to WGS84 via `src/utils/coordinateTransform.ts` (proj4).
5. `src/services/location/bleWclProvider.ts` — validates result against
   campus bounds (`src/constants/campusBounds.ts`) and finite checks.
6. `src/store/bleLocationStore.ts` — Zustand store that receives the result
   and forwards to `mapStore.userCoordinates` when confidence > 0.
7. `src/components/map/BleWclStatusCard.tsx` — debug card showing used AP
   count, confidence, accuracy, sample age, and STALE badge.
8. `CampusMap.tsx` renders the BLE WCL marker via `mapStore.userCoordinates`.

### Key constraints

- **iOS only**: The native module is Swift/ObjC (no Android BLE scanning).
- **Foreground only**: No background BLE delivery support.
- **Delayed delivery**: iOS CoreBluetooth can delay BLE packets 5 s to
  1 min+ despite 1 s AP advertisement interval.
- **Fixture data**: `src/constants/bleAccessPoints.ts` contains placeholder
  `BLE_AP_FIXTURES` with all-zero EPSG:5183 coordinates. Real AP survey data
  is required for production use.
- **No fingerprinting**: The MVP does not use RSSI fingerprinting or radio
  maps. Coordinates are derived from known AP locations only.

See `docs/ble-wcl-mvp.md` for the full architecture and constraint documentation.

## Provider abstraction

- `src/services/location/locationTypes.ts` defines the provider contract.
- `src/services/location/indoorLocationProvider.ts` keeps Mock RTT as the default provider.
- `src/services/location/mockIndoorLocationProvider.ts` adapts the existing mock RTT pipeline to the provider contract.
