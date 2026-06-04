import { DeadReckoningEngine, MAX_DR_STEPS_WITHOUT_BLE, STRIDE_LENGTH_M } from '../deadReckoning';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Earth radius in metres (must match the production constant).
 */
const R = 6_371_000;

/**
 * Expected lat displacement (in degrees) for one north‑ward step.
 */
function expectedLatOffset(d: number): number {
  return (d * Math.cos(0)) / R * (180 / Math.PI);
}

// ────────────────────────────────────────────────────────────────────────────
// Suite
// ────────────────────────────────────────────────────────────────────────────

describe('DeadReckoningEngine', () => {
  describe('reset() / getPosition()', () => {
    it('returns the anchor position immediately after reset', () => {
      const dr = new DeadReckoningEngine();
      dr.reset(37.5665, 126.978); // Seoul City Hall (approximate)

      const pos = dr.getPosition();
      expect(pos.lat).toBe(37.5665);
      expect(pos.lng).toBe(126.978);
      expect(pos.stepsSinceLastBle).toBe(0);
      expect(pos.confidence).toBe(1);
    });

    it('resets confidence and step counter when called again', () => {
      const dr = new DeadReckoningEngine();
      dr.reset(0, 0);

      // Take a few steps to degrade confidence
      dr.updateStep(45);
      dr.updateStep(90);
      dr.updateStep(180);

      expect(dr.getPosition().stepsSinceLastBle).toBeGreaterThan(0);
      expect(dr.getPosition().confidence).toBeLessThan(1);

      // Reset
      dr.reset(10, 20);
      const pos = dr.getPosition();
      expect(pos.lat).toBe(10);
      expect(pos.lng).toBe(20);
      expect(pos.stepsSinceLastBle).toBe(0);
      expect(pos.confidence).toBe(1);
    });
  });

  describe('updateStep() — heading displacement', () => {
    it('increases latitude when heading north (0°)', () => {
      const dr = new DeadReckoningEngine();
      // Equator — cos(0) = 1 so longitude displacement is well-behaved
      dr.reset(0, 0);

      dr.updateStep(0); // north

      const pos = dr.getPosition();
      expect(pos.lat).toBeGreaterThan(0);
      expect(pos.lng).toBe(0); // no longitude change

      // Exact magnitude check
      const expectedLat = expectedLatOffset(STRIDE_LENGTH_M);
      expect(pos.lat).toBeCloseTo(expectedLat, 10);
    });

    it('increases longitude when heading east (90°)', () => {
      const dr = new DeadReckoningEngine();
      dr.reset(0, 0); // equator → cos(0) = 1

      dr.updateStep(90); // east

      const pos = dr.getPosition();
      expect(pos.lat).toBe(0); // no latitude change
      expect(pos.lng).toBeGreaterThan(0);

      // δlng = d × sin(90°) / (R × cos(0°))  = d / R
      const expectedLng = STRIDE_LENGTH_M / R * (180 / Math.PI);
      expect(pos.lng).toBeCloseTo(expectedLng, 10);
    });

    it('decreases latitude when heading south (180°)', () => {
      const dr = new DeadReckoningEngine();
      dr.reset(0, 0);

      dr.updateStep(180); // south

      const pos = dr.getPosition();
      expect(pos.lat).toBeLessThan(0);
      expect(pos.lng).toBe(0);
    });

    it('decreases longitude when heading west (270°)', () => {
      const dr = new DeadReckoningEngine();
      dr.reset(0, 0);

      dr.updateStep(270); // west

      const pos = dr.getPosition();
      expect(pos.lat).toBe(0);
      expect(pos.lng).toBeLessThan(0);
    });

    it('scales displacement with custom stride length', () => {
      const dr = new DeadReckoningEngine();
      dr.reset(0, 0);

      const customStride = 1.0; // 1 metre
      dr.updateStep(0, customStride);

      const posDefault = new DeadReckoningEngine();
      posDefault.reset(0, 0);
      posDefault.updateStep(0); // default 0.65 m

      // Ratio of displacements should match ratio of stride lengths
      const ratio = posDefault.getPosition().lat / customStride;
      expect(ratio).toBeCloseTo(0.65, 2);
    });
  });

  describe('confidence decay', () => {
    it('starts at 1.0 after reset', () => {
      const dr = new DeadReckoningEngine();
      dr.reset(0, 0);
      expect(dr.getPosition().confidence).toBe(1);
    });

    it('decays linearly with each step', () => {
      const dr = new DeadReckoningEngine();
      dr.reset(0, 0);

      const stepCount = 10;
      for (let i = 0; i < stepCount; i++) {
        dr.updateStep(0);
      }

      const expectedConfidence = 1 - stepCount / MAX_DR_STEPS_WITHOUT_BLE;
      expect(dr.getPosition().confidence).toBeCloseTo(expectedConfidence, 10);
    });

    it('reaches ~0 after MAX_DR_STEPS_WITHOUT_BLE steps', () => {
      const dr = new DeadReckoningEngine();
      dr.reset(0, 0);

      for (let i = 0; i < MAX_DR_STEPS_WITHOUT_BLE; i++) {
        dr.updateStep(0);
      }

      expect(dr.getPosition().confidence).toBe(0);
    });

    it('stays at 0 beyond MAX_DR_STEPS_WITHOUT_BLE', () => {
      const dr = new DeadReckoningEngine();
      dr.reset(0, 0);

      for (let i = 0; i < MAX_DR_STEPS_WITHOUT_BLE + 10; i++) {
        dr.updateStep(0);
      }

      expect(dr.getPosition().confidence).toBe(0);
    });

    it('reset restores confidence to 1.0 after decay', () => {
      const dr = new DeadReckoningEngine();
      dr.reset(0, 0);

      for (let i = 0; i < 20; i++) {
        dr.updateStep(0);
      }
      expect(dr.getPosition().confidence).toBeLessThan(1);

      dr.reset(5, 5);
      expect(dr.getPosition().confidence).toBe(1);
    });
  });

  describe('cumulativeErrorMeters', () => {
    it('is 0 immediately after reset', () => {
      const dr = new DeadReckoningEngine();
      dr.reset(0, 0);
      expect(dr.cumulativeErrorMeters).toBe(0);
    });

    it('grows linearly with steps', () => {
      const dr = new DeadReckoningEngine();
      dr.reset(0, 0);

      dr.updateStep(0);
      dr.updateStep(0);
      dr.updateStep(0);

      // 3 steps × 0.65 m × 0.1 = 0.195
      expect(dr.cumulativeErrorMeters).toBeCloseTo(0.195, 10);
    });

    it('resets to 0 after a second reset', () => {
      const dr = new DeadReckoningEngine();
      dr.reset(0, 0);
      dr.updateStep(0);
      dr.updateStep(0);
      expect(dr.cumulativeErrorMeters).toBeGreaterThan(0);

      dr.reset(1, 1);
      expect(dr.cumulativeErrorMeters).toBe(0);
    });
  });

  describe('stepsSinceLastBle counter', () => {
    it('increments on each updateStep', () => {
      const dr = new DeadReckoningEngine();
      dr.reset(0, 0);

      expect(dr.getPosition().stepsSinceLastBle).toBe(0);

      dr.updateStep(0);
      expect(dr.getPosition().stepsSinceLastBle).toBe(1);

      dr.updateStep(0);
      expect(dr.getPosition().stepsSinceLastBle).toBe(2);
    });

    it('resets to 0 on reset()', () => {
      const dr = new DeadReckoningEngine();
      dr.reset(0, 0);
      dr.updateStep(0);
      dr.updateStep(0);
      dr.updateStep(0);
      expect(dr.getPosition().stepsSinceLastBle).toBe(3);

      dr.reset(10, 10);
      expect(dr.getPosition().stepsSinceLastBle).toBe(0);
    });
  });

  describe('multiple steps retrace', () => {
    it('returns approximately to origin after north→south', () => {
      const dr = new DeadReckoningEngine();
      const startLat = 37.5665;
      const startLng = 126.978;
      dr.reset(startLat, startLng);

      dr.updateStep(0); // north
      dr.updateStep(180); // south

      const pos = dr.getPosition();
      // After north then south, should be close to start
      expect(pos.lat).toBeCloseTo(startLat, 6);
      expect(pos.lng).toBe(startLng);
    });
  });
});
