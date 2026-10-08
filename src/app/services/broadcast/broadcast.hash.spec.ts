import { webcrypto } from 'node:crypto';
import { vi } from 'vitest';
import { canonicalJson, digest, layerHash, isoWeek, utcMicros } from './broadcast.hash';
import { HASH_GOLDEN_VECTORS } from './hash-vectors';

describe('Canonical cross-language hashes', () => {
  beforeEach(() => vi.stubGlobal('crypto', webcrypto));
  for (const vector of HASH_GOLDEN_VECTORS) {
    it(vector.name, async () => {
      expect(canonicalJson(vector.value)).toBe(vector.canonical);
      expect(await digest(vector.value)).toBe(vector.sha256);
    });
  }
  it('rejects unsupported numbers, objects and unpaired surrogates', () => {
    for (const value of [1, 0.1, {}, ['\ud800']]) expect(() => canonicalJson(value)).toThrow();
  });
  it('preserves microseconds and Taipei ISO week boundaries', () => {
    expect(utcMicros('2026-10-07T07:00:00.123456Z')).toBe('2026-10-07T07:00:00.123456Z');
    expect(isoWeek(new Date('2026-10-11T23:59:59+08:00'))).toBe('2026-W41');
    expect(isoWeek(new Date('2026-10-12T00:00:00+08:00'))).toBe('2026-W42');
  });
});
