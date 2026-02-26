import { describe, it, expect } from 'vitest';
import { TilemapModel } from './tilemap-model.js';
import { vi } from 'vitest';
import {
  brush,
  eraser,
  eyedropper,
  fill,
  dispatch,
  type EditorState,
  type ToolEvent,
} from './tool-engine.js';

// ── Helpers ───────────────────────────────────────────────────────────

function makeMap(
  overrides: Partial<{
    width: number;
    height: number;
    tileWidth: number;
    tileHeight: number;
  }> = {},
): TilemapModel {
  return new TilemapModel({
    width: overrides.width ?? 10,
    height: overrides.height ?? 8,
    tileWidth: overrides.tileWidth ?? 16,
    tileHeight: overrides.tileHeight ?? 16,
  });
}

function makeState(overrides: Partial<EditorState> = {}): EditorState {
  return {
    activeTool: overrides.activeTool ?? 'brush',
    activeLayerIndex: overrides.activeLayerIndex ?? 0,
    selectedGid: overrides.selectedGid ?? 1,
    stamp: overrides.stamp ?? undefined,
    onEyedrop: overrides.onEyedrop,
  };
}

function makeEvent(overrides: Partial<ToolEvent> = {}): ToolEvent {
  return {
    type: overrides.type ?? 'down',
    col: overrides.col ?? 0,
    row: overrides.row ?? 0,
  };
}

// ── Brush strategy ────────────────────────────────────────────────────

describe('brush strategy', () => {
  it('paints correct GID and returns PaintCommand with old/new', () => {
    const map = makeMap();
    const state = makeState({ selectedGid: 42 });
    const event = makeEvent({ col: 3, row: 2 });

    const cmd = brush(event, state, map);

    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe('paint');
    expect(cmd!.edits).toHaveLength(1);
    expect(cmd!.edits[0]).toEqual({
      layerIndex: 0,
      col: 3,
      row: 2,
      oldGid: 0,
      newGid: 42,
    });

    // Verify the tilemap was actually mutated
    expect(map.getCellGid(0, 3, 2)).toBe(42);
  });

  it('paints on move events', () => {
    const map = makeMap();
    const state = makeState({ selectedGid: 5 });
    const event = makeEvent({ type: 'move', col: 1, row: 1 });

    const cmd = brush(event, state, map);

    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe('paint');
    expect(map.getCellGid(0, 1, 1)).toBe(5);
  });

  it('returns null on up events', () => {
    const map = makeMap();
    const state = makeState({ selectedGid: 5 });
    const event = makeEvent({ type: 'up', col: 1, row: 1 });

    const cmd = brush(event, state, map);

    expect(cmd).toBeNull();
    expect(map.getCellGid(0, 1, 1)).toBe(0); // No mutation
  });

  it('returns null when selectedGid is 0', () => {
    const map = makeMap();
    const state = makeState({ selectedGid: 0 });
    const event = makeEvent({ col: 3, row: 2 });

    const cmd = brush(event, state, map);

    expect(cmd).toBeNull();
  });

  it('returns null for out-of-bounds coordinates', () => {
    const map = makeMap({ width: 10, height: 8 });
    const state = makeState({ selectedGid: 5 });

    expect(brush(makeEvent({ col: -1, row: 0 }), state, map)).toBeNull();
    expect(brush(makeEvent({ col: 10, row: 0 }), state, map)).toBeNull();
    expect(brush(makeEvent({ col: 0, row: -1 }), state, map)).toBeNull();
    expect(brush(makeEvent({ col: 0, row: 8 }), state, map)).toBeNull();
  });

  it('returns null when painting the same GID (no-op)', () => {
    const map = makeMap();
    map.setCellGid(0, 3, 2, 42);

    const state = makeState({ selectedGid: 42 });
    const event = makeEvent({ col: 3, row: 2 });

    const cmd = brush(event, state, map);

    expect(cmd).toBeNull();
  });

  it('records the correct old GID when overwriting', () => {
    const map = makeMap();
    map.setCellGid(0, 1, 1, 10);

    const state = makeState({ selectedGid: 20 });
    const event = makeEvent({ col: 1, row: 1 });

    const cmd = brush(event, state, map);

    expect(cmd).not.toBeNull();
    expect(cmd!.edits[0].oldGid).toBe(10);
    expect(cmd!.edits[0].newGid).toBe(20);
    expect(map.getCellGid(0, 1, 1)).toBe(20);
  });
});

// ── Eraser strategy ───────────────────────────────────────────────────

describe('eraser strategy', () => {
  it('erases a tile by setting it to GID 0', () => {
    const map = makeMap();
    map.setCellGid(0, 3, 2, 42);

    const state = makeState({ activeTool: 'eraser' });
    const event = makeEvent({ col: 3, row: 2 });

    const cmd = eraser(event, state, map);

    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe('paint');
    expect(cmd!.edits).toHaveLength(1);
    expect(cmd!.edits[0]).toEqual({
      layerIndex: 0,
      col: 3,
      row: 2,
      oldGid: 42,
      newGid: 0,
    });

    // Verify the tilemap was actually mutated
    expect(map.getCellGid(0, 3, 2)).toBe(0);
  });

  it('returns null when cell is already empty', () => {
    const map = makeMap();
    // Cell at (0, 0) is already 0 (empty)

    const state = makeState({ activeTool: 'eraser' });
    const event = makeEvent({ col: 0, row: 0 });

    const cmd = eraser(event, state, map);

    expect(cmd).toBeNull();
  });

  it('returns null for out-of-bounds coordinates', () => {
    const map = makeMap({ width: 10, height: 8 });
    const state = makeState({ activeTool: 'eraser' });

    expect(eraser(makeEvent({ col: -1, row: 0 }), state, map)).toBeNull();
    expect(eraser(makeEvent({ col: 10, row: 0 }), state, map)).toBeNull();
    expect(eraser(makeEvent({ col: 0, row: -1 }), state, map)).toBeNull();
    expect(eraser(makeEvent({ col: 0, row: 8 }), state, map)).toBeNull();
  });

  it('returns null on up event', () => {
    const map = makeMap();
    map.setCellGid(0, 1, 1, 7);

    const state = makeState({ activeTool: 'eraser' });
    const event = makeEvent({ type: 'up', col: 1, row: 1 });

    const cmd = eraser(event, state, map);

    expect(cmd).toBeNull();
    expect(map.getCellGid(0, 1, 1)).toBe(7); // No mutation
  });

  it('command undo restores original GID', () => {
    const map = makeMap();
    map.setCellGid(0, 2, 4, 99);

    const state = makeState({ activeTool: 'eraser' });
    const event = makeEvent({ col: 2, row: 4 });

    const cmd = eraser(event, state, map);

    expect(cmd).not.toBeNull();
    expect(map.getCellGid(0, 2, 4)).toBe(0); // Erased

    // Simulate undo: restore oldGid
    const edit = cmd!.edits[0];
    map.setCellGid(edit.layerIndex, edit.col, edit.row, edit.oldGid);
    expect(map.getCellGid(0, 2, 4)).toBe(99); // Restored
  });

  it('erases on move events (drag to erase)', () => {
    const map = makeMap();
    map.setCellGid(0, 5, 3, 15);

    const state = makeState({ activeTool: 'eraser' });
    const event = makeEvent({ type: 'move', col: 5, row: 3 });

    const cmd = eraser(event, state, map);

    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe('paint');
    expect(map.getCellGid(0, 5, 3)).toBe(0);
  });
});

// ── Eyedropper strategy ───────────────────────────────────────────────

describe('eyedropper strategy', () => {
  it('calls onEyedrop with the GID of the clicked cell', () => {
    const map = makeMap();
    map.setCellGid(0, 3, 2, 42);

    const onEyedrop = vi.fn();
    const state = makeState({ activeTool: 'eyedropper', onEyedrop });
    const event = makeEvent({ type: 'down', col: 3, row: 2 });

    const cmd = eyedropper(event, state, map);

    expect(onEyedrop).toHaveBeenCalledOnce();
    expect(onEyedrop).toHaveBeenCalledWith(42);
    expect(cmd).toBeNull();
  });

  it('returns null (no command generated)', () => {
    const map = makeMap();
    map.setCellGid(0, 1, 1, 7);

    const state = makeState({ activeTool: 'eyedropper', onEyedrop: vi.fn() });
    const event = makeEvent({ type: 'down', col: 1, row: 1 });

    const cmd = eyedropper(event, state, map);

    expect(cmd).toBeNull();
  });

  it('does not call onEyedrop for empty cells (GID 0)', () => {
    const map = makeMap();
    // Cell at (0, 0) is empty by default (GID 0)

    const onEyedrop = vi.fn();
    const state = makeState({ activeTool: 'eyedropper', onEyedrop });
    const event = makeEvent({ type: 'down', col: 0, row: 0 });

    eyedropper(event, state, map);

    expect(onEyedrop).not.toHaveBeenCalled();
  });

  it('does not call onEyedrop for out-of-bounds cells', () => {
    const map = makeMap({ width: 10, height: 8 });

    const onEyedrop = vi.fn();
    const state = makeState({ activeTool: 'eyedropper', onEyedrop });

    eyedropper(makeEvent({ type: 'down', col: -1, row: 0 }), state, map);
    eyedropper(makeEvent({ type: 'down', col: 10, row: 0 }), state, map);
    eyedropper(makeEvent({ type: 'down', col: 0, row: -1 }), state, map);
    eyedropper(makeEvent({ type: 'down', col: 0, row: 8 }), state, map);

    expect(onEyedrop).not.toHaveBeenCalled();
  });

  it('only triggers on down events — ignores move and up', () => {
    const map = makeMap();
    map.setCellGid(0, 2, 2, 15);

    const onEyedrop = vi.fn();
    const state = makeState({ activeTool: 'eyedropper', onEyedrop });

    eyedropper(makeEvent({ type: 'move', col: 2, row: 2 }), state, map);
    eyedropper(makeEvent({ type: 'up', col: 2, row: 2 }), state, map);

    expect(onEyedrop).not.toHaveBeenCalled();
  });

  it('does not mutate the tilemap', () => {
    const map = makeMap();
    map.setCellGid(0, 4, 4, 99);

    const state = makeState({ activeTool: 'eyedropper', onEyedrop: vi.fn() });
    const event = makeEvent({ type: 'down', col: 4, row: 4 });

    eyedropper(event, state, map);

    expect(map.getCellGid(0, 4, 4)).toBe(99); // Unchanged
  });
});

// ── Fill strategy ─────────────────────────────────────────────────────

describe('fill strategy', () => {
  it('fills all connected empty cells from click origin (empty map fill)', () => {
    // 3x3 map, all empty (GID 0). Filling from (1,1) with GID 5 should
    // replace all 9 cells.
    const map = makeMap({ width: 3, height: 3 });
    const state = makeState({ activeTool: 'fill', selectedGid: 5 });
    const event = makeEvent({ col: 1, row: 1 });

    const cmd = fill(event, state, map);

    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe('paint');
    expect(cmd!.edits).toHaveLength(9);

    // All cells should now be GID 5
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        expect(map.getCellGid(0, c, r)).toBe(5);
      }
    }
  });

  it('fills a single cell when surrounded by different GIDs', () => {
    // 3x3 map. Center cell (1,1) has GID 7; all surrounding cells have GID 1.
    // Filling center with GID 99 should only change (1,1).
    const map = makeMap({ width: 3, height: 3 });
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        map.setCellGid(0, c, r, 1);
      }
    }
    map.setCellGid(0, 1, 1, 7);

    const state = makeState({ activeTool: 'fill', selectedGid: 99 });
    const event = makeEvent({ col: 1, row: 1 });

    const cmd = fill(event, state, map);

    expect(cmd).not.toBeNull();
    expect(cmd!.edits).toHaveLength(1);
    expect(cmd!.edits[0]).toEqual({
      layerIndex: 0,
      col: 1,
      row: 1,
      oldGid: 7,
      newGid: 99,
    });
    expect(map.getCellGid(0, 1, 1)).toBe(99);
    // Surrounding cells unchanged
    expect(map.getCellGid(0, 0, 0)).toBe(1);
    expect(map.getCellGid(0, 2, 2)).toBe(1);
  });

  it('fills to map boundary (no out-of-bounds access)', () => {
    // 4x4 map, all cells GID 3. Fill the entire map from corner (0,0).
    const map = makeMap({ width: 4, height: 4 });
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        map.setCellGid(0, c, r, 3);
      }
    }

    const state = makeState({ activeTool: 'fill', selectedGid: 8 });
    const event = makeEvent({ col: 0, row: 0 });

    const cmd = fill(event, state, map);

    expect(cmd).not.toBeNull();
    expect(cmd!.edits).toHaveLength(16);

    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        expect(map.getCellGid(0, c, r)).toBe(8);
      }
    }
  });

  it('fills an L-shaped contiguous region (non-rectangular)', () => {
    // 3x3 map. GID 2 forms an L-shape:
    //   2 0 0
    //   2 0 0
    //   2 2 2
    // Filling from (0,0) with GID 9 should change all 5 GID-2 cells.
    const map = makeMap({ width: 3, height: 3 });
    // Top-left column
    map.setCellGid(0, 0, 0, 2);
    map.setCellGid(0, 0, 1, 2);
    map.setCellGid(0, 0, 2, 2);
    // Bottom row
    map.setCellGid(0, 1, 2, 2);
    map.setCellGid(0, 2, 2, 2);

    const state = makeState({ activeTool: 'fill', selectedGid: 9 });
    const event = makeEvent({ col: 0, row: 0 });

    const cmd = fill(event, state, map);

    expect(cmd).not.toBeNull();
    expect(cmd!.edits).toHaveLength(5);

    // All L-shaped cells replaced
    expect(map.getCellGid(0, 0, 0)).toBe(9);
    expect(map.getCellGid(0, 0, 1)).toBe(9);
    expect(map.getCellGid(0, 0, 2)).toBe(9);
    expect(map.getCellGid(0, 1, 2)).toBe(9);
    expect(map.getCellGid(0, 2, 2)).toBe(9);

    // Non-L-shaped cells (GID 0) remain untouched
    expect(map.getCellGid(0, 1, 0)).toBe(0);
    expect(map.getCellGid(0, 2, 0)).toBe(0);
    expect(map.getCellGid(0, 1, 1)).toBe(0);
    expect(map.getCellGid(0, 2, 1)).toBe(0);
  });

  it('returns null when filling with the same GID (no-op)', () => {
    const map = makeMap({ width: 3, height: 3 });
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        map.setCellGid(0, c, r, 5);
      }
    }

    // selectedGid matches the target GID — nothing to do
    const state = makeState({ activeTool: 'fill', selectedGid: 5 });
    const event = makeEvent({ col: 1, row: 1 });

    const cmd = fill(event, state, map);

    expect(cmd).toBeNull();
    // Map is unchanged
    expect(map.getCellGid(0, 1, 1)).toBe(5);
  });

  it('diagonal cells are NOT connected (4-directional only)', () => {
    // 3x3 map. GID 2 only at corners: (0,0), (2,0), (0,2), (2,2).
    // Center (1,1) has GID 0. Filling from (0,0) with GID 9 should only
    // change (0,0) because no cardinal neighbour of (0,0) has GID 2.
    const map = makeMap({ width: 3, height: 3 });
    map.setCellGid(0, 0, 0, 2);
    map.setCellGid(0, 2, 0, 2);
    map.setCellGid(0, 0, 2, 2);
    map.setCellGid(0, 2, 2, 2);
    // All other cells remain GID 0

    const state = makeState({ activeTool: 'fill', selectedGid: 9 });
    const event = makeEvent({ col: 0, row: 0 });

    const cmd = fill(event, state, map);

    expect(cmd).not.toBeNull();
    // Only (0,0) — the diagonally connected corners are NOT reached
    expect(cmd!.edits).toHaveLength(1);
    expect(cmd!.edits[0].col).toBe(0);
    expect(cmd!.edits[0].row).toBe(0);

    expect(map.getCellGid(0, 0, 0)).toBe(9);  // Filled
    expect(map.getCellGid(0, 2, 0)).toBe(2);  // NOT filled (diagonal)
    expect(map.getCellGid(0, 0, 2)).toBe(2);  // NOT filled (diagonal)
    expect(map.getCellGid(0, 2, 2)).toBe(2);  // NOT filled (diagonal)
  });

  it('returns null for out-of-bounds starting cell', () => {
    const map = makeMap({ width: 5, height: 5 });
    const state = makeState({ activeTool: 'fill', selectedGid: 3 });

    expect(fill(makeEvent({ col: -1, row: 0 }), state, map)).toBeNull();
    expect(fill(makeEvent({ col: 5, row: 0 }), state, map)).toBeNull();
    expect(fill(makeEvent({ col: 0, row: -1 }), state, map)).toBeNull();
    expect(fill(makeEvent({ col: 0, row: 5 }), state, map)).toBeNull();

    // Map must not be mutated
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        expect(map.getCellGid(0, c, r)).toBe(0);
      }
    }
  });

  it('returns null when selectedGid is 0', () => {
    const map = makeMap({ width: 3, height: 3 });
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        map.setCellGid(0, c, r, 5);
      }
    }

    const state = makeState({ activeTool: 'fill', selectedGid: 0 });
    const event = makeEvent({ col: 1, row: 1 });

    const cmd = fill(event, state, map);

    expect(cmd).toBeNull();
    // Map must not be mutated
    expect(map.getCellGid(0, 1, 1)).toBe(5);
  });

  it('bounded fill works correctly on a small fully-connected map', () => {
    // 5x5 map, all GID 1. Fill from (2,2) with GID 7.
    // All 25 cells are well under the 10 000 cell limit, so entire map fills.
    const map = makeMap({ width: 5, height: 5 });
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        map.setCellGid(0, c, r, 1);
      }
    }

    const state = makeState({ activeTool: 'fill', selectedGid: 7 });
    const event = makeEvent({ col: 2, row: 2 });

    const cmd = fill(event, state, map);

    expect(cmd).not.toBeNull();
    expect(cmd!.edits).toHaveLength(25);

    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        expect(map.getCellGid(0, c, r)).toBe(7);
      }
    }
  });

  it('command undo restores all original GIDs', () => {
    // 3x3 map, all GID 4. Fill entire map with GID 11, then undo.
    const map = makeMap({ width: 3, height: 3 });
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        map.setCellGid(0, c, r, 4);
      }
    }

    const state = makeState({ activeTool: 'fill', selectedGid: 11 });
    const event = makeEvent({ col: 0, row: 0 });

    const cmd = fill(event, state, map);

    expect(cmd).not.toBeNull();
    expect(cmd!.edits).toHaveLength(9);

    // After fill, all cells are GID 11
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        expect(map.getCellGid(0, c, r)).toBe(11);
      }
    }

    // Simulate undo: restore each oldGid
    for (const edit of cmd!.edits) {
      map.setCellGid(edit.layerIndex, edit.col, edit.row, edit.oldGid);
    }

    // All cells restored to original GID 4
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        expect(map.getCellGid(0, c, r)).toBe(4);
      }
    }
  });

  it('only triggers on down events — returns null for move and up', () => {
    const map = makeMap({ width: 3, height: 3 });
    const state = makeState({ activeTool: 'fill', selectedGid: 5 });

    const moveCmd = fill(makeEvent({ type: 'move', col: 1, row: 1 }), state, map);
    const upCmd = fill(makeEvent({ type: 'up', col: 1, row: 1 }), state, map);

    expect(moveCmd).toBeNull();
    expect(upCmd).toBeNull();

    // Map must not be mutated
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        expect(map.getCellGid(0, c, r)).toBe(0);
      }
    }
  });

  it('command type is "paint"', () => {
    const map = makeMap({ width: 2, height: 2 });
    const state = makeState({ activeTool: 'fill', selectedGid: 3 });
    const event = makeEvent({ col: 0, row: 0 });

    const cmd = fill(event, state, map);

    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe('paint');
  });
});

// ── Dispatch ──────────────────────────────────────────────────────────

describe('dispatch', () => {
  it('routes to brush strategy when activeTool is "brush"', () => {
    const map = makeMap();
    const state = makeState({ activeTool: 'brush', selectedGid: 7 });
    const event = makeEvent({ col: 2, row: 3 });

    const cmd = dispatch(event, state, map);

    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe('paint');
    expect(cmd!.edits[0].newGid).toBe(7);
    expect(map.getCellGid(0, 2, 3)).toBe(7);
  });

  it('routes to eyedropper strategy when activeTool is "eyedropper"', () => {
    const map = makeMap();
    map.setCellGid(0, 1, 1, 55);

    const onEyedrop = vi.fn();
    const state = makeState({ activeTool: 'eyedropper', onEyedrop });
    const event = makeEvent({ type: 'down', col: 1, row: 1 });

    const cmd = dispatch(event, state, map);

    expect(cmd).toBeNull();
    expect(onEyedrop).toHaveBeenCalledWith(55);
    expect(map.getCellGid(0, 1, 1)).toBe(55); // No mutation
  });

  it('returns null for unknown tool', () => {
    const map = makeMap();
    const state = makeState({ activeTool: 'unknown-tool', selectedGid: 5 });
    const event = makeEvent({ col: 0, row: 0 });

    const cmd = dispatch(event, state, map);

    expect(cmd).toBeNull();
    expect(map.getCellGid(0, 0, 0)).toBe(0); // No mutation
  });
});

// ── Stamp brush tests (#54, #56) ─────────────────────────────────────

describe('brush with stamp', () => {
  it('paints a 2x2 stamp as a single batch command', () => {
    const map = makeMap({ width: 10, height: 8 });
    const stamp = { width: 2, height: 2, gids: [1, 2, 3, 4] };
    const state = makeState({ selectedGid: 1, stamp });
    const event = makeEvent({ col: 1, row: 1 });

    const cmd = brush(event, state, map);

    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe('paint');
    if (cmd!.type === 'paint') {
      expect(cmd!.edits).toHaveLength(4);
      expect(map.getCellGid(0, 1, 1)).toBe(1);
      expect(map.getCellGid(0, 2, 1)).toBe(2);
      expect(map.getCellGid(0, 1, 2)).toBe(3);
      expect(map.getCellGid(0, 2, 2)).toBe(4);
    }
  });

  it('clips stamp that extends beyond right edge', () => {
    const map = makeMap({ width: 4, height: 4 });
    const stamp = { width: 3, height: 1, gids: [1, 2, 3] };
    const state = makeState({ selectedGid: 1, stamp });
    const event = makeEvent({ col: 2, row: 0 }); // col 2 + width 3 = 5 > 4

    const cmd = brush(event, state, map);

    expect(cmd).not.toBeNull();
    if (cmd!.type === 'paint') {
      // Only cols 2 and 3 are within bounds
      expect(cmd!.edits).toHaveLength(2);
      expect(map.getCellGid(0, 2, 0)).toBe(1);
      expect(map.getCellGid(0, 3, 0)).toBe(2);
    }
  });

  it('clips stamp that extends beyond bottom edge', () => {
    const map = makeMap({ width: 4, height: 4 });
    const stamp = { width: 1, height: 3, gids: [1, 2, 3] };
    const state = makeState({ selectedGid: 1, stamp });
    const event = makeEvent({ col: 0, row: 2 }); // row 2 + height 3 = 5 > 4

    const cmd = brush(event, state, map);

    expect(cmd).not.toBeNull();
    if (cmd!.type === 'paint') {
      expect(cmd!.edits).toHaveLength(2);
      expect(map.getCellGid(0, 0, 2)).toBe(1);
      expect(map.getCellGid(0, 0, 3)).toBe(2);
    }
  });

  it('clips stamp that extends beyond both corners', () => {
    const map = makeMap({ width: 3, height: 3 });
    const stamp = { width: 2, height: 2, gids: [1, 2, 3, 4] };
    const state = makeState({ selectedGid: 1, stamp });
    const event = makeEvent({ col: 2, row: 2 }); // only (2,2) is in bounds

    const cmd = brush(event, state, map);

    expect(cmd).not.toBeNull();
    if (cmd!.type === 'paint') {
      expect(cmd!.edits).toHaveLength(1);
      expect(map.getCellGid(0, 2, 2)).toBe(1);
    }
  });

  it('skips GID 0 entries in the stamp (transparent)', () => {
    const map = makeMap({ width: 4, height: 4 });
    const stamp = { width: 2, height: 2, gids: [1, 0, 0, 4] };
    const state = makeState({ selectedGid: 1, stamp });
    const event = makeEvent({ col: 0, row: 0 });

    const cmd = brush(event, state, map);

    expect(cmd).not.toBeNull();
    if (cmd!.type === 'paint') {
      expect(cmd!.edits).toHaveLength(2);
      expect(map.getCellGid(0, 0, 0)).toBe(1);
      expect(map.getCellGid(0, 1, 0)).toBe(0); // skipped (transparent)
      expect(map.getCellGid(0, 0, 1)).toBe(0); // skipped (transparent)
      expect(map.getCellGid(0, 1, 1)).toBe(4);
    }
  });

  it('returns null on pointer up', () => {
    const stamp = { width: 2, height: 2, gids: [1, 2, 3, 4] };
    const state = makeState({ selectedGid: 1, stamp });
    const event = makeEvent({ type: 'up', col: 0, row: 0 });

    const cmd = brush(event, state, makeMap());
    expect(cmd).toBeNull();
  });

  it('returns null when all stamp cells match existing values', () => {
    const map = makeMap({ width: 4, height: 4 });
    // Pre-paint the cells
    map.setCellGid(0, 0, 0, 1);
    map.setCellGid(0, 1, 0, 2);

    const stamp = { width: 2, height: 1, gids: [1, 2] };
    const state = makeState({ selectedGid: 1, stamp });
    const event = makeEvent({ col: 0, row: 0 });

    const cmd = brush(event, state, map);
    expect(cmd).toBeNull();
  });

  it('records correct oldGid values for undo', () => {
    const map = makeMap({ width: 4, height: 4 });
    map.setCellGid(0, 0, 0, 99);
    map.setCellGid(0, 1, 0, 88);

    const stamp = { width: 2, height: 1, gids: [1, 2] };
    const state = makeState({ selectedGid: 1, stamp });
    const event = makeEvent({ col: 0, row: 0 });

    const cmd = brush(event, state, map);

    expect(cmd).not.toBeNull();
    if (cmd!.type === 'paint') {
      expect(cmd!.edits[0].oldGid).toBe(99);
      expect(cmd!.edits[1].oldGid).toBe(88);
    }
  });

  it('works with pointer move events (drag)', () => {
    const map = makeMap({ width: 4, height: 4 });
    const stamp = { width: 2, height: 1, gids: [1, 2] };
    const state = makeState({ selectedGid: 1, stamp });
    const event = makeEvent({ type: 'move', col: 0, row: 0 });

    const cmd = brush(event, state, map);

    expect(cmd).not.toBeNull();
    if (cmd!.type === 'paint') {
      expect(cmd!.edits).toHaveLength(2);
    }
  });
});
