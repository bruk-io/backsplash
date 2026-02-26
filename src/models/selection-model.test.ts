import { describe, it, expect } from 'vitest';
import { SelectionModel } from './selection-model.js';

describe('SelectionModel', () => {
  it('initial state has gid 0 and isEmpty true', () => {
    const selection = new SelectionModel();
    expect(selection.gid).toBe(0);
    expect(selection.isEmpty).toBe(true);
    expect(selection.isStamp).toBe(false);
    expect(selection.stamp).toBeNull();
  });

  it('selectTile sets gid', () => {
    const selection = new SelectionModel();
    selection.selectTile(42);
    expect(selection.gid).toBe(42);
  });

  it('isEmpty returns false when gid is set', () => {
    const selection = new SelectionModel();
    selection.selectTile(1);
    expect(selection.isEmpty).toBe(false);
  });

  it('clear resets gid to 0', () => {
    const selection = new SelectionModel();
    selection.selectTile(7);
    selection.clear();
    expect(selection.gid).toBe(0);
    expect(selection.isEmpty).toBe(true);
  });

  it('selectTile overwrites previous selection', () => {
    const selection = new SelectionModel();
    selection.selectTile(5);
    selection.selectTile(10);
    expect(selection.gid).toBe(10);
  });

  it('selectTile clears any existing stamp', () => {
    const selection = new SelectionModel();
    selection.selectStamp(1, 2, 2, 10);
    expect(selection.isStamp).toBe(true);
    selection.selectTile(5);
    expect(selection.isStamp).toBe(false);
    expect(selection.stamp).toBeNull();
    expect(selection.gid).toBe(5);
  });

  // ── Stamp selection ──────────────────────────────────────────────

  it('selectStamp creates a 2x2 stamp with correct GIDs', () => {
    const selection = new SelectionModel();
    // Tileset with 10 columns, select 2x2 starting at GID 5
    selection.selectStamp(5, 2, 2, 10);
    expect(selection.isStamp).toBe(true);
    expect(selection.gid).toBe(5); // top-left tile
    expect(selection.stamp).toEqual({
      width: 2,
      height: 2,
      gids: [5, 6, 15, 16], // row 0: 5,6; row 1: 5+10, 5+10+1
    });
  });

  it('selectStamp creates a 3x2 stamp with correct GIDs', () => {
    const selection = new SelectionModel();
    selection.selectStamp(1, 3, 2, 8);
    expect(selection.stamp).toEqual({
      width: 3,
      height: 2,
      gids: [1, 2, 3, 9, 10, 11], // row 0: 1,2,3; row 1: 1+8, 2+8, 3+8
    });
  });

  it('1x1 stamp degenerates to single tile selection', () => {
    const selection = new SelectionModel();
    selection.selectStamp(42, 1, 1, 10);
    expect(selection.isStamp).toBe(false);
    expect(selection.stamp).toBeNull();
    expect(selection.gid).toBe(42);
  });

  it('selectStamp with zero width or height is a no-op', () => {
    const selection = new SelectionModel();
    selection.selectTile(5);
    selection.selectStamp(1, 0, 2, 10);
    expect(selection.gid).toBe(5); // unchanged
    selection.selectStamp(1, 2, 0, 10);
    expect(selection.gid).toBe(5); // unchanged
  });

  it('clear removes stamp', () => {
    const selection = new SelectionModel();
    selection.selectStamp(1, 2, 2, 10);
    selection.clear();
    expect(selection.isStamp).toBe(false);
    expect(selection.stamp).toBeNull();
    expect(selection.isEmpty).toBe(true);
  });

  it('isEmpty returns false when stamp is set', () => {
    const selection = new SelectionModel();
    selection.selectStamp(1, 2, 2, 10);
    expect(selection.isEmpty).toBe(false);
  });
});
