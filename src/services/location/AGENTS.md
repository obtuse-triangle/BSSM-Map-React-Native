# src/services/location — KNOWLEDGE BASE

**Generated:** 2026-06-25T00:00:00Z

## OVERVIEW
Indoor positioning services. BLE WCL for iOS (foreground), dead reckoning, particle fusion. Production outputs WGS84 coordinates from EPSG:5183 AP survey data via proj4.

## STRUCTURE
```text
src/services/location/
├── bleWclProvider.ts             # iOS BLE WCL singleton — provider API (call start/stop)
├── bleWeightedCentroid.ts        # RSSI → WGS84 centroid ⚠ DO NOT MODIFY baseline formula
├── particleFusionEngine.ts       # Particle filter fuses BLE + DR
├── bleObservations.ts            # Observation buffer + aging
├── deadReckoning.ts              # Step + heading dead reckoning
├── bleScannerAdapter.ts          # Abstraction over native BLE scanners
├── arubaBleParser.ts             # Aruba/HPE manufacturer data parser
├── bleScannerTypes.ts            # BLE scanner types
├── zoneInference.ts              # Map-percent zone inference
└── __tests__/                    # Unit tests (5 files)
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Start BLE scan | `bleWclProvider.start()` — singleton, iOS foreground only |
| Compute position | `bleWeightedCentroid.compute(...)` — RSSI-weighted centroid |
| Fuse BLE + DR | `new ParticleFusionEngine(...).update(...)` |
| DR step | `new DeadReckoningEngine(...).update(...)` |
| Buffer observations | `new BleObservationBuffer()` then `.add(...)` |
| Parse Aruba manuf | `arubaBleParser.parsePayload(...)` (manuf ID `0x011B`) |
| Zone inference | `zoneInference.inferZone(position, bssmFloorMap)` |
| Tests | `__tests__/` (`arubaBleParserContract`, `bleScannerAdapter`, `deadReckoning`, `particleFusionEngine`, `zoneInference`) |

## CONVENTIONS

- **Production output is WGS84 only.** `bleWclProvider` → `bleWeightedCentroid` → `bleObservations` → `particleFusionEngine`. `proj4` transforms EPSG:5183 AP survey data to WGS84.
- **EPSG:5183 source data**: `bleAccessPoints` carries beacon positions in Korean TM; proj4 transforms to WGS84 for display.
- **Constants**: `bleConfig.ts` (RSSI thresholds, decay tau, manufacturer ID), `fusionConfig.ts` (particle filter).
- **Buffer aging**: `BleObservationBuffer` enforces stale/sample-age thresholds.
- **No background BLE**: iOS foreground only. Android 측위는 현재 production에 없음 (modules/android-wifi-rtt는 native module로 보존).

## ANTI-PATTERNS (THIS PROJECT)

1. **NEVER modify the baseline RSSI weight formula** in `bleWeightedCentroid.ts` — calibration baseline.
2. **NEVER treat BLE WCL as background or Android-capable.** It is **foreground-only, iOS-only**.

## UNIQUE STYLES

- Particle filter uses 300 particles with motion noise, heading noise, and decay tau tuning.
- DR engine uses step/heading updates and confidence decay after prolonged BLE silence.
- Aruba parser extracts BLE MAC from manufacturer data bytes and formats lowercase colon-separated hex.
- iOS BLE delivery can lag 5s to 1+ min even with 1s AP advertising interval.

## COMMANDS

```bash
# BLE WCL regression
npx tsx scripts/verify-ble-wcl.ts

# Tests
npm test -- src/services/location
npm test -- src/services/location/__tests__/particleFusionEngine.test.ts
```

## NOTES

- `bleWclProvider` is a singleton; do not instantiate twice.
- `BleObservationBuffer`, `ParticleFusionEngine`, `DeadReckoningEngine` are class-based.
- The WCL pipeline is wired by `bleLocationStore.ts`.
- See `docs/ble-wcl-mvp.md`, `docs/ble-motion-fusion.md`, `docs/ble-fusion-field-qa.md` for QA flow.
- See `src/constants/bleConfig.ts` for tuning constants.
