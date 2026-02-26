import type { TilemapModel } from './tilemap-model.js';
import type { Command, PaintCommand, CellEdit } from './tool-engine.js';

// ── Constants ─────────────────────────────────────────────────────────

/** Bytes per CellEdit: 4 numbers (layerIndex, col, row, oldGid/newGid) * 4 bytes each. */
const BYTES_PER_CELL_EDIT = 16;

const DEFAULT_MAX_COMMANDS = 100;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// ── Options ───────────────────────────────────────────────────────────

export interface HistoryManagerOptions {
  /** Maximum number of commands on the undo stack. */
  maxCommands?: number;
  /** Maximum estimated byte size of the undo stack. */
  maxBytes?: number;
}

// ── Size estimation ───────────────────────────────────────────────────

/** Estimate the byte size of a command for memory bounding. */
export function estimateCommandBytes(command: Command): number {
  switch (command.type) {
    case 'paint':
      return command.edits.length * BYTES_PER_CELL_EDIT;
  }
}

// ── Undo / redo application ───────────────────────────────────────────

function applyPaintUndo(tilemap: TilemapModel, command: PaintCommand): void {
  // Apply edits in reverse order, restoring oldGid
  const edits = command.edits;
  for (let i = edits.length - 1; i >= 0; i--) {
    const edit: CellEdit = edits[i];
    tilemap.setCellGid(edit.layerIndex, edit.col, edit.row, edit.oldGid);
  }
}

function applyPaintRedo(tilemap: TilemapModel, command: PaintCommand): void {
  // Apply edits in order, setting newGid
  for (const edit of command.edits) {
    tilemap.setCellGid(edit.layerIndex, edit.col, edit.row, edit.newGid);
  }
}

function applyUndo(tilemap: TilemapModel, command: Command): void {
  switch (command.type) {
    case 'paint':
      applyPaintUndo(tilemap, command);
      break;
  }
}

function applyRedo(tilemap: TilemapModel, command: Command): void {
  switch (command.type) {
    case 'paint':
      applyPaintRedo(tilemap, command);
      break;
  }
}

// ── HistoryManager ────────────────────────────────────────────────────

/**
 * Manage undo/redo stacks for tile map commands.
 *
 * Stacks are bounded by both command count and estimated byte size to
 * prevent memory exhaustion from large flood fills. Extends EventTarget
 * so UI components can listen for 'history-change' events.
 */
export class HistoryManager extends EventTarget {
  private readonly _maxCommands: number;
  private readonly _maxBytes: number;

  private readonly _undoStack: Command[] = [];
  private readonly _redoStack: Command[] = [];

  private _undoBytes = 0;
  private _redoBytes = 0;

  constructor(options: HistoryManagerOptions = {}) {
    super();
    this._maxCommands = options.maxCommands ?? DEFAULT_MAX_COMMANDS;
    this._maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  }

  // ── Getters ───────────────────────────────────────────────────────

  get canUndo(): boolean {
    return this._undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this._redoStack.length > 0;
  }

  get undoCount(): number {
    return this._undoStack.length;
  }

  get redoCount(): number {
    return this._redoStack.length;
  }

  /** Current estimated byte size of the undo stack. */
  get undoBytes(): number {
    return this._undoBytes;
  }

  /** Current estimated byte size of the redo stack. */
  get redoBytes(): number {
    return this._redoBytes;
  }

  // ── Mutations ─────────────────────────────────────────────────────

  /**
   * Push a new command onto the undo stack.
   *
   * Clear the redo stack (standard undo/redo semantics). Drop oldest
   * commands if the stack would exceed maxCommands or maxBytes.
   */
  push(command: Command): void {
    // Clear redo stack — new action invalidates redo history
    this._clearRedoStack();

    const bytes = estimateCommandBytes(command);

    this._undoStack.push(command);
    this._undoBytes += bytes;

    // Trim oldest commands while over limits
    this._trimUndoStack();

    this._dispatchChange();
  }

  /**
   * Undo the most recent command.
   *
   * Pop from undo stack, apply the inverse to the tilemap, and push
   * onto the redo stack. No-op if the undo stack is empty.
   */
  undo(tilemap: TilemapModel): void {
    const command = this._undoStack.pop();
    if (!command) {
      return;
    }

    const bytes = estimateCommandBytes(command);
    this._undoBytes -= bytes;

    applyUndo(tilemap, command);

    this._redoStack.push(command);
    this._redoBytes += bytes;

    this._dispatchChange();
  }

  /**
   * Redo the most recently undone command.
   *
   * Pop from redo stack, re-apply to the tilemap, and push onto
   * the undo stack. No-op if the redo stack is empty.
   */
  redo(tilemap: TilemapModel): void {
    const command = this._redoStack.pop();
    if (!command) {
      return;
    }

    const bytes = estimateCommandBytes(command);
    this._redoBytes -= bytes;

    applyRedo(tilemap, command);

    this._undoStack.push(command);
    this._undoBytes += bytes;

    // Trim in case redo pushes us over limits
    this._trimUndoStack();

    this._dispatchChange();
  }

  /** Clear both undo and redo stacks. */
  clear(): void {
    this._undoStack.length = 0;
    this._redoStack.length = 0;
    this._undoBytes = 0;
    this._redoBytes = 0;
    this._dispatchChange();
  }

  // ── Private helpers ───────────────────────────────────────────────

  private _clearRedoStack(): void {
    this._redoStack.length = 0;
    this._redoBytes = 0;
  }

  /** Drop oldest undo commands until within both count and byte limits. */
  private _trimUndoStack(): void {
    while (
      this._undoStack.length > this._maxCommands ||
      this._undoBytes > this._maxBytes
    ) {
      const oldest = this._undoStack.shift();
      if (!oldest) {
        break;
      }
      this._undoBytes -= estimateCommandBytes(oldest);
    }
  }

  private _dispatchChange(): void {
    this.dispatchEvent(new Event('history-change'));
  }
}
