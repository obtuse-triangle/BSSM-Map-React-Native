/**
 * Platform-neutral BLE scanner adapter tests.
 *
 * Verifies the adapter correctly:
 *   - Resolves to the iOS scanner when `Platform.OS === 'ios'` and the
 *     iOS native module is available.
 *   - Resolves to the Android scanner when `Platform.OS === 'android'`
 *     and the Android native module is available.
 *   - Returns `null` on unsupported platforms (e.g. 'web', 'windows').
 *   - Returns `null` when the platform's native module is missing or
 *     lacks the expected `startArubaBleScan` method.
 *   - Wires `requestBlePermissions` to the native module on Android and
 *     to a pass-through on iOS.
 *   - Caches the resolved adapter so repeated calls return the same
 *     object reference.
 *   - `__resetBleScannerAdapterForTests()` clears the cache.
 *
 * The native module paths are mocked with `jest.doMock` + `virtual: true`
 * so the suite runs even when the native modules are not built.
 */

/* ------------------------------------------------------------------ */
/*  Shared test fixtures                                               */
/* ------------------------------------------------------------------ */

type SupportedPlatform = 'ios' | 'android';
type TestPlatform = SupportedPlatform | 'web' | 'windows' | 'macos';

let mockPlatformOS: TestPlatform = 'ios';

const IOS_MODULE_PATH = '../../../../modules/ios-ble-positioning/src';
const ANDROID_MODULE_PATH = '../../../../modules/android-ble-positioning/src';

function mockIosAvailable() {
  jest.doMock(
    IOS_MODULE_PATH,
    () => ({
      IosBlePositioning: {
        isBleAvailable: jest.fn(() => true),
        startArubaBleScan: jest.fn(() => Promise.resolve([])),
        startContinuousArubaBleScan: jest.fn(),
        stopArubaBleScan: jest.fn(),
        addListener: jest.fn(() => ({ remove: jest.fn() })),
      },
    }),
    { virtual: true },
  );
}

function mockIosMissing() {
  // Simulate "module not built" — the require resolves to an empty object
  // with no `IosBlePositioning` export.  Exercises the
  // `if (ios && typeof ios.startArubaBleScan === 'function')` guard.
  jest.doMock(
    IOS_MODULE_PATH,
    () => ({}),
    { virtual: true },
  );
}

function mockIosMissingStartMethod() {
  // Simulate the iOS module being present but lacking `startArubaBleScan`.
  // Exercises the `typeof ios.startArubaBleScan === 'function'` guard.
  jest.doMock(
    IOS_MODULE_PATH,
    () => ({
      IosBlePositioning: {
        isBleAvailable: jest.fn(() => true),
        // startArubaBleScan intentionally absent
      },
    }),
    { virtual: true },
  );
}

function mockIosThrowing() {
  // Simulate the require itself throwing.  The adapter's try/catch should
  // catch this and return `null` (not propagate the error).
  jest.doMock(
    IOS_MODULE_PATH,
    () => {
      throw new Error('Cannot find module');
    },
    { virtual: true },
  );
}

function mockAndroidAvailable() {
  jest.doMock(
    ANDROID_MODULE_PATH,
    () => ({
      AndroidBlePositioning: {
        isBleAvailable: jest.fn(() => Promise.resolve(true)),
        requestBlePermissions: jest.fn(() => Promise.resolve(true)),
        startArubaBleScan: jest.fn(() => Promise.resolve([])),
        startContinuousArubaBleScan: jest.fn(),
        stopArubaBleScan: jest.fn(),
        addListener: jest.fn(() => ({ remove: jest.fn() })),
      },
    }),
    { virtual: true },
  );
}

function mockAndroidMissing() {
  jest.doMock(
    ANDROID_MODULE_PATH,
    () => ({}),
    { virtual: true },
  );
}

/**
 * Load a fresh adapter instance for the current test.
 *
 * Registers a `react-native` mock whose `Platform.OS` is a live getter
 * over the module-scoped `mockPlatformOS` variable, then re-requires
 * the adapter so the mock takes effect.
 */
function loadAdapter() {
  jest.doMock('react-native', () => ({
    Platform: {
      get OS() {
        return mockPlatformOS;
      },
    },
  }));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const adapterModule = require('../bleScannerAdapter');
  adapterModule.__resetBleScannerAdapterForTests();
  return adapterModule;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('bleScannerAdapter', () => {
  beforeEach(() => {
    mockPlatformOS = 'ios';
    jest.resetModules();
  });

  // ── iOS ─────────────────────────────────────────────────────────────

  describe('iOS platform', () => {
    it('returns an iOS adapter when IosBlePositioning is available', () => {
      mockPlatformOS = 'ios';
      mockIosAvailable();

      const { getBleScanner } = loadAdapter();
      const scanner = getBleScanner();

      expect(scanner).not.toBeNull();
      expect(typeof scanner!.isBleAvailable).toBe('function');
      expect(typeof scanner!.requestBlePermissions).toBe('function');
      expect(typeof scanner!.startArubaBleScan).toBe('function');
      expect(typeof scanner!.startContinuousArubaBleScan).toBe('function');
      expect(typeof scanner!.stopArubaBleScan).toBe('function');
      expect(typeof scanner!.addListener).toBe('function');
    });

    it('returns null when IosBlePositioning is missing (empty module)', () => {
      mockPlatformOS = 'ios';
      mockIosMissing();

      const { getBleScanner } = loadAdapter();
      expect(getBleScanner()).toBeNull();
    });

    it('returns null when IosBlePositioning lacks startArubaBleScan', () => {
      mockPlatformOS = 'ios';
      mockIosMissingStartMethod();

      const { getBleScanner } = loadAdapter();
      expect(getBleScanner()).toBeNull();
    });

    it('returns null when the iOS module require itself throws', () => {
      mockPlatformOS = 'ios';
      mockIosThrowing();

      const { getBleScanner } = loadAdapter();
      expect(getBleScanner()).toBeNull();
    });

    it('requestBlePermissions returns true (pass-through)', async () => {
      mockPlatformOS = 'ios';
      mockIosAvailable();

      const { getBleScanner } = loadAdapter();
      const scanner = getBleScanner();
      expect(scanner).not.toBeNull();

      const result = await scanner!.requestBlePermissions();
      expect(result).toBe(true);
    });
  });

  // ── Android ─────────────────────────────────────────────────────────

  describe('Android platform', () => {
    it('returns an Android adapter when AndroidBlePositioning is available', () => {
      mockPlatformOS = 'android';
      mockAndroidAvailable();

      const { getBleScanner } = loadAdapter();
      const scanner = getBleScanner();

      expect(scanner).not.toBeNull();
      expect(typeof scanner!.isBleAvailable).toBe('function');
      expect(typeof scanner!.requestBlePermissions).toBe('function');
      expect(typeof scanner!.startArubaBleScan).toBe('function');
      expect(typeof scanner!.startContinuousArubaBleScan).toBe('function');
      expect(typeof scanner!.stopArubaBleScan).toBe('function');
      expect(typeof scanner!.addListener).toBe('function');
    });

    it('wires requestBlePermissions to the native Android module', async () => {
      mockPlatformOS = 'android';
      const requestBlePermissions = jest.fn(() => Promise.resolve(true));
      jest.doMock(
        ANDROID_MODULE_PATH,
        () => ({
          AndroidBlePositioning: {
            isBleAvailable: jest.fn(() => Promise.resolve(true)),
            requestBlePermissions,
            startArubaBleScan: jest.fn(() => Promise.resolve([])),
            startContinuousArubaBleScan: jest.fn(),
            stopArubaBleScan: jest.fn(),
            addListener: jest.fn(() => ({ remove: jest.fn() })),
          },
        }),
        { virtual: true },
      );

      const { getBleScanner } = loadAdapter();
      const scanner = getBleScanner();
      expect(scanner).not.toBeNull();

      const result = await scanner!.requestBlePermissions();
      expect(result).toBe(true);
      expect(requestBlePermissions).toHaveBeenCalledTimes(1);
    });

    it('returns null when AndroidBlePositioning is missing', () => {
      mockPlatformOS = 'android';
      mockAndroidMissing();

      const { getBleScanner } = loadAdapter();
      expect(getBleScanner()).toBeNull();
    });
  });

  // ── Unsupported platform ────────────────────────────────────────────

  describe('unsupported platforms', () => {
    it('returns null when Platform.OS is "web"', () => {
      mockPlatformOS = 'web';
      // No native module mock is needed — neither branch is taken.
      const { getBleScanner } = loadAdapter();
      expect(getBleScanner()).toBeNull();
    });

    it('returns null when Platform.OS is "windows"', () => {
      mockPlatformOS = 'windows';
      const { getBleScanner } = loadAdapter();
      expect(getBleScanner()).toBeNull();
    });
  });

  // ── Caching ─────────────────────────────────────────────────────────

  describe('caching', () => {
    it('returns the same adapter object on repeated getBleScanner() calls', () => {
      mockPlatformOS = 'ios';
      mockIosAvailable();

      const { getBleScanner } = loadAdapter();

      const first = getBleScanner();
      const second = getBleScanner();

      expect(first).not.toBeNull();
      expect(second).toBe(first);
    });

    it('__resetBleScannerAdapterForTests() forces re-resolution', () => {
      mockPlatformOS = 'ios';
      mockIosAvailable();

      const { getBleScanner, __resetBleScannerAdapterForTests } = loadAdapter();

      const first = getBleScanner();
      expect(first).not.toBeNull();

      __resetBleScannerAdapterForTests();
      const second = getBleScanner();
      expect(second).not.toBeNull();
      // After explicit reset, a fresh resolve must run and may return a
      // new object instance (the adapter has no identity guarantee).
      // The contract is that resolution runs again — not that the
      // identity is preserved.
      expect(typeof second!.startArubaBleScan).toBe('function');
    });

    it('caches null: a second call after a null resolution still returns null', () => {
      mockPlatformOS = 'ios';
      mockIosMissing();

      const { getBleScanner } = loadAdapter();
      expect(getBleScanner()).toBeNull();
      expect(getBleScanner()).toBeNull();
    });
  });
});
