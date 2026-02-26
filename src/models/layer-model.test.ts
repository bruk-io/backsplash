import { describe, it, expect } from 'vitest';
import {
  EMPTY_GID,
  FLIP_HORIZONTAL,
  FLIP_VERTICAL,
  FLIP_DIAGONAL,
  GID_MASK,
  createTileLayer,
  createObjectLayer,
  extractTileId,
  isFlippedHorizontal,
  isFlippedVertical,
  isFlippedDiagonal,
  composeGid,
  getCell,
  setCell,
  setLayerName,
  setLayerVisible,
  setLayerOpacity,
  setLayerLocked,
  setLayerZOrder,
} from './layer-model.js';

// ── Cell read/write ──────────────────────────────────────────────────

describe('Cell access — getCell / setCell', () => {
  it('writes and reads back a GID at a specific position', () => {
    const layer = createTileLayer('test', 4, 4);
    setCell(layer, 2, 1, 4, 42);
    expect(getCell(layer, 2, 1, 4)).toBe(42);
  });

  it('defaults all cells to EMPTY_GID (0)', () => {
    const layer = createTileLayer('test', 3, 3);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        expect(getCell(layer, c, r, 3)).toBe(EMPTY_GID);
      }
    }
  });

  it('overwrites an existing GID with a new value', () => {
    const layer = createTileLayer('test', 2, 2);
    setCell(layer, 0, 0, 2, 10);
    setCell(layer, 0, 0, 2, 20);
    expect(getCell(layer, 0, 0, 2)).toBe(20);
  });

  it('writes to corner positions correctly', () => {
    const layer = createTileLayer('test', 4, 3);
    setCell(layer, 0, 0, 4, 1); // top-left
    setCell(layer, 3, 0, 4, 2); // top-right
    setCell(layer, 0, 2, 4, 3); // bottom-left
    setCell(layer, 3, 2, 4, 4); // bottom-right

    expect(getCell(layer, 0, 0, 4)).toBe(1);
    expect(getCell(layer, 3, 0, 4)).toBe(2);
    expect(getCell(layer, 0, 2, 4)).toBe(3);
    expect(getCell(layer, 3, 2, 4)).toBe(4);
  });
});

// ── Uint32Array bounds ──────────────────────────────────────────────

describe('TileLayer — Uint32Array data', () => {
  it('has correct length for width * height', () => {
    const layer = createTileLayer('test', 10, 8);
    expect(layer.data.length).toBe(80);
  });

  it('has correct length for a 1x1 layer', () => {
    const layer = createTileLayer('test', 1, 1);
    expect(layer.data.length).toBe(1);
  });

  it('data is a Uint32Array', () => {
    const layer = createTileLayer('test', 2, 2);
    expect(layer.data).toBeInstanceOf(Uint32Array);
  });
});

// ── Flip flag encoding ──────────────────────────────────────────────

describe('GID utilities — flip flag encoding', () => {
  it('composeGid with no flags returns the raw tile ID', () => {
    expect(composeGid(42)).toBe(42);
  });

  it('composeGid with horizontal flip sets bit 31', () => {
    const gid = composeGid(42, true, false, false);
    expect(gid & FLIP_HORIZONTAL).not.toBe(0);
    expect(extractTileId(gid)).toBe(42);
  });

  it('composeGid with vertical flip sets bit 30', () => {
    const gid = composeGid(42, false, true, false);
    expect(gid & FLIP_VERTICAL).not.toBe(0);
    expect(extractTileId(gid)).toBe(42);
  });

  it('composeGid with diagonal flip sets bit 29', () => {
    const gid = composeGid(42, false, false, true);
    expect(gid & FLIP_DIAGONAL).not.toBe(0);
    expect(extractTileId(gid)).toBe(42);
  });

  it('composeGid with all flags sets all three top bits', () => {
    const gid = composeGid(42, true, true, true);
    expect(isFlippedHorizontal(gid)).toBe(true);
    expect(isFlippedVertical(gid)).toBe(true);
    expect(isFlippedDiagonal(gid)).toBe(true);
    expect(extractTileId(gid)).toBe(42);
  });

  it('extractTileId strips all flags', () => {
    const gid = composeGid(100, true, true, true);
    expect(extractTileId(gid)).toBe(100);
  });

  it('isFlippedHorizontal detects only horizontal flag', () => {
    expect(isFlippedHorizontal(composeGid(1, true, false, false))).toBe(true);
    expect(isFlippedHorizontal(composeGid(1, false, true, false))).toBe(false);
    expect(isFlippedHorizontal(composeGid(1, false, false, true))).toBe(false);
  });

  it('isFlippedVertical detects only vertical flag', () => {
    expect(isFlippedVertical(composeGid(1, false, true, false))).toBe(true);
    expect(isFlippedVertical(composeGid(1, true, false, false))).toBe(false);
  });

  it('isFlippedDiagonal detects only diagonal flag', () => {
    expect(isFlippedDiagonal(composeGid(1, false, false, true))).toBe(true);
    expect(isFlippedDiagonal(composeGid(1, false, true, false))).toBe(false);
  });

  it('composeGid masks tile ID to 29 bits', () => {
    // If tileId has bits above 29, they should be masked out
    const bigId = GID_MASK + 1; // bit 29 set = 0x20000000
    const gid = composeGid(bigId);
    expect(extractTileId(gid)).toBe(0); // bit 29 is masked away
  });

  it('round-trips GID 0 (empty cell)', () => {
    const gid = composeGid(0);
    expect(extractTileId(gid)).toBe(0);
    expect(isFlippedHorizontal(gid)).toBe(false);
  });
});

// ── Factory functions ───────────────────────────────────────────────

describe('createTileLayer — defaults', () => {
  it('creates a tile layer with correct type', () => {
    const layer = createTileLayer('Ground', 4, 4);
    expect(layer.type).toBe('tile');
  });

  it('sets visible to true by default', () => {
    const layer = createTileLayer('Ground', 4, 4);
    expect(layer.visible).toBe(true);
  });

  it('sets opacity to 1.0 by default', () => {
    const layer = createTileLayer('Ground', 4, 4);
    expect(layer.opacity).toBe(1.0);
  });

  it('sets locked to false by default', () => {
    const layer = createTileLayer('Ground', 4, 4);
    expect(layer.locked).toBe(false);
  });

  it('defaults zOrder to 0', () => {
    const layer = createTileLayer('Ground', 4, 4);
    expect(layer.zOrder).toBe(0);
  });

  it('accepts a custom zOrder', () => {
    const layer = createTileLayer('Ground', 4, 4, 5);
    expect(layer.zOrder).toBe(5);
  });

  it('preserves the layer name', () => {
    const layer = createTileLayer('My Layer', 2, 2);
    expect(layer.name).toBe('My Layer');
  });
});

describe('createObjectLayer — defaults', () => {
  it('creates an object layer with correct type', () => {
    const layer = createObjectLayer('Objects');
    expect(layer.type).toBe('object');
  });

  it('sets visible to true by default', () => {
    const layer = createObjectLayer('Objects');
    expect(layer.visible).toBe(true);
  });

  it('sets opacity to 1.0 by default', () => {
    const layer = createObjectLayer('Objects');
    expect(layer.opacity).toBe(1.0);
  });

  it('sets locked to false by default', () => {
    const layer = createObjectLayer('Objects');
    expect(layer.locked).toBe(false);
  });

  it('defaults zOrder to 0', () => {
    const layer = createObjectLayer('Objects');
    expect(layer.zOrder).toBe(0);
  });

  it('starts with an empty objects array', () => {
    const layer = createObjectLayer('Objects');
    expect(layer.objects).toEqual([]);
  });

  it('accepts a custom zOrder', () => {
    const layer = createObjectLayer('Objects', 3);
    expect(layer.zOrder).toBe(3);
  });
});

// ── Layer property setters ──────────────────────────────────────────

describe('Layer property setters', () => {
  it('setLayerName returns a new layer with updated name', () => {
    const original = createTileLayer('Old', 2, 2);
    const updated = setLayerName(original, 'New');
    expect(updated.name).toBe('New');
    expect(original.name).toBe('Old'); // immutable
  });

  it('setLayerVisible returns a new layer with updated visibility', () => {
    const original = createTileLayer('test', 2, 2);
    const hidden = setLayerVisible(original, false);
    expect(hidden.visible).toBe(false);
    expect(original.visible).toBe(true);
  });

  it('setLayerOpacity clamps values above 1.0 to 1.0', () => {
    const layer = createTileLayer('test', 2, 2);
    const updated = setLayerOpacity(layer, 2.5);
    expect(updated.opacity).toBe(1.0);
  });

  it('setLayerOpacity clamps values below 0.0 to 0.0', () => {
    const layer = createTileLayer('test', 2, 2);
    const updated = setLayerOpacity(layer, -0.5);
    expect(updated.opacity).toBe(0.0);
  });

  it('setLayerOpacity preserves valid values', () => {
    const layer = createTileLayer('test', 2, 2);
    const updated = setLayerOpacity(layer, 0.5);
    expect(updated.opacity).toBe(0.5);
  });

  it('setLayerOpacity handles boundary values 0 and 1', () => {
    const layer = createTileLayer('test', 2, 2);
    expect(setLayerOpacity(layer, 0).opacity).toBe(0);
    expect(setLayerOpacity(layer, 1).opacity).toBe(1);
  });

  it('setLayerLocked returns a new layer with updated lock state', () => {
    const original = createTileLayer('test', 2, 2);
    const locked = setLayerLocked(original, true);
    expect(locked.locked).toBe(true);
    expect(original.locked).toBe(false);
  });

  it('setLayerZOrder returns a new layer with updated z-order', () => {
    const layer = createTileLayer('test', 2, 2);
    const updated = setLayerZOrder(layer, 10);
    expect(updated.zOrder).toBe(10);
  });

  it('setters preserve the layer type discriminant', () => {
    const tile = createTileLayer('test', 2, 2);
    expect(setLayerName(tile, 'renamed').type).toBe('tile');

    const obj = createObjectLayer('test');
    expect(setLayerName(obj, 'renamed').type).toBe('object');
  });

  it('setters preserve data for tile layers', () => {
    const layer = createTileLayer('test', 2, 2);
    setCell(layer, 0, 0, 2, 99);
    const renamed = setLayerName(layer, 'renamed');
    // Spread copies the reference to the same Uint32Array
    expect(getCell(renamed, 0, 0, 2)).toBe(99);
  });
});
