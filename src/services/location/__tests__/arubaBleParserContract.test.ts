import { parseArubaManufacturerDataForTests } from '../arubaBleParser';

/* ------------------------------------------------------------------ */
/*  Task 1 – BLE scanner contract & parser parity tests               */
/* ------------------------------------------------------------------ */

describe('parseArubaManufacturerDataForTests', () => {
  // ── Test 1: Valid Aruba payload ────────────────────────────────────
  it('extracts BLE MAC from valid Aruba manufacturer data', () => {
    const bytes = [0x1b, 0x01, 0x00, 0x50, 0x00, 0xe9, 0x03, 0x4c, 0x20];
    const result = parseArubaManufacturerDataForTests(
      'peripheral-addr',
      0x011b, // 283
      bytes,
      1_000_000,
      -75,
    );

    expect(result).not.toBeNull();

    // bytes [3..8] = [0x50,0x00,0xe9,0x03,0x4c,0x20] reversed
    //             → [0x20,0x4c,0x03,0xe9,0x00,0x50]
    //             → "20:4c:03:e9:00:50"
    expect(result!.bleIdentifier).toBe('20:4c:03:e9:00:50');
  });

  // ── Test 2: Non-Aruba skip ─────────────────────────────────────────
  it('returns null for non-Aruba manufacturer id', () => {
    const bytes = [0x00, 0x00, 0x00, 0x50, 0x00, 0xe9, 0x03, 0x4c, 0x20];
    const result = parseArubaManufacturerDataForTests(
      'peripheral-addr',
      0xffff, // not 0x011B
      bytes,
      1_000_000,
      -75,
    );

    expect(result).toBeNull();
  });

  // ── Test 3: Too-short fallback ─────────────────────────────────────
  it('falls back to deviceAddress + payload prefix when bytes.length < 9', () => {
    const bytes = [0x1b, 0x01, 0xaa, 0xbb, 0xcc]; // length 5 < 9
    const result = parseArubaManufacturerDataForTests(
      'DEVICE-001',
      0x011b,
      bytes,
      1_000_000,
      -60,
    );

    expect(result).not.toBeNull();
    // payloadHex = "1b01aabbcc" → prefix(8) = "1b01aabb"
    expect(result!.bleIdentifier).toBe('DEVICE-001_1b01aabb');
  });

  // ── Test 4: Lowercase hex ──────────────────────────────────────────
  it('produces lowercase payloadHex and bleIdentifier', () => {
    // Bytes that would produce uppercase letters if we used .toUpperCase()
    const bytes = [0x1b, 0x01, 0x00, 0xad, 0xbe, 0xef, 0xca, 0xfe, 0x00];
    const result = parseArubaManufacturerDataForTests(
      'p',
      0x011b,
      bytes,
      42,
      -80,
    );

    expect(result).not.toBeNull();

    // All hex chars should be lowercase
    expect(result!.payloadHex).toMatch(/^[0-9a-f]+$/);
    expect(result!.bleIdentifier).toMatch(/^[0-9a-f:]+$/);

    // payloadHex should equal the lowercase hex string
    expect(result!.payloadHex).toBe('1b0100adbeefcafe00');

    // bytes[3..8] = [0xad,0xbe,0xef,0xca,0xfe,0x00]
    // reversed    = [0x00,0xfe,0xca,0xef,0xbe,0xad]
    // formatted   = "00:fe:ca:ef:be:ad"
    expect(result!.bleIdentifier).toBe('00:fe:ca:ef:be:ad');
  });

  // ── Test 5: observedAt passthrough ─────────────────────────────────
  it('preserves the observedAt value it received', () => {
    const bytes = [0x1b, 0x01, 0x00, 0x50, 0x00, 0xe9, 0x03, 0x4c, 0x20];
    const observedAt = 1_234_567_890_123;
    const result = parseArubaManufacturerDataForTests(
      'addr',
      0x011b,
      bytes,
      observedAt,
      -65,
    );

    expect(result).not.toBeNull();
    expect(result!.observedAt).toBe(observedAt);
  });

  // ── Test 6: manufacturerId field (0x011B = 283 decimal) ────────────
  it('returns manufacturerId = 283 (0x011B) for valid Aruba payloads', () => {
    const bytes = [0x1b, 0x01, 0x00, 0x50, 0x00, 0xe9, 0x03, 0x4c, 0x20];
    const result = parseArubaManufacturerDataForTests(
      'addr',
      0x011b,
      bytes,
      0,
      -70,
    );

    expect(result).not.toBeNull();
    expect(result!.manufacturerId).toBe(283); // 0x011B decimal
  });

  // ── Test 7: rssi passthrough ───────────────────────────────────────
  it('preserves the rssi value it received', () => {
    const bytes = [0x1b, 0x01, 0x00, 0x50, 0x00, 0xe9, 0x03, 0x4c, 0x20];
    const rssi = -89;
    const result = parseArubaManufacturerDataForTests(
      'addr',
      0x011b,
      bytes,
      500,
      rssi,
    );

    expect(result).not.toBeNull();
    expect(result!.rssi).toBe(rssi);
  });

  // ── Test 8: exact keys ─────────────────────────────────────────────
  it('returns an object with exactly the expected keys', () => {
    const bytes = [0x1b, 0x01, 0x00, 0x50, 0x00, 0xe9, 0x03, 0x4c, 0x20];
    const result = parseArubaManufacturerDataForTests(
      'addr',
      0x011b,
      bytes,
      0,
      -55,
    );

    expect(result).not.toBeNull();
    expect(Object.keys(result!).sort()).toEqual([
      'bleIdentifier',
      'manufacturerId',
      'observedAt',
      'payloadHex',
      'rssi',
    ]);
  });
});
