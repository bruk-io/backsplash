import { describe, it, expect } from 'vitest';
import { DirtyTracker } from './dirty-tracker.js';

// ── Initial state ───────────────────────────────────────────────────

describe('DirtyTracker initial state', () => {
  it('needsFullRedraw is true on creation', () => {
    const tracker = new DirtyTracker();
    expect(tracker.needsFullRedraw).toBe(true);
  });

  it('hasDirtyCells is false on creation', () => {
    const tracker = new DirtyTracker();
    expect(tracker.hasDirtyCells).toBe(false);
  });
});

// ── markCell ────────────────────────────────────────────────────────

describe('markCell', () => {
  it('marks a single cell as dirty', () => {
    const tracker = new DirtyTracker();
    tracker.markCell(3, 5);
    expect(tracker.hasDirtyCells).toBe(true);
  });

  it('marks multiple cells as dirty', () => {
    const tracker = new DirtyTracker();
    tracker.markCell(0, 0);
    tracker.markCell(1, 2);
    tracker.markCell(4, 7);

    const { cells } = tracker.flush();
    expect(cells).toHaveLength(3);
    expect(cells).toContainEqual({ col: 0, row: 0 });
    expect(cells).toContainEqual({ col: 1, row: 2 });
    expect(cells).toContainEqual({ col: 4, row: 7 });
  });

  it('duplicate cells are not double-counted', () => {
    const tracker = new DirtyTracker();
    tracker.markCell(2, 3);
    tracker.markCell(2, 3);
    tracker.markCell(2, 3);

    const { cells } = tracker.flush();
    expect(cells).toHaveLength(1);
    expect(cells[0]).toEqual({ col: 2, row: 3 });
  });
});

// ── markFull ────────────────────────────────────────────────────────

describe('markFull', () => {
  it('sets fullRedraw to true', () => {
    const tracker = new DirtyTracker();
    // flush to clear the initial fullRedraw
    tracker.flush();
    expect(tracker.needsFullRedraw).toBe(false);

    tracker.markFull();
    expect(tracker.needsFullRedraw).toBe(true);
  });
});

// ── flush ───────────────────────────────────────────────────────────

describe('flush', () => {
  it('returns fullRedraw true on first flush', () => {
    const tracker = new DirtyTracker();
    const result = tracker.flush();
    expect(result.fullRedraw).toBe(true);
  });

  it('returns fullRedraw false after first flush', () => {
    const tracker = new DirtyTracker();
    tracker.flush();

    const result = tracker.flush();
    expect(result.fullRedraw).toBe(false);
  });

  it('returns dirty cells and clears them', () => {
    const tracker = new DirtyTracker();
    tracker.markCell(1, 1);
    tracker.markCell(2, 2);

    const result = tracker.flush();
    expect(result.cells).toHaveLength(2);
    expect(result.cells).toContainEqual({ col: 1, row: 1 });
    expect(result.cells).toContainEqual({ col: 2, row: 2 });

    // After flush, cells are cleared
    expect(tracker.hasDirtyCells).toBe(false);
    const second = tracker.flush();
    expect(second.cells).toHaveLength(0);
  });

  it('clears fullRedraw after flush', () => {
    const tracker = new DirtyTracker();
    expect(tracker.needsFullRedraw).toBe(true);

    tracker.flush();
    expect(tracker.needsFullRedraw).toBe(false);
  });

  it('returns both fullRedraw and cells together', () => {
    const tracker = new DirtyTracker();
    tracker.markCell(5, 10);

    const result = tracker.flush();
    expect(result.fullRedraw).toBe(true);
    expect(result.cells).toHaveLength(1);
    expect(result.cells[0]).toEqual({ col: 5, row: 10 });
  });

  it('markFull after flush restores fullRedraw on next flush', () => {
    const tracker = new DirtyTracker();
    tracker.flush(); // clear initial

    tracker.markFull();
    const result = tracker.flush();
    expect(result.fullRedraw).toBe(true);

    const result2 = tracker.flush();
    expect(result2.fullRedraw).toBe(false);
  });
});
