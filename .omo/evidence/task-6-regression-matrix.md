# Task 6 Regression Matrix

## Result

Integrated bottom-sheet-polish regression QA passed. No hardening or source-code fix was applied.

## Task Evidence

| Task | Commit | Evidence | Result |
| --- | --- | --- | --- |
| 1 | `1f667cf fix(sheet): add shared minimize signal` | `.omo/evidence/task-1-store-signal.log`, `.omo/evidence/task-1-store-signal-diff.txt` | PASS |
| 2 | `94d5c23 fix(sheet): prevent control taps from expanding map sheet` | `.omo/evidence/task-2-store-signal.log`, `.omo/evidence/task-2-settings-collapsed-and-medium.txt` | PASS |
| 3 | `f195770 fix(sheet): polish place detail header` | `.omo/evidence/task-3-detail-header-polish.txt` | PASS |
| 4 | `9822099 fix(sheet): stabilize search detail transition` | `.omo/evidence/task-4-search-to-detail.txt` | PASS |
| 5 | `53b8142 fix(map): minimize sheets on user drag` | `.omo/evidence/task-5-map-drag.txt` | PASS |

## Final Gates

| Command | Result | Evidence |
| --- | --- | --- |
| `npx tsc --noEmit` | PASS | `.omo/evidence/task-6-final-gates.log` |
| `npm test -- --runInBand` | PASS: 5 suites, 58 tests | `.omo/evidence/task-6-final-gates.log` |
| `npx expo export --platform android --output-dir /tmp/school-map-bottom-sheet-export` | PASS | `.omo/evidence/task-6-expo-export.log` |

Relevant final gate output:

```text
=== npx tsc --noEmit ===
npm warn Unknown project config "node-linker". This will stop working in the next major version of npm.

=== npm test -- --runInBand ===
PASS src/services/location/__tests__/particleFusionEngine.test.ts
PASS src/store/__tests__/mapStore.test.ts
PASS src/utils/__tests__/cameraTarget.test.ts
PASS src/services/location/__tests__/deadReckoning.test.ts
PASS src/services/location/__tests__/zoneInference.test.ts

Test Suites: 5 passed, 5 total
Tests:       58 passed, 58 total
Snapshots:   0 total
Ran all test suites.
```

Relevant Expo export output:

```text
Starting Metro Bundler
Android Bundled 3032ms index.ts (1352 modules)
Exported: /tmp/school-map-bottom-sheet-export
```

## Scope Guard

`git diff HEAD~5 -- src/components/map/PlaceDetailBottomSheet.tsx` produced empty output.

`git diff HEAD~5 -- package.json` produced empty output.

Combined implementation diff remains limited to the intended Task 1-5 files:

```text
src/components/map/CampusMap.tsx       |  62 ++++++--
src/screens/MapScreen.tsx              |   6 +-
src/screens/MapSheetScreen.tsx         | 278 ++++++++++++++++++++++-----------
src/screens/PlaceDetailSheetScreen.tsx |  49 ++++--
src/store/mapStore.ts                  |   5 +
5 files changed, 284 insertions(+), 116 deletions(-)
```

## Hardening Applied

None. All requested verification commands passed on the first run, and scope guard diffs were empty for the legacy bottom sheet and `package.json`.
