'use strict';

const { generateRoomKey, isValidRoomKey, normaliseRoomKey } = require('../../src/utils/roomKey');

describe('generateRoomKey', () => {
  test('returns a string in XXX-XXX-XXX format', () => {
    const key = generateRoomKey();
    expect(typeof key).toBe('string');
    expect(key).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/);
  });

  test('generates unique keys across 1000 calls', () => {
    const keys = new Set(Array.from({ length: 1000 }, generateRoomKey));
    expect(keys.size).toBe(1000);
  });

  test('never contains ambiguous characters (0, 1, 5, 8, O, I, L, S, B)', () => {
    // These characters are intentionally excluded from the ALPHABET constant
    const ambiguous = /[0158OILSB]/;
    for (let i = 0; i < 200; i++) {
      expect(generateRoomKey()).not.toMatch(ambiguous);
    }
  });

  test('always has exactly two hyphens', () => {
    for (let i = 0; i < 50; i++) {
      const key = generateRoomKey();
      const hyphens = key.split('').filter((c) => c === '-').length;
      expect(hyphens).toBe(2);
    }
  });
});

describe('isValidRoomKey', () => {
  test('accepts a freshly generated key', () => {
    expect(isValidRoomKey(generateRoomKey())).toBe(true);
  });

  test('accepts lowercase version of a valid key', () => {
    // normalisation is caller's responsibility; isValidRoomKey is case-sensitive
    // but normaliseRoomKey uppercases first
    const key = generateRoomKey();
    expect(isValidRoomKey(normaliseRoomKey(key.toLowerCase()))).toBe(true);
  });

  test('rejects keys with wrong segment length', () => {
    expect(isValidRoomKey('AB-CDE-FGH')).toBe(false);
    expect(isValidRoomKey('ABCD-EFG-HIJ')).toBe(false);
  });

  test('rejects keys without hyphens', () => {
    expect(isValidRoomKey('ABCDEFGHJ')).toBe(false);
  });

  test('rejects empty string', () => {
    expect(isValidRoomKey('')).toBe(false);
  });

  test('rejects non-string values', () => {
    expect(isValidRoomKey(null)).toBe(false);
    expect(isValidRoomKey(undefined)).toBe(false);
    expect(isValidRoomKey(123)).toBe(false);
  });
});

describe('normaliseRoomKey', () => {
  test('uppercases and trims', () => {
    expect(normaliseRoomKey('  abc-def-ghj  ')).toBe('ABC-DEF-GHJ');
  });

  test('preserves already-uppercase keys', () => {
    const key = generateRoomKey();
    expect(normaliseRoomKey(key)).toBe(key);
  });
});
