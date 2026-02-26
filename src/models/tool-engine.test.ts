import { describe, it, expect } from 'vitest';
import { TilemapModel } from './tilemap-model.js';
import {
  brush,
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

  it('returns null for unknown tool', () => {
    const map = makeMap();
    const state = makeState({ activeTool: 'unknown-tool', selectedGid: 5 });
    const event = makeEvent({ col: 0, row: 0 });

    const cmd = dispatch(event, state, map);

    expect(cmd).toBeNull();
    expect(map.getCellGid(0, 0, 0)).toBe(0); // No mutation
  });
});
