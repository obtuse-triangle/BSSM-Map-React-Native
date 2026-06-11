# BLE Motion Fusion — Data Flow and Extension Points

## Overview

The fusion engine combines two weak signals into one smoother indoor position:

- **BLE RSSI** provides a coarse anchor from nearby Aruba AP fixtures.
- **CoreMotion** provides continuity between BLE updates via step-based dead reckoning.

This matters because RSSI-only BLE is noisy and can drift; motion keeps the marker moving smoothly between anchors instead of jumping every scan.

---

## Data Flow

### Step 1: BLE observation buffer → WCL centroid → `FusionBleObservation`

1. BLE advertisements are accumulated in the observation buffer.
2. Weighted Centroid Localisation (WCL) reduces the buffer to one campus coordinate.
3. The store converts that result into a `FusionBleObservation`:
   - `lat`
   - `lng`
   - `confidence`
   - `floorKey`

That BLE observation becomes the anchor input for the particle filter.

### Step 2: CoreMotion `onMotionUpdate` → step delta → `FusionMotionEvent` → particle prediction

1. CoreMotion emits `onMotionUpdate` events.
2. The store computes the **step delta** from cumulative step count.
3. The delta is packed into `FusionMotionEvent`.
4. The particle filter predicts forward using:
   - heading
   - stride length
   - motion noise

This is what keeps the estimate moving between BLE anchors.

### Step 3: `campus-wgs84.json` polygon features → `inferZone()` → zone bonus/penalty

1. The current particle cloud is checked against `src/data/campus-wgs84.json` polygon features.
2. `inferZone()` classifies whether a point is inside a known campus zone.
3. Particle weights get a zone-based bonus or penalty.

This is a soft map constraint, not a hard snap-to-room rule.

### Step 4: `FusionState` → `CampusBleMarker` + `BleWclStatusCard`

1. The engine emits a `FusionState` snapshot.
2. `CampusBleMarker` uses it for the map position.
3. `BleWclStatusCard` uses it for telemetry such as confidence, accuracy, floor, and source.

---

## Floor-Agnostic Design

Floors are data-driven, not hardcoded.

- AP fixtures live in `src/constants/bleAccessPoints.ts`.
- Floor polygons live in `src/data/campus-wgs84.json`.

Adding AP fixtures for a new floor enables the same fusion algorithm without code changes, as long as that floor also has matching GeoJSON features.

Floors without AP data degrade to `unknown` confidence with reason `no_ap_fixtures_for_floor`.

This is intentional: the algorithm should scale by data, not by special-case floor logic.

---

## Verification Commands

- `npm test -- --runInBand` — all unit tests
- `npx tsx scripts/test-fusion-trace.ts --trace=src/data/traces/corridor-walk-floor3.json` — corridor replay
- `npx tsx scripts/test-fusion-trace.ts --trace=src/data/traces/room-entry-floor1.json` — room entry replay
- `node scripts/verify-ble-wcl.ts` — existing BLE WCL regression
- `npx tsc --noEmit` — type checking

---

## Limitations

RSSI-only BLE does **not** guarantee precise room-center accuracy. The fusion stack is designed to provide:

- smooth corridor movement
- stable floor-aware zone inference
- better continuity than BLE alone

It is **not** a sub-meter indoor positioning system.
