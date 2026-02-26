import { describe, it, expect, vi } from 'vitest';
import {
  HistoryManager,
  estimateCommandBytes,
} from './history-manager.js';
import type { Command, PaintCommand, CellEdit } from './tool-engine.js';
import type { TilemapModel } from './tilemap-model.js';

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
