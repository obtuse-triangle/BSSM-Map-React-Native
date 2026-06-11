# BLE Fusion Field QA Protocol (iPhone)

## Scope

This protocol defines repeatable **field QA** for the iPhone BLE fusion path.

- **iOS foreground-only**: no background tracking guarantees.
- Evidence must be captured from the **BleWclStatusCard** `융합 상태` section.
- Each run must save three artifacts under `.omo/evidence/`:
  - status-card screenshot (`.png`)
  - console log excerpt (`.log`)
  - final trace summary (`.json`)

### Reference thresholds from fusion config

- `FUSION_LOW_CONFIDENCE = 0.35`
- `FUSION_HIGH_CONFIDENCE = 0.7`
- `FUSION_UNKNOWN_AFTER_STEPS = 45`
- `FUSION_ACCURACY_MIN_M = 3`
- `FUSION_ACCURACY_MAX_M = 45`

## Evidence capture rules

1. Open the app on iPhone and keep it in the foreground.
2. Capture the `BleWclStatusCard` **`융합 상태`** section in the screenshot.
3. Save the console log excerpt for the run window only.
4. Save the final trace summary JSON after the run completes.
5. Name artifacts exactly as listed below.

## 1) Corridor Walk (20m)

**Setup**
- Start BLE scan.
- Stand at the corridor start point.
- Ensure the device remains foregrounded.

**Execution**
- Walk a 20m corridor at normal pace.
- Continue until the fused marker has traversed the full path.

**Pass / fail thresholds**
- Marker motion must be continuous.
- No marker jump may exceed **10m**.
- Confidence must reach at least **`medium`** within **20s**.

**Expected result**
- Pass if all thresholds are met.

**Evidence**
- `.omo/evidence/field-qa-corridor-walk.png`
- `.omo/evidence/field-qa-corridor-walk.log`
- `.omo/evidence/field-qa-corridor-walk.json`

## 2) Stationary Hold (30s)

**Setup**
- Start BLE scan.
- Stand still at the test point.
- Keep the phone foregrounded for the entire run.

**Execution**
- Remain stationary for **30s**.

**Pass / fail thresholds**
- Fused position drift must stay **<= 5m**.
- Confidence must not oscillate by more than **one level**.
  - Allowed: `medium → low → medium`
  - Not allowed: `medium → low → unknown → medium`

**Expected result**
- Pass if drift stays within 5m and confidence transitions stay within one-level oscillation.

**Evidence**
- `.omo/evidence/field-qa-stationary.png`
- `.omo/evidence/field-qa-stationary.log`
- `.omo/evidence/field-qa-stationary.json`

## 3) Turn-Around Retrace

**Setup**
- Start BLE scan.
- Mark the start point.
- Keep the device foregrounded.

**Execution**
- Walk **10m** away from the start.
- Turn around.
- Walk back to the start point.

**Pass / fail thresholds**
- Final marker must be within **6m** of the start position.

**Expected result**
- Pass if the final fused marker is within 6m of the start point.

**Evidence**
- `.omo/evidence/field-qa-retrace.png`
- `.omo/evidence/field-qa-retrace.log`
- `.omo/evidence/field-qa-retrace.json`

## 4) Classroom Entry

**Setup**
- Start BLE scan.
- Stand immediately outside the target classroom entrance.
- Keep the app foregrounded.

**Execution**
- Enter the classroom.
- Continue observing the inferred zone for at least **20s** after entry.

**Pass / fail thresholds**
- Inferred zone must become the **target classroom** or an **immediate neighboring room** within **10s** of entry.
- Zone must not flip more than **once** in any **20s** window.

**Expected result**
- Pass if the inferred zone settles into the target classroom or adjacent room within 10s and remains stable enough to avoid more than one flip in 20s.

**Evidence**
- `.omo/evidence/field-qa-classroom.png`
- `.omo/evidence/field-qa-classroom.log`
- `.omo/evidence/field-qa-classroom.json`

## 5) BLE Dropout Recovery

**Setup**
- Start BLE scan.
- Position yourself where BLE can be intentionally blocked or weakened.
- Keep the app foregrounded.

**Execution**
- Force a BLE dropout.
- Restore fresh BLE exposure after dropout begins.

**Pass / fail thresholds**
- During dropout, confidence must change to **`low`** or **`unknown`**.
- After fresh BLE resumes, confidence must recover to at least **`medium`** within **30s**.

**Expected result**
- Pass if dropout visibly lowers confidence and recovery reaches medium within 30s.

**Evidence**
- `.omo/evidence/field-qa-dropout.png`
- `.omo/evidence/field-qa-dropout.log`
- `.omo/evidence/field-qa-dropout.json`

## Notes

- This protocol does **not** assume deterministic field behavior.
- All pass/fail criteria are numeric or categorical thresholds.
- Screenshots must include the `BleWclStatusCard` **`융합 상태`** section so the source, confidence/level, particle count, accuracy, inferred zone, and unavailable reason are visible.
