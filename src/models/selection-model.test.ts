import { describe, it, expect } from 'vitest';
import { SelectionModel } from './selection-model.js';

describe('SelectionModel', () => {
  it('initial state has gid 0 and isEmpty true', () => {
    const selection = new SelectionModel();
    expect(selection.gid).toBe(0);
    expect(selection.isEmpty).toBe(true);
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
});
