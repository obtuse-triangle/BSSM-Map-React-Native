# BLE WCL MVP — Aruba Weighted Centroid Localisation

## Overview

This document describes the BLE WCL (Weighted Centroid Localisation) MVP
feature. It is a **foreground-only**, **iOS-only** positioning path that
uses known Aruba/HPE BLE beacon coordinates in EPSG:5183 to compute a
WGS84 `[lng, lat]` estimate via RSSI-weighted centroid.

The BLE WCL path is **parallel to the legacy map-percent RTT pipeline**.
It does not modify or depend on it.

---

## Coordinate Systems

The app now has three distinct coordinate systems:

| System | CRS | Purpose | Consumer |
|---|---|---|---|
| **MapLibre (WGS84)** | EPSG:4326 | Production campus map (GeoJSON) | `CampusMap.tsx`, GPS marker, BLE WCL result |
| **Legacy RTT/SVG** | map-percent `x/y` | Old indoor SVG overlay, AP room centers | `NativeFloorMap.tsx`, `IndoorLocationProvider` |
| **BLE AP (TM)** | EPSG:5183 (Korean 2000 / Central Belt 2010) | Known AP coordinate survey data | `bleWeightedCentroid.ts` → `coordinateTransform.ts` |

The BLE WCL pipeline converts EPSG:5183 → EPSG:4326 via `proj4` for the
final centroid point. Map-percent coordinates are never used in this path.

---

## Pipeline

```
Native Swift BLE scan (CoreBluetooth, foreground)
       │  filters for HPE/Aruba manufacturer ID 0x011B
       ▼
ArubaBleObservation[] received in TypeScript bridge
       │  bleIdentifier derived as peripheralUUID + manufacturer data prefix
       ▼
BleObservationBuffer (rolling per-AP map, prunes stale >120s)
       │  O(1) insert, O(n) prune
       ▼
computeBleWeightedCentroid() — pure function
       │  1. Filter by floorKey, RSSI ≥ -90, age ≤ 120s, manufacturer 0x011B
       │  2. Reject if < 2 valid pairs → INSUFFICIENT_APS
       │  3. weight = 10^((rssi + 100) / 20) [× optional freshness factor]
       │  4. Weighted centroid in EPSG:5183
       │  5. Weighted standard deviation (accuracy estimate)
       │  6. transformEpsg5183ToWgs84() → [lng, lat]
       ▼
BleWclProvider.validateCoordinates()
       │  Rejects NaN/infinity and coordinates outside CAMPUS_BOUNDS
       ▼
bleLocationStore (Zustand)
       │  Updates own state; if confidence > 0, forwards to mapStore.userCoordinates
       ▼
BleWclStatusCard — debug UI in MapScreen
       │  Shows used AP count, confidence, accuracy, sample age, STALE badge
       ▼
MapLibre WGS84 marker (via mapStore.userCoordinates)
```

### Key Design Decisions

1. **Observation buffer is per-AP, not a window.** iOS CoreBluetooth
   delivery can stretch 5 s to over 1 min despite 1 s AP intervals. A
   sliding window would be misleading, so only the latest RSSI per AP is
   retained.

2. **Baseline RSSI weight is fixed.** The formula
   `Math.pow(10, (rssi + 100) / 20)` matches the user-provided spec.
   Any freshness multiplier is applied after this baseline, never before.

3. **Floor must be explicit.** The WCL algorithm does not infer floor from
   RSSI. The caller provides a `floorKey` and only APs/observations
   matching that floor are used.

---

## Configuration Constants

All magic numbers are centralized in `src/constants/bleConfig.ts`.

| Constant | Value | Effect |
|---|---|---|
| `MANUFACTURER_ID_ARUBA` | `0x011B` (283) | IEEE OUI for HPE/Aruba BLE beacons |
| `MIN_AP_COUNT` | `2` | Minimum APs needed for WCL; below this → `INSUFFICIENT_APS` |
| `RSSI_THRESHOLD_DBM` | `-90` | Observations below this dBm are rejected before count check |
| `STALE_THRESHOLD_MS` | `60 000` (60 s) | Observations older than this get a freshness penalty (if enabled) |
| `MAX_SAMPLE_AGE_MS` | `120 000` (120 s) | Observations older than this are discarded entirely |
| `DEFAULT_SCAN_DURATION_MS` | `10 000` (10 s) | Default BLE scan window |
| `MAX_SCAN_DURATION_MS` | `30 000` (30 s) | Upper bound on scan duration (battery protection) |
| `MIN_SCAN_DURATION_MS` | `1 000` (1 s) | Lower bound on scan duration |

Campus validation bounds (`src/constants/campusBounds.ts`):

| Bound | Value |
|---|---|
| `minLongitude` | 128.9027 |
| `maxLongitude` | 128.9042 |
| `minLatitude` | 35.1875 |
| `maxLatitude` | 35.1894 |

---

## Fixture Data Status

**BLE AP coordinate data is not yet available for production use.**

The file `src/constants/bleAccessPoints.ts` contains `BLE_AP_FIXTURES`,
an array of placeholder `BleAccessPoint5183` records. All fixture
`x5183`/`y5183` values are `0`, which means:

- `transformEpsg5183ToWgs84(0, 0)` produces a coordinate far outside
  the campus bounds.
- The campus-bounds guardrail in `bleWclProvider.ts` **rejects** these
  coordinates with an error.
- The BLE WCL path will not produce a valid map marker until real
  EPSG:5183 AP coordinates are provided.

### What Is Needed for Production

1. **EPSG:5183 coordinates** from school site-survey drawings or on-site
   GPS + Korean TM reverse-projection.
2. **BLE identity mapping** — the `bleIdentifier` field in
   `BleAccessPoint5183` is a placeholder. The real identity schema
   (MAC-based, iBeacon UUID+major+minor, or Eddystone-UID) must be
   confirmed from the Aruba WCL advertisement payload.
3. **Manufacturer ID verification** — confirm that deployed beacons use
   IEEE OUI `0x011B` (HPE/Aruba).

The `realBleAccessPointsByFloor` record in `bleAccessPoints.ts` is empty
and ready to be populated once these blockers are resolved.

---

## Stale Coordinate Behavior

The system uses two staleness thresholds:

1. **`MAX_SAMPLE_AGE_MS` (120 s)** — hard cutoff. Observations older
   than 120 s are removed from the buffer and never used for WCL.

2. **`STALE_THRESHOLD_MS` (60 s)** — freshness penalty. When
   `enableFreshnessWeighting` is enabled, observations between 60 s and
   120 s old receive a reduced weight multiplier (linear decay from
   1.0 to 0.5).

### UI Indication

The `BleWclStatusCard` component displays a **STALE** badge when the
freshest observation in the buffer exceeds 120 seconds (`STALE_THRESHOLD_MS`
in the component context is set to 120 s, matching the buffer pruninig
threshold). The card shows:

- Used AP count
- Confidence percentage (0–100%)
- Accuracy radius (±metres)
- Latest sample age (seconds ago)
- STALE warning text

When the WCL result is stale or has insufficient APs, `mapStore.userCoordinates`
is **not** updated, so the map does not show a misleading current-location
marker.

---

## Validation and Safety

### Coordinate Validation (bleWclProvider)

Every WGS84 coordinate produced by the WCL algorithm passes through
`BleWclProvider.validateCoordinates()`:

- **Finite check**: Rejects `NaN`, `Infinity`, `-Infinity`.
- **Campus bounds check**: Rejects coordinates outside
  `CAMPUS_BOUNDS` (about 128.9027–128.9042°E, 35.1875–35.1894°N).

### Algorithm Guardrails (bleWeightedCentroid)

- Minimum AP count: defaults to 2.
- RSSI threshold: rejects samples below −90 dBm.
- Maximum sample age: rejects samples older than 120 s.
- Floor key matching: only observations/APs on the same floor are paired.

---

## Known Limitations

### iOS Only

The native BLE scanning module (`modules/ios-ble-positioning/`) is Swift
and Objective-C only. There is no Android BLE scanning implementation.
The provider returns a `Platform.OS` error on non-iOS devices.

### Foreground Only

CoreBluetooth scanning only runs while the app is in the foreground.
iOS does not deliver BLE advertisement data reliably in the background
without special entitlement (`bluetooth-central` background mode) and
even then delivery is intermittent and throttled. The MVP makes no
promise of background positioning.

### Delayed BLE Delivery

The Aruba beacon advertises at a 1 s interval, but iOS CoreBluetooth
delivery to the app can take 5 s to over 1 minute. This is an OS-level
constraint, not configurable in app code. The UI copy reflects this:
"iOS 지연 가능" (iOS delays possible).

### No RSSI Fingerprinting

The MVP uses a weighted centroid of known AP coordinates. It does **not**
perform radio-map fingerprinting, site survey, or machine learning
positioning.

### No GPS Indoor Ground Truth

GPS is not used as indoor ground truth for this MVP. The campus bounds
validation is a sanity check, not a location correction.

### No 1–3 m Accuracy Guarantee

The `accuracyMeters` field reports the weighted standard deviation of
AP distances from the centroid. This is a geometric precision metric,
not a guarantee of absolute positioning accuracy. Actual accuracy
depends on AP density, RSSI noise, and iOS delivery latency.

### No iBeacon Support

The scanner filters for HPE/Aruba manufacturer ID `0x011B` only.
iBeacon advertisements (Apple's proximity format) are not processed.

### No Background BLE

See "Foreground Only" above. The app does not request
`bluetooth-central` background mode entitlement.

---

## Verification

19/19 verification tests pass via:

```
npx tsx scripts/verify-ble-wcl.ts
```

Coverage areas:
1. Centroid calculation (equal-RSSI → arithmetic mean)
2. RSSI weighting (strong AP pulls centroid)
3. Minimum AP count (fewer than 2 APs → INSUFFICIENT_APS)
4. RSSI threshold (< −90 → rejected before minimum count check)
5. Sample age/staleness (> 120 s → INSUFFICIENT_APS)
6. Coordinate transform (EPSG:5183 → WGS84)

---

## File Map

| File | Role |
|---|---|
| `src/types/bleAccessPoint.ts` | `BleAccessPoint5183` interface |
| `src/constants/bleAccessPoints.ts` | `BLE_AP_FIXTURES` + `realBleAccessPointsByFloor` |
| `src/constants/bleConfig.ts` | Configuration constants |
| `src/constants/campusBounds.ts` | Campus WGS84 bounds |
| `src/utils/coordinateTransform.ts` | EPSG:5183 → WGS84 transform |
| `src/services/location/bleWeightedCentroid.ts` | Pure WCL algorithm |
| `src/services/location/bleObservations.ts` | `BleObservationBuffer` + `BleApObservation` |
| `src/services/location/bleWclProvider.ts` | Provider orchestrator |
| `src/store/bleLocationStore.ts` | Zustand store |
| `src/components/map/BleWclStatusCard.tsx` | Debug UI card |
| `modules/ios-ble-positioning/src/index.ts` | Native bridge types |
| `scripts/verify-ble-wcl.ts` | Verification script |
