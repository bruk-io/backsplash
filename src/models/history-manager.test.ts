import { describe, it, expect, vi } from 'vitest';
import {
  HistoryManager,
  estimateCommandBytes,
} from './history-manager.js';
import type {
  Command,
  PaintCommand,
  CellEdit,
  AddLayerCommand,
  DeleteLayerCommand,
  ReorderLayerCommand,
  RenameLayerCommand,
  AddObjectCommand,
  DeleteObjectCommand,
  MoveObjectCommand,
  EditObjectCommand,
} from './tool-engine.js';
import { TilemapModel } from './tilemap-model.js';
import {
  createTileLayer,
  createObjectLayer,
  addObject,
  type MapObject,
  type ObjectLayer,
} from './layer-model.js';

// ── Helpers ─────────────────────────────────────────────────────────

/** Create a mock TilemapModel that records setCellGid calls. */
function mockTilemap(): TilemapModel & { calls: [number, number, number, number][] } {
  const calls: [number, number, number, number][] = [];
  return {
    calls,
    setCellGid(layerIndex: number, col: number, row: number, gid: number) {
      calls.push([layerIndex, col, row, gid]);
    },
  } as TilemapModel & { calls: [number, number, number, number][] };
}

/** Create a PaintCommand with the given edits. */
function paintCommand(edits: CellEdit[]): PaintCommand {
  return { type: 'paint', edits };
}

/** Create a single CellEdit. */
function cellEdit(
  layerIndex: number,
  col: number,
  row: number,
  oldGid: number,
  newGid: number,
): CellEdit {
  return { layerIndex, col, row, oldGid, newGid };
}

/** Create a PaintCommand with N edits for size testing. */
function bigPaintCommand(editCount: number): PaintCommand {
  const edits: CellEdit[] = [];
  for (let i = 0; i < editCount; i++) {
    edits.push(cellEdit(0, i % 100, Math.floor(i / 100), 0, i + 1));
  }
  return paintCommand(edits);
}

// ── estimateCommandBytes ────────────────────────────────────────────

describe('estimateCommandBytes', () => {
  it('returns 16 bytes per CellEdit for paint commands', () => {
    const cmd = paintCommand([cellEdit(0, 0, 0, 0, 1)]);
    expect(estimateCommandBytes(cmd)).toBe(16);
  });

  it('scales linearly with edit count', () => {
    const cmd = paintCommand([
      cellEdit(0, 0, 0, 0, 1),
      cellEdit(0, 1, 0, 0, 2),
      cellEdit(0, 2, 0, 0, 3),
    ]);
    expect(estimateCommandBytes(cmd)).toBe(48);
  });

  it('returns 0 for empty edits array', () => {
    const cmd = paintCommand([]);
    expect(estimateCommandBytes(cmd)).toBe(0);
  });
});

// ── Constructor ─────────────────────────────────────────────────────

describe('HistoryManager — constructor', () => {
  it('starts with empty stacks', () => {
    const hm = new HistoryManager();
    expect(hm.canUndo).toBe(false);
    expect(hm.canRedo).toBe(false);
    expect(hm.undoCount).toBe(0);
    expect(hm.redoCount).toBe(0);
  });

  it('accepts custom maxCommands and maxBytes', () => {
    const hm = new HistoryManager({ maxCommands: 5, maxBytes: 256 });
    // No public getter for limits, but we can verify behaviour below
    expect(hm.undoCount).toBe(0);
  });
});

// ── Push ────────────────────────────────────────────────────────────

describe('HistoryManager — push', () => {
  it('adds commands to the undo stack', () => {
    const hm = new HistoryManager();
    hm.push(paintCommand([cellEdit(0, 0, 0, 0, 1)]));
    expect(hm.undoCount).toBe(1);
    expect(hm.canUndo).toBe(true);
  });

  it('clears the redo stack on push', () => {
    const hm = new HistoryManager();
    const tilemap = mockTilemap();

    hm.push(paintCommand([cellEdit(0, 0, 0, 0, 1)]));
    hm.push(paintCommand([cellEdit(0, 1, 0, 0, 2)]));
    hm.undo(tilemap);
    expect(hm.canRedo).toBe(true);

    hm.push(paintCommand([cellEdit(0, 2, 0, 0, 3)]));
    expect(hm.canRedo).toBe(false);
    expect(hm.redoCount).toBe(0);
  });

  it('tracks undo byte size', () => {
    const hm = new HistoryManager();
    hm.push(paintCommand([cellEdit(0, 0, 0, 0, 1)])); // 16 bytes
    expect(hm.undoBytes).toBe(16);

    hm.push(paintCommand([cellEdit(0, 1, 0, 0, 2), cellEdit(0, 2, 0, 0, 3)])); // 32 bytes
    expect(hm.undoBytes).toBe(48);
  });
});

// ── Undo / Redo correctness ─────────────────────────────────────────

describe('HistoryManager — undo/redo correctness', () => {
  it('push 3, undo 2, redo 1 yields correct stack counts', () => {
    const hm = new HistoryManager();
    const tilemap = mockTilemap();

    const cmd1 = paintCommand([cellEdit(0, 0, 0, 0, 1)]);
    const cmd2 = paintCommand([cellEdit(0, 1, 0, 0, 2)]);
    const cmd3 = paintCommand([cellEdit(0, 2, 0, 0, 3)]);

    hm.push(cmd1);
    hm.push(cmd2);
    hm.push(cmd3);
    expect(hm.undoCount).toBe(3);

    hm.undo(tilemap); // undo cmd3
    expect(hm.undoCount).toBe(2);
    expect(hm.redoCount).toBe(1);

    hm.undo(tilemap); // undo cmd2
    expect(hm.undoCount).toBe(1);
    expect(hm.redoCount).toBe(2);

    hm.redo(tilemap); // redo cmd2
    expect(hm.undoCount).toBe(2);
    expect(hm.redoCount).toBe(1);
  });

  it('undo applies oldGid in reverse edit order', () => {
    const hm = new HistoryManager();
    const tilemap = mockTilemap();

    const cmd = paintCommand([
      cellEdit(0, 0, 0, 10, 20),
      cellEdit(0, 1, 0, 30, 40),
    ]);
    hm.push(cmd);
    hm.undo(tilemap);

    // Reverse order: second edit undone first, then first
    expect(tilemap.calls).toEqual([
      [0, 1, 0, 30], // restore second edit's oldGid
      [0, 0, 0, 10], // restore first edit's oldGid
    ]);
  });

  it('redo applies newGid in forward edit order', () => {
    const hm = new HistoryManager();
    const tilemap = mockTilemap();

    const cmd = paintCommand([
      cellEdit(0, 0, 0, 10, 20),
      cellEdit(0, 1, 0, 30, 40),
    ]);
    hm.push(cmd);
    hm.undo(tilemap);
    tilemap.calls.length = 0; // clear undo calls

    hm.redo(tilemap);
    expect(tilemap.calls).toEqual([
      [0, 0, 0, 20], // apply first edit's newGid
      [0, 1, 0, 40], // apply second edit's newGid
    ]);
  });
});

// ── Empty stack edge cases ──────────────────────────────────────────

describe('HistoryManager — empty stack edge cases', () => {
  it('undo on empty stack is a no-op', () => {
    const hm = new HistoryManager();
    const tilemap = mockTilemap();

    hm.undo(tilemap);
    expect(hm.undoCount).toBe(0);
    expect(hm.redoCount).toBe(0);
    expect(tilemap.calls).toHaveLength(0);
  });

  it('redo on empty stack is a no-op', () => {
    const hm = new HistoryManager();
    const tilemap = mockTilemap();

    hm.redo(tilemap);
    expect(hm.undoCount).toBe(0);
    expect(hm.redoCount).toBe(0);
    expect(tilemap.calls).toHaveLength(0);
  });
});

// ── Stack overflow (maxCommands) ────────────────────────────────────

describe('HistoryManager — maxCommands bounding', () => {
  it('drops oldest commands when exceeding maxCommands', () => {
    const hm = new HistoryManager({ maxCommands: 3 });

    hm.push(paintCommand([cellEdit(0, 0, 0, 0, 1)])); // cmd1
    hm.push(paintCommand([cellEdit(0, 1, 0, 0, 2)])); // cmd2
    hm.push(paintCommand([cellEdit(0, 2, 0, 0, 3)])); // cmd3
    expect(hm.undoCount).toBe(3);

    hm.push(paintCommand([cellEdit(0, 3, 0, 0, 4)])); // cmd4 — cmd1 dropped
    expect(hm.undoCount).toBe(3);

    // Undo all 3 remaining: should be cmd4, cmd3, cmd2 (not cmd1)
    const tilemap = mockTilemap();
    hm.undo(tilemap); // undo cmd4
    hm.undo(tilemap); // undo cmd3
    hm.undo(tilemap); // undo cmd2
    expect(hm.undoCount).toBe(0);

    // Verify cmd2 was the oldest (col=1 -> oldGid=0)
    // Last undo call should be for col=1
    const lastCall = tilemap.calls[tilemap.calls.length - 1];
    expect(lastCall[1]).toBe(1); // col from cmd2
  });
});

// ── Byte-size bounding ──────────────────────────────────────────────

describe('HistoryManager — maxBytes bounding', () => {
  it('drops oldest commands when exceeding maxBytes', () => {
    // Each single-edit command is 16 bytes. Max 48 bytes = 3 commands.
    const hm = new HistoryManager({ maxCommands: 1000, maxBytes: 48 });

    hm.push(paintCommand([cellEdit(0, 0, 0, 0, 1)])); // 16 bytes
    hm.push(paintCommand([cellEdit(0, 1, 0, 0, 2)])); // 32 bytes total
    hm.push(paintCommand([cellEdit(0, 2, 0, 0, 3)])); // 48 bytes total
    expect(hm.undoCount).toBe(3);
    expect(hm.undoBytes).toBe(48);

    hm.push(paintCommand([cellEdit(0, 3, 0, 0, 4)])); // 64 would exceed -> drops oldest
    expect(hm.undoCount).toBe(3);
    expect(hm.undoBytes).toBe(48);
  });

  it('drops multiple oldest commands for one large command', () => {
    // Max 48 bytes. Push 3 small (16 each = 48), then one with 3 edits (48 bytes).
    const hm = new HistoryManager({ maxCommands: 1000, maxBytes: 48 });

    hm.push(paintCommand([cellEdit(0, 0, 0, 0, 1)])); // 16
    hm.push(paintCommand([cellEdit(0, 1, 0, 0, 2)])); // 32
    hm.push(paintCommand([cellEdit(0, 2, 0, 0, 3)])); // 48

    // Push a 48-byte command — must drop all 3 existing to make room
    hm.push(bigPaintCommand(3)); // 48 bytes
    expect(hm.undoCount).toBe(1);
    expect(hm.undoBytes).toBe(48);
  });

  it('tracks byte size correctly after undo and redo', () => {
    const hm = new HistoryManager();
    const tilemap = mockTilemap();

    hm.push(paintCommand([cellEdit(0, 0, 0, 0, 1)])); // 16 bytes
    hm.push(paintCommand([cellEdit(0, 1, 0, 0, 2), cellEdit(0, 2, 0, 0, 3)])); // 32 bytes
    expect(hm.undoBytes).toBe(48);
    expect(hm.redoBytes).toBe(0);

    hm.undo(tilemap); // move 32-byte cmd to redo
    expect(hm.undoBytes).toBe(16);
    expect(hm.redoBytes).toBe(32);

    hm.redo(tilemap); // move back
    expect(hm.undoBytes).toBe(48);
    expect(hm.redoBytes).toBe(0);
  });
});

// ── Redo cleared on new action ──────────────────────────────────────

describe('HistoryManager — redo cleared on new action', () => {
  it('clears redo stack and byte count when a new command is pushed', () => {
    const hm = new HistoryManager();
    const tilemap = mockTilemap();

    hm.push(paintCommand([cellEdit(0, 0, 0, 0, 1)]));
    hm.push(paintCommand([cellEdit(0, 1, 0, 0, 2)]));

    hm.undo(tilemap);
    hm.undo(tilemap);
    expect(hm.redoCount).toBe(2);
    expect(hm.redoBytes).toBe(32);

    hm.push(paintCommand([cellEdit(0, 5, 0, 0, 10)]));
    expect(hm.redoCount).toBe(0);
    expect(hm.redoBytes).toBe(0);
    expect(hm.undoCount).toBe(1);
  });
});

// ── clear() ─────────────────────────────────────────────────────────

describe('HistoryManager — clear', () => {
  it('resets both stacks and byte counts', () => {
    const hm = new HistoryManager();
    const tilemap = mockTilemap();

    hm.push(paintCommand([cellEdit(0, 0, 0, 0, 1)]));
    hm.push(paintCommand([cellEdit(0, 1, 0, 0, 2)]));
    hm.undo(tilemap);

    expect(hm.undoCount).toBe(1);
    expect(hm.redoCount).toBe(1);

    hm.clear();

    expect(hm.undoCount).toBe(0);
    expect(hm.redoCount).toBe(0);
    expect(hm.undoBytes).toBe(0);
    expect(hm.redoBytes).toBe(0);
    expect(hm.canUndo).toBe(false);
    expect(hm.canRedo).toBe(false);
  });
});

// ── canUndo / canRedo accuracy ──────────────────────────────────────

describe('HistoryManager — canUndo / canRedo getters', () => {
  it('canUndo is true only when undo stack is non-empty', () => {
    const hm = new HistoryManager();
    const tilemap = mockTilemap();

    expect(hm.canUndo).toBe(false);

    hm.push(paintCommand([cellEdit(0, 0, 0, 0, 1)]));
    expect(hm.canUndo).toBe(true);

    hm.undo(tilemap);
    expect(hm.canUndo).toBe(false);
  });

  it('canRedo is true only when redo stack is non-empty', () => {
    const hm = new HistoryManager();
    const tilemap = mockTilemap();

    expect(hm.canRedo).toBe(false);

    hm.push(paintCommand([cellEdit(0, 0, 0, 0, 1)]));
    expect(hm.canRedo).toBe(false);

    hm.undo(tilemap);
    expect(hm.canRedo).toBe(true);

    hm.redo(tilemap);
    expect(hm.canRedo).toBe(false);
  });
});

// ── history-change event ────────────────────────────────────────────

describe('HistoryManager — history-change event', () => {
  it('dispatches on push', () => {
    const hm = new HistoryManager();
    const listener = vi.fn();
    hm.addEventListener('history-change', listener);

    hm.push(paintCommand([cellEdit(0, 0, 0, 0, 1)]));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('dispatches on undo', () => {
    const hm = new HistoryManager();
    const tilemap = mockTilemap();
    hm.push(paintCommand([cellEdit(0, 0, 0, 0, 1)]));

    const listener = vi.fn();
    hm.addEventListener('history-change', listener);

    hm.undo(tilemap);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('dispatches on redo', () => {
    const hm = new HistoryManager();
    const tilemap = mockTilemap();
    hm.push(paintCommand([cellEdit(0, 0, 0, 0, 1)]));
    hm.undo(tilemap);

    const listener = vi.fn();
    hm.addEventListener('history-change', listener);

    hm.redo(tilemap);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('dispatches on clear', () => {
    const hm = new HistoryManager();
    hm.push(paintCommand([cellEdit(0, 0, 0, 0, 1)]));

    const listener = vi.fn();
    hm.addEventListener('history-change', listener);

    hm.clear();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not dispatch on no-op undo (empty stack)', () => {
    const hm = new HistoryManager();
    const tilemap = mockTilemap();
    const listener = vi.fn();
    hm.addEventListener('history-change', listener);

    hm.undo(tilemap);
    expect(listener).not.toHaveBeenCalled();
  });

  it('does not dispatch on no-op redo (empty stack)', () => {
    const hm = new HistoryManager();
    const tilemap = mockTilemap();
    const listener = vi.fn();
    hm.addEventListener('history-change', listener);

    hm.redo(tilemap);
    expect(listener).not.toHaveBeenCalled();
  });
});

// ── Layer command helpers ────────────────────────────────────────────

/** Create a real TilemapModel with the given number of tile layers. */
function tilemapWithLayers(count: number): TilemapModel {
  // TilemapModel always starts with one default layer; add more if needed.
  const tm = new TilemapModel({ width: 4, height: 4, tileWidth: 16, tileHeight: 16 });
  for (let i = 1; i < count; i++) {
    tm.addLayer(createTileLayer(`Layer ${i + 1}`, 4, 4));
  }
  return tm;
}

// ── estimateCommandBytes — layer commands ────────────────────────────

describe('estimateCommandBytes — layer commands', () => {
  it('add-layer with tile layer returns data.byteLength', () => {
    const layer = createTileLayer('L', 4, 4); // 16 cells × 4 bytes = 64
    const cmd: AddLayerCommand = { type: 'add-layer', layerIndex: 1, layer };
    expect(estimateCommandBytes(cmd)).toBe(64);
  });

  it('add-layer with object layer returns 100', () => {
    const layer = createObjectLayer('O');
    const cmd: AddLayerCommand = { type: 'add-layer', layerIndex: 0, layer };
    expect(estimateCommandBytes(cmd)).toBe(100);
  });

  it('delete-layer with tile layer returns data.byteLength', () => {
    const layer = createTileLayer('L', 8, 8); // 64 cells × 4 bytes = 256
    const cmd: DeleteLayerCommand = { type: 'delete-layer', layerIndex: 0, layer };
    expect(estimateCommandBytes(cmd)).toBe(256);
  });

  it('delete-layer with object layer returns 100', () => {
    const layer = createObjectLayer('O');
    const cmd: DeleteLayerCommand = { type: 'delete-layer', layerIndex: 0, layer };
    expect(estimateCommandBytes(cmd)).toBe(100);
  });

  it('reorder-layer returns 16', () => {
    const cmd: ReorderLayerCommand = { type: 'reorder-layer', fromIndex: 0, toIndex: 2 };
    expect(estimateCommandBytes(cmd)).toBe(16);
  });

  it('rename-layer returns sum of name lengths', () => {
    const cmd: RenameLayerCommand = {
      type: 'rename-layer',
      layerIndex: 0,
      oldName: 'Background', // 10 chars
      newName: 'BG',         // 2 chars
    };
    expect(estimateCommandBytes(cmd)).toBe(12);
  });
});

// ── AddLayerCommand ──────────────────────────────────────────────────

describe('HistoryManager — add-layer undo/redo', () => {
  it('undo removes the added layer', () => {
    const tilemap = tilemapWithLayers(1); // starts with 1 layer
    const hm = new HistoryManager();

    const newLayer = createTileLayer('Layer 2', 4, 4);
    tilemap.addLayer(newLayer);
    expect(tilemap.layers.length).toBe(2);

    const cmd: AddLayerCommand = { type: 'add-layer', layerIndex: 1, layer: newLayer };
    hm.push(cmd);
    hm.undo(tilemap);

    expect(tilemap.layers.length).toBe(1);
    expect(tilemap.layers[0]!.name).toBe('Layer 1');
  });

  it('redo re-adds the layer at the correct index', () => {
    const tilemap = tilemapWithLayers(1);
    const hm = new HistoryManager();

    const newLayer = createTileLayer('Layer 2', 4, 4);
    tilemap.addLayer(newLayer);

    const cmd: AddLayerCommand = { type: 'add-layer', layerIndex: 1, layer: newLayer };
    hm.push(cmd);
    hm.undo(tilemap);
    expect(tilemap.layers.length).toBe(1);

    hm.redo(tilemap);
    expect(tilemap.layers.length).toBe(2);
    expect(tilemap.layers[1]!.name).toBe('Layer 2');
  });

  it('redo inserts layer at correct position (not just appended)', () => {
    const tilemap = tilemapWithLayers(3); // layers 1, 2, 3
    const hm = new HistoryManager();

    // Simulate adding a layer at index 1 (between 1 and 2)
    const newLayer = createTileLayer('Inserted', 4, 4);
    tilemap.addLayer(newLayer);           // appended at index 3
    tilemap.moveLayer(3, 1);              // move to index 1
    expect(tilemap.layers[1]!.name).toBe('Inserted');

    const cmd: AddLayerCommand = { type: 'add-layer', layerIndex: 1, layer: newLayer };
    hm.push(cmd);
    hm.undo(tilemap); // removes index 1
    expect(tilemap.layers.length).toBe(3);
    expect(tilemap.layers[1]!.name).toBe('Layer 2');

    hm.redo(tilemap); // re-inserts at index 1
    expect(tilemap.layers.length).toBe(4);
    expect(tilemap.layers[1]!.name).toBe('Inserted');
  });
});

// ── DeleteLayerCommand ───────────────────────────────────────────────

describe('HistoryManager — delete-layer undo/redo', () => {
  it('undo re-inserts the deleted layer at original index', () => {
    const tilemap = tilemapWithLayers(2); // Layer 1, Layer 2
    const hm = new HistoryManager();

    const deleted = tilemap.layers[0]!;
    tilemap.removeLayer(0);
    expect(tilemap.layers.length).toBe(1);
    expect(tilemap.layers[0]!.name).toBe('Layer 2');

    const cmd: DeleteLayerCommand = { type: 'delete-layer', layerIndex: 0, layer: deleted };
    hm.push(cmd);
    hm.undo(tilemap);

    expect(tilemap.layers.length).toBe(2);
    expect(tilemap.layers[0]!.name).toBe('Layer 1');
    expect(tilemap.layers[1]!.name).toBe('Layer 2');
  });

  it('redo removes the layer again', () => {
    const tilemap = tilemapWithLayers(2);
    const hm = new HistoryManager();

    const deleted = tilemap.layers[1]!;
    tilemap.removeLayer(1);

    const cmd: DeleteLayerCommand = { type: 'delete-layer', layerIndex: 1, layer: deleted };
    hm.push(cmd);
    hm.undo(tilemap);
    expect(tilemap.layers.length).toBe(2);

    hm.redo(tilemap);
    expect(tilemap.layers.length).toBe(1);
    expect(tilemap.layers[0]!.name).toBe('Layer 1');
  });

  it('restores full layer data (tile data is preserved) on undo', () => {
    const tilemap = tilemapWithLayers(2);
    const hm = new HistoryManager();

    // Paint a cell on layer 0 so it has non-zero data
    tilemap.setCellGid(0, 0, 0, 42);

    const deleted = tilemap.removeLayer(0)!;
    const cmd: DeleteLayerCommand = { type: 'delete-layer', layerIndex: 0, layer: deleted };
    hm.push(cmd);
    hm.undo(tilemap);

    expect(tilemap.getCellGid(0, 0, 0)).toBe(42);
  });
});

// ── ReorderLayerCommand ──────────────────────────────────────────────

describe('HistoryManager — reorder-layer undo/redo', () => {
  it('undo reverses the move', () => {
    const tilemap = tilemapWithLayers(3); // Layer 1, Layer 2, Layer 3
    const hm = new HistoryManager();

    tilemap.moveLayer(0, 2); // move Layer 1 to index 2
    expect(tilemap.layers[0]!.name).toBe('Layer 2');
    expect(tilemap.layers[2]!.name).toBe('Layer 1');

    const cmd: ReorderLayerCommand = { type: 'reorder-layer', fromIndex: 0, toIndex: 2 };
    hm.push(cmd);
    hm.undo(tilemap);

    expect(tilemap.layers[0]!.name).toBe('Layer 1');
    expect(tilemap.layers[2]!.name).toBe('Layer 3');
  });

  it('redo re-applies the move', () => {
    const tilemap = tilemapWithLayers(3);
    const hm = new HistoryManager();

    tilemap.moveLayer(0, 2);
    const cmd: ReorderLayerCommand = { type: 'reorder-layer', fromIndex: 0, toIndex: 2 };
    hm.push(cmd);

    hm.undo(tilemap);
    expect(tilemap.layers[0]!.name).toBe('Layer 1');

    hm.redo(tilemap);
    expect(tilemap.layers[0]!.name).toBe('Layer 2');
    expect(tilemap.layers[2]!.name).toBe('Layer 1');
  });
});

// ── RenameLayerCommand ───────────────────────────────────────────────

describe('HistoryManager — rename-layer undo/redo', () => {
  it('undo restores the old name', () => {
    const tilemap = tilemapWithLayers(1);
    const hm = new HistoryManager();

    // Apply the rename manually first
    tilemap.replaceLayer(0, { ...tilemap.layers[0]!, name: 'Background' });
    expect(tilemap.layers[0]!.name).toBe('Background');

    const cmd: RenameLayerCommand = {
      type: 'rename-layer',
      layerIndex: 0,
      oldName: 'Layer 1',
      newName: 'Background',
    };
    hm.push(cmd);
    hm.undo(tilemap);

    expect(tilemap.layers[0]!.name).toBe('Layer 1');
  });

  it('redo re-applies the new name', () => {
    const tilemap = tilemapWithLayers(1);
    const hm = new HistoryManager();

    tilemap.replaceLayer(0, { ...tilemap.layers[0]!, name: 'Background' });

    const cmd: RenameLayerCommand = {
      type: 'rename-layer',
      layerIndex: 0,
      oldName: 'Layer 1',
      newName: 'Background',
    };
    hm.push(cmd);
    hm.undo(tilemap);
    expect(tilemap.layers[0]!.name).toBe('Layer 1');

    hm.redo(tilemap);
    expect(tilemap.layers[0]!.name).toBe('Background');
  });

  it('undo on out-of-range index is a no-op', () => {
    const tilemap = tilemapWithLayers(1);
    const hm = new HistoryManager();

    const cmd: RenameLayerCommand = {
      type: 'rename-layer',
      layerIndex: 99,
      oldName: 'Old',
      newName: 'New',
    };
    hm.push(cmd);
    // Should not throw
    expect(() => hm.undo(tilemap)).not.toThrow();
    expect(tilemap.layers.length).toBe(1);
  });
});

// ── Rapid cycling ───────────────────────────────────────────────────

describe('HistoryManager — rapid undo/redo cycling', () => {
  it('handles 1000 push/undo/redo cycles without error', () => {
    const hm = new HistoryManager();
    const tilemap = mockTilemap();

    // Push 1000 commands
    for (let i = 0; i < 1000; i++) {
      hm.push(paintCommand([cellEdit(0, i % 50, Math.floor(i / 50), 0, i + 1)]));
    }

    // Undo all 100 (maxCommands default)
    expect(hm.undoCount).toBe(100);
    for (let i = 0; i < 100; i++) {
      hm.undo(tilemap);
    }
    expect(hm.undoCount).toBe(0);
    expect(hm.redoCount).toBe(100);

    // Redo all
    for (let i = 0; i < 100; i++) {
      hm.redo(tilemap);
    }
    expect(hm.undoCount).toBe(100);
    expect(hm.redoCount).toBe(0);
  });

  it('alternating push and undo stays consistent', () => {
    const hm = new HistoryManager({ maxCommands: 50 });
    const tilemap = mockTilemap();

    for (let i = 0; i < 500; i++) {
      hm.push(paintCommand([cellEdit(0, 0, 0, 0, i + 1)]));
      hm.undo(tilemap);
    }

    expect(hm.undoCount).toBe(0);
    expect(hm.redoCount).toBe(1); // last undo leaves 1 on redo
    expect(hm.undoBytes).toBe(0);
  });
});

// ── Object command helpers ───────────────────────────────────────────

const testObj = (overrides: Partial<MapObject> = {}): MapObject => ({
  id: 1,
  name: 'spawn',
  type: 'point',
  x: 10,
  y: 20,
  width: 0,
  height: 0,
  properties: {},
  ...overrides,
});

function tilemapWithObjectLayer(): TilemapModel {
  const tm = new TilemapModel({ width: 4, height: 4, tileWidth: 16, tileHeight: 16 });
  tm.addLayer(createObjectLayer('Objects'));
  return tm;
}

// ── estimateCommandBytes — object commands ───────────────────────────

describe('estimateCommandBytes — object commands', () => {
  it('add-object returns 200', () => {
    const cmd: AddObjectCommand = { type: 'add-object', layerIndex: 1, object: testObj() };
    expect(estimateCommandBytes(cmd)).toBe(200);
  });

  it('delete-object returns 200', () => {
    const cmd: DeleteObjectCommand = { type: 'delete-object', layerIndex: 1, object: testObj() };
    expect(estimateCommandBytes(cmd)).toBe(200);
  });

  it('move-object returns 400', () => {
    const cmd: MoveObjectCommand = {
      type: 'move-object', layerIndex: 1, objectId: 1,
      oldObject: testObj(), newObject: testObj({ x: 50 }),
    };
    expect(estimateCommandBytes(cmd)).toBe(400);
  });

  it('edit-object returns 400', () => {
    const cmd: EditObjectCommand = {
      type: 'edit-object', layerIndex: 1, objectId: 1,
      oldObject: testObj(), newObject: testObj({ name: 'edited' }),
    };
    expect(estimateCommandBytes(cmd)).toBe(400);
  });
});

// ── AddObjectCommand undo/redo ───────────────────────────────────────

describe('HistoryManager — add-object undo/redo', () => {
  it('undo removes the added object', () => {
    const tilemap = tilemapWithObjectLayer();
    const hm = new HistoryManager();
    const obj = testObj();

    // Manually add the object to layer 1
    const layer = tilemap.getLayer(1) as ObjectLayer;
    tilemap.replaceLayer(1, addObject(layer, obj));
    expect((tilemap.getLayer(1) as ObjectLayer).objects).toHaveLength(1);

    const cmd: AddObjectCommand = { type: 'add-object', layerIndex: 1, object: obj };
    hm.push(cmd);
    hm.undo(tilemap);

    expect((tilemap.getLayer(1) as ObjectLayer).objects).toHaveLength(0);
  });

  it('redo re-adds the object', () => {
    const tilemap = tilemapWithObjectLayer();
    const hm = new HistoryManager();
    const obj = testObj();

    const layer = tilemap.getLayer(1) as ObjectLayer;
    tilemap.replaceLayer(1, addObject(layer, obj));

    const cmd: AddObjectCommand = { type: 'add-object', layerIndex: 1, object: obj };
    hm.push(cmd);
    hm.undo(tilemap);
    hm.redo(tilemap);

    const objects = (tilemap.getLayer(1) as ObjectLayer).objects;
    expect(objects).toHaveLength(1);
    expect(objects[0].id).toBe(1);
  });
});

// ── DeleteObjectCommand undo/redo ────────────────────────────────────

describe('HistoryManager — delete-object undo/redo', () => {
  it('undo re-adds the deleted object', () => {
    const tilemap = tilemapWithObjectLayer();
    const hm = new HistoryManager();
    const obj = testObj();

    // Add then remove the object
    let layer = tilemap.getLayer(1) as ObjectLayer;
    tilemap.replaceLayer(1, addObject(layer, obj));
    layer = tilemap.getLayer(1) as ObjectLayer;
    tilemap.replaceLayer(1, { ...layer, objects: layer.objects.filter(o => o.id !== 1) });
    expect((tilemap.getLayer(1) as ObjectLayer).objects).toHaveLength(0);

    const cmd: DeleteObjectCommand = { type: 'delete-object', layerIndex: 1, object: obj };
    hm.push(cmd);
    hm.undo(tilemap);

    expect((tilemap.getLayer(1) as ObjectLayer).objects).toHaveLength(1);
    expect((tilemap.getLayer(1) as ObjectLayer).objects[0].name).toBe('spawn');
  });

  it('redo removes the object again', () => {
    const tilemap = tilemapWithObjectLayer();
    const hm = new HistoryManager();
    const obj = testObj();

    let layer = tilemap.getLayer(1) as ObjectLayer;
    tilemap.replaceLayer(1, addObject(layer, obj));
    layer = tilemap.getLayer(1) as ObjectLayer;
    tilemap.replaceLayer(1, { ...layer, objects: [] });

    const cmd: DeleteObjectCommand = { type: 'delete-object', layerIndex: 1, object: obj };
    hm.push(cmd);
    hm.undo(tilemap);
    expect((tilemap.getLayer(1) as ObjectLayer).objects).toHaveLength(1);

    hm.redo(tilemap);
    expect((tilemap.getLayer(1) as ObjectLayer).objects).toHaveLength(0);
  });
});

// ── MoveObjectCommand undo/redo ──────────────────────────────────────

describe('HistoryManager — move-object undo/redo', () => {
  it('undo restores original position', () => {
    const tilemap = tilemapWithObjectLayer();
    const hm = new HistoryManager();
    const oldObj = testObj({ x: 10, y: 20 });
    const newObj = testObj({ x: 50, y: 60 });

    // Set up the object at the moved position
    const layer = tilemap.getLayer(1) as ObjectLayer;
    tilemap.replaceLayer(1, addObject(layer, newObj));

    const cmd: MoveObjectCommand = {
      type: 'move-object', layerIndex: 1, objectId: 1,
      oldObject: oldObj, newObject: newObj,
    };
    hm.push(cmd);
    hm.undo(tilemap);

    const obj = (tilemap.getLayer(1) as ObjectLayer).objects[0];
    expect(obj.x).toBe(10);
    expect(obj.y).toBe(20);
  });

  it('redo re-applies the move', () => {
    const tilemap = tilemapWithObjectLayer();
    const hm = new HistoryManager();
    const oldObj = testObj({ x: 10, y: 20 });
    const newObj = testObj({ x: 50, y: 60 });

    const layer = tilemap.getLayer(1) as ObjectLayer;
    tilemap.replaceLayer(1, addObject(layer, newObj));

    const cmd: MoveObjectCommand = {
      type: 'move-object', layerIndex: 1, objectId: 1,
      oldObject: oldObj, newObject: newObj,
    };
    hm.push(cmd);
    hm.undo(tilemap);
    hm.redo(tilemap);

    const obj = (tilemap.getLayer(1) as ObjectLayer).objects[0];
    expect(obj.x).toBe(50);
    expect(obj.y).toBe(60);
  });
});

// ── EditObjectCommand undo/redo ──────────────────────────────────────

describe('HistoryManager — edit-object undo/redo', () => {
  it('undo restores original properties', () => {
    const tilemap = tilemapWithObjectLayer();
    const hm = new HistoryManager();
    const oldObj = testObj({ name: 'spawn', type: 'point' });
    const newObj = testObj({ name: 'exit', type: 'trigger' });

    const layer = tilemap.getLayer(1) as ObjectLayer;
    tilemap.replaceLayer(1, addObject(layer, newObj));

    const cmd: EditObjectCommand = {
      type: 'edit-object', layerIndex: 1, objectId: 1,
      oldObject: oldObj, newObject: newObj,
    };
    hm.push(cmd);
    hm.undo(tilemap);

    const obj = (tilemap.getLayer(1) as ObjectLayer).objects[0];
    expect(obj.name).toBe('spawn');
    expect(obj.type).toBe('point');
  });

  it('redo re-applies the edit', () => {
    const tilemap = tilemapWithObjectLayer();
    const hm = new HistoryManager();
    const oldObj = testObj({ name: 'spawn' });
    const newObj = testObj({ name: 'exit' });

    const layer = tilemap.getLayer(1) as ObjectLayer;
    tilemap.replaceLayer(1, addObject(layer, newObj));

    const cmd: EditObjectCommand = {
      type: 'edit-object', layerIndex: 1, objectId: 1,
      oldObject: oldObj, newObject: newObj,
    };
    hm.push(cmd);
    hm.undo(tilemap);
    hm.redo(tilemap);

    expect((tilemap.getLayer(1) as ObjectLayer).objects[0].name).toBe('exit');
  });
});
