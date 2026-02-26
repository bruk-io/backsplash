import { describe, it, expect } from 'vitest';
import {
  EMPTY_GID,
  FLIP_HORIZONTAL,
  FLIP_VERTICAL,
  FLIP_DIAGONAL,
  GID_MASK,
  maskGid,
  isFlippedHorizontal,
  isFlippedVertical,
  isFlippedDiagonal,
  composeGid,
} from './gid.js';

describe('GID constants', () => {
  it('EMPTY_GID is 0', () => {
    expect(EMPTY_GID).toBe(0);
  });

  it('flip flags occupy the top 3 bits of a 32-bit value', () => {
    expect(FLIP_HORIZONTAL).toBe(0x80000000);
    expect(FLIP_VERTICAL).toBe(0x40000000);
    expect(FLIP_DIAGONAL).toBe(0x20000000);
  });

  it('GID_MASK covers the lower 29 bits', () => {
    expect(GID_MASK).toBe(0x1fffffff);
  });
});

describe('maskGid', () => {
  it('returns the raw tile ID when no flags are set', () => {
    expect(maskGid(42)).toBe(42);
  });

  it('strips horizontal flip flag', () => {
    expect(maskGid(42 | FLIP_HORIZONTAL)).toBe(42);
  });

  it('strips vertical flip flag', () => {
    expect(maskGid(42 | FLIP_VERTICAL)).toBe(42);
  });

  it('strips diagonal flip flag', () => {
    expect(maskGid(42 | FLIP_DIAGONAL)).toBe(42);
  });

  it('strips all three flags at once', () => {
    const flagged = 42 | FLIP_HORIZONTAL | FLIP_VERTICAL | FLIP_DIAGONAL;
    expect(maskGid(flagged)).toBe(42);
  });

  it('returns 0 for EMPTY_GID', () => {
    expect(maskGid(EMPTY_GID)).toBe(0);
  });

  it('handles maximum 29-bit tile ID', () => {
    expect(maskGid(GID_MASK)).toBe(GID_MASK);
  });

  it('handles maximum tile ID with all flags', () => {
    const flagged = GID_MASK | FLIP_HORIZONTAL | FLIP_VERTICAL | FLIP_DIAGONAL;
    expect(maskGid(flagged)).toBe(GID_MASK);
  });
});

describe('isFlippedHorizontal', () => {
  it('returns false when flag is not set', () => {
    expect(isFlippedHorizontal(42)).toBe(false);
  });

  it('returns true when flag is set', () => {
    expect(isFlippedHorizontal(42 | FLIP_HORIZONTAL)).toBe(true);
  });

  it('is independent of other flags', () => {
    expect(isFlippedHorizontal(42 | FLIP_VERTICAL | FLIP_DIAGONAL)).toBe(false);
    expect(isFlippedHorizontal(42 | FLIP_HORIZONTAL | FLIP_VERTICAL)).toBe(true);
  });
});

describe('isFlippedVertical', () => {
  it('returns false when flag is not set', () => {
    expect(isFlippedVertical(42)).toBe(false);
  });

  it('returns true when flag is set', () => {
    expect(isFlippedVertical(42 | FLIP_VERTICAL)).toBe(true);
  });

  it('is independent of other flags', () => {
    expect(isFlippedVertical(42 | FLIP_HORIZONTAL | FLIP_DIAGONAL)).toBe(false);
    expect(isFlippedVertical(42 | FLIP_VERTICAL | FLIP_DIAGONAL)).toBe(true);
  });
});

describe('isFlippedDiagonal', () => {
  it('returns false when flag is not set', () => {
    expect(isFlippedDiagonal(42)).toBe(false);
  });

  it('returns true when flag is set', () => {
    expect(isFlippedDiagonal(42 | FLIP_DIAGONAL)).toBe(true);
  });

  it('is independent of other flags', () => {
    expect(isFlippedDiagonal(42 | FLIP_HORIZONTAL | FLIP_VERTICAL)).toBe(false);
    expect(isFlippedDiagonal(42 | FLIP_DIAGONAL | FLIP_HORIZONTAL)).toBe(true);
  });
});

describe('composeGid', () => {
  it('returns raw tile ID with no flags by default', () => {
    expect(composeGid(42)).toBe(42);
  });

  it('sets horizontal flip flag', () => {
    const gid = composeGid(42, true, false, false);
    expect(maskGid(gid)).toBe(42);
    expect(isFlippedHorizontal(gid)).toBe(true);
    expect(isFlippedVertical(gid)).toBe(false);
    expect(isFlippedDiagonal(gid)).toBe(false);
  });

  it('sets vertical flip flag', () => {
    const gid = composeGid(42, false, true, false);
    expect(maskGid(gid)).toBe(42);
    expect(isFlippedVertical(gid)).toBe(true);
  });

  it('sets diagonal flip flag', () => {
    const gid = composeGid(42, false, false, true);
    expect(maskGid(gid)).toBe(42);
    expect(isFlippedDiagonal(gid)).toBe(true);
  });

  it('sets all three flags', () => {
    const gid = composeGid(42, true, true, true);
    expect(maskGid(gid)).toBe(42);
    expect(isFlippedHorizontal(gid)).toBe(true);
    expect(isFlippedVertical(gid)).toBe(true);
    expect(isFlippedDiagonal(gid)).toBe(true);
  });

  it('masks the tile ID to 29 bits', () => {
    // Passing a value with bits in the flag region should be stripped
    const gid = composeGid(0xffffffff);
    expect(maskGid(gid)).toBe(GID_MASK);
    expect(isFlippedHorizontal(gid)).toBe(false);
  });

  it('roundtrips: compose then mask recovers original tile ID', () => {
    for (const id of [0, 1, 100, 1000, GID_MASK]) {
      for (const h of [true, false]) {
        for (const v of [true, false]) {
          for (const d of [true, false]) {
            const gid = composeGid(id, h, v, d);
            expect(maskGid(gid)).toBe(id);
            expect(isFlippedHorizontal(gid)).toBe(h);
            expect(isFlippedVertical(gid)).toBe(v);
            expect(isFlippedDiagonal(gid)).toBe(d);
          }
        }
      }
    }
  });
});
