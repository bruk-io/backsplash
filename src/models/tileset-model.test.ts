import { describe, it, expect } from 'vitest';
import {
  TilesetModel,
  maskGid,
  FLIPPED_HORIZONTALLY,
  FLIPPED_VERTICALLY,
  FLIPPED_DIAGONALLY,
  GID_MASK,
} from './tileset-model.js';

// ── Helper ───────────────────────────────────────────────────────────

/** Create a simple tileset with no margin/spacing for basic tests. */
function simpleTileset(
  overrides: Partial<{
    name: string;
    tileWidth: number;
    tileHeight: number;
    imageWidth: number;
    imageHeight: number;
    margin: number;
    spacing: number;
    firstGid: number;
  }> = {},
): TilesetModel {
  return new TilesetModel({
    name: overrides.name ?? 'test',
    image: null,
    tileWidth: overrides.tileWidth ?? 16,
    tileHeight: overrides.tileHeight ?? 16,
    imageWidth: overrides.imageWidth ?? 64,
    imageHeight: overrides.imageHeight ?? 64,
    margin: overrides.margin,
    spacing: overrides.spacing,
    firstGid: overrides.firstGid,
  });
}

// ── maskGid ──────────────────────────────────────────────────────────

describe('maskGid', () => {
  it('returns the raw tile index with no flags set', () => {
    expect(maskGid(42)).toBe(42);
  });

  it('strips the horizontal flip flag', () => {
    expect(maskGid(42 | FLIPPED_HORIZONTALLY)).toBe(42);
  });

  it('strips the vertical flip flag', () => {
    expect(maskGid(42 | FLIPPED_VERTICALLY)).toBe(42);
  });

  it('strips the diagonal flip flag', () => {
    expect(maskGid(42 | FLIPPED_DIAGONALLY)).toBe(42);
  });

  it('strips all three flip flags at once', () => {
    const gid = 42 | FLIPPED_HORIZONTALLY | FLIPPED_VERTICALLY | FLIPPED_DIAGONALLY;
    expect(maskGid(gid)).toBe(42);
  });

  it('returns 0 for GID 0', () => {
    expect(maskGid(0)).toBe(0);
  });

  it('preserves the maximum raw tile ID (GID_MASK)', () => {
    expect(maskGid(GID_MASK)).toBe(GID_MASK);
  });
});

// ── GID indexing ─────────────────────────────────────────────────────

describe('TilesetModel — GID indexing', () => {
  it('computes correct columns, rows, and tileCount for a 64x64 spritesheet with 16x16 tiles', () => {
    const ts = simpleTileset();
    expect(ts.columns).toBe(4);
    expect(ts.rows).toBe(4);
    expect(ts.tileCount).toBe(16);
  });

  it('defaults firstGid to 1', () => {
    const ts = simpleTileset();
    expect(ts.firstGid).toBe(1);
  });

  it('computes lastGid correctly', () => {
    const ts = simpleTileset(); // 16 tiles, firstGid=1
    expect(ts.lastGid).toBe(16);
  });

  it('getTileRect returns correct source position for first GID', () => {
    const ts = simpleTileset();
    expect(ts.getTileRect(1)).toEqual({ x: 0, y: 0 });
  });

  it('getTileRect returns correct source position for second GID (next column)', () => {
    const ts = simpleTileset();
    expect(ts.getTileRect(2)).toEqual({ x: 16, y: 0 });
  });

  it('getTileRect returns correct source position for first tile in second row', () => {
    const ts = simpleTileset(); // 4 columns
    // GID 5 = localId 4, col=0 row=1
    expect(ts.getTileRect(5)).toEqual({ x: 0, y: 16 });
  });

  it('getTileRect returns correct source position for last GID', () => {
    const ts = simpleTileset(); // 4x4 grid, lastGid=16, localId=15, col=3 row=3
    expect(ts.getTileRect(16)).toEqual({ x: 48, y: 48 });
  });

  it('getTileRect returns correct source for a middle tile', () => {
    const ts = simpleTileset(); // GID 7 = localId 6, col=2 row=1
    expect(ts.getTileRect(7)).toEqual({ x: 32, y: 16 });
  });
});

// ── Multi-tileset namespace ──────────────────────────────────────────

describe('TilesetModel — multi-tileset namespace', () => {
  it('containsGid returns true for GIDs within range and false outside', () => {
    const ts1 = simpleTileset({ firstGid: 1 }); // GIDs 1-16
    const ts2 = simpleTileset({ firstGid: 17 }); // GIDs 17-32

    expect(ts1.containsGid(1)).toBe(true);
    expect(ts1.containsGid(16)).toBe(true);
    expect(ts1.containsGid(17)).toBe(false);

    expect(ts2.containsGid(16)).toBe(false);
    expect(ts2.containsGid(17)).toBe(true);
    expect(ts2.containsGid(32)).toBe(true);
    expect(ts2.containsGid(33)).toBe(false);
  });

  it('getTileRect works correctly for a second tileset starting after the first', () => {
    const ts2 = simpleTileset({ firstGid: 17 });
    // GID 17 = localId 0 → col=0, row=0
    expect(ts2.getTileRect(17)).toEqual({ x: 0, y: 0 });
    // GID 18 = localId 1 → col=1, row=0
    expect(ts2.getTileRect(18)).toEqual({ x: 16, y: 0 });
  });

  it('getTileRect returns null for GIDs belonging to a different tileset', () => {
    const ts1 = simpleTileset({ firstGid: 1 });
    expect(ts1.getTileRect(17)).toBeNull();
  });
});

// ── Margin and spacing ──────────────────────────────────────────────

describe('TilesetModel — margin and spacing', () => {
  it('calculates columns, rows, and tileCount with margin=1 spacing=1', () => {
    // imageWidth=64, margin=1 → usable=62, tileWidth=16, spacing=1
    // count = floor((62 + 1) / (16 + 1)) = floor(63/17) = 3
    const ts = simpleTileset({ margin: 1, spacing: 1 });
    expect(ts.columns).toBe(3);
    expect(ts.rows).toBe(3);
    expect(ts.tileCount).toBe(9);
  });

  it('getTileRect accounts for margin and spacing', () => {
    const ts = simpleTileset({ margin: 1, spacing: 1 });
    // GID 1 = localId 0, col=0, row=0 → x = 1 + 0*(16+1) = 1, y = 1
    expect(ts.getTileRect(1)).toEqual({ x: 1, y: 1 });
    // GID 2 = localId 1, col=1, row=0 → x = 1 + 1*(16+1) = 18, y = 1
    expect(ts.getTileRect(2)).toEqual({ x: 18, y: 1 });
    // GID 4 = localId 3, col=0, row=1 → x = 1, y = 1 + 1*(16+1) = 18
    expect(ts.getTileRect(4)).toEqual({ x: 1, y: 18 });
  });

  it('handles margin-only (no spacing)', () => {
    // imageWidth=64, margin=2 → usable=60, tileWidth=16, spacing=0
    // count = floor((60 + 0) / (16 + 0)) = 3
    const ts = simpleTileset({ margin: 2, spacing: 0 });
    expect(ts.columns).toBe(3);
    expect(ts.rows).toBe(3);
  });

  it('handles spacing-only (no margin)', () => {
    // imageWidth=64, margin=0 → usable=64, tileWidth=16, spacing=2
    // count = floor((64 + 2) / (16 + 2)) = floor(66/18) = 3
    const ts = simpleTileset({ margin: 0, spacing: 2 });
    expect(ts.columns).toBe(3);
    expect(ts.rows).toBe(3);
  });
});

// ── Edge cases ──────────────────────────────────────────────────────

describe('TilesetModel — edge cases', () => {
  it('GID 0 does not belong to any tileset', () => {
    const ts = simpleTileset();
    expect(ts.containsGid(0)).toBe(false);
  });

  it('getTileRect returns null for GID 0', () => {
    const ts = simpleTileset();
    expect(ts.getTileRect(0)).toBeNull();
  });

  it('getTileRect returns null for out-of-range GID above lastGid', () => {
    const ts = simpleTileset(); // lastGid = 16
    expect(ts.getTileRect(17)).toBeNull();
  });

  it('getTileRect returns null for GID below firstGid', () => {
    const ts = simpleTileset({ firstGid: 10 });
    expect(ts.getTileRect(9)).toBeNull();
  });

  it('handles zero imageWidth gracefully', () => {
    const ts = simpleTileset({ imageWidth: 0 });
    expect(ts.columns).toBe(0);
    expect(ts.tileCount).toBe(0);
  });

  it('handles zero imageHeight gracefully', () => {
    const ts = simpleTileset({ imageHeight: 0 });
    expect(ts.rows).toBe(0);
    expect(ts.tileCount).toBe(0);
  });

  it('handles margin larger than image gracefully', () => {
    const ts = simpleTileset({ margin: 100 }); // imageWidth=64, margin=100 → usable < 0
    expect(ts.columns).toBe(0);
    expect(ts.tileCount).toBe(0);
  });
});

// ── GID with flip flags ─────────────────────────────────────────────

describe('TilesetModel — GID with flip flags', () => {
  it('containsGid works with horizontal flip flag set', () => {
    const ts = simpleTileset();
    expect(ts.containsGid(5 | FLIPPED_HORIZONTALLY)).toBe(true);
  });

  it('containsGid works with all flip flags set', () => {
    const ts = simpleTileset();
    const flagged = 5 | FLIPPED_HORIZONTALLY | FLIPPED_VERTICALLY | FLIPPED_DIAGONALLY;
    expect(ts.containsGid(flagged)).toBe(true);
  });

  it('getTileRect returns correct position when flip flags are set', () => {
    const ts = simpleTileset();
    // GID 5 with horizontal flip → should resolve same as GID 5
    const flagged = 5 | FLIPPED_HORIZONTALLY;
    expect(ts.getTileRect(flagged)).toEqual(ts.getTileRect(5));
  });

  it('getTileRect returns correct position with all flags set', () => {
    const ts = simpleTileset();
    const flagged = 10 | FLIPPED_HORIZONTALLY | FLIPPED_VERTICALLY | FLIPPED_DIAGONALLY;
    expect(ts.getTileRect(flagged)).toEqual(ts.getTileRect(10));
  });

  it('getTileRect returns null for out-of-range GID even with flags set', () => {
    const ts = simpleTileset(); // lastGid=16
    const flagged = 17 | FLIPPED_HORIZONTALLY;
    expect(ts.getTileRect(flagged)).toBeNull();
  });
});
