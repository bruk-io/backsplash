import { TilemapModel } from './tilemap-model.js';
import { EMPTY_GID } from './gid.js';

// ── Command types (consumed by HistoryManager in M4) ──────────────────

/** A single cell edit within a paint operation. */
export interface CellEdit {
  layerIndex: number;
  col: number;
  row: number;
  oldGid: number;
  newGid: number;
}

/** Command produced by painting one or more cells. */
export interface PaintCommand {
  type: 'paint';
  edits: CellEdit[];
}

/** Union of all command types. Will grow as more tools are added. */
export type Command = PaintCommand;

// ── Event and state interfaces ────────────────────────────────────────

/** Pointer event translated to tile coordinates by the canvas. */
export interface ToolEvent {
  type: 'down' | 'move' | 'up';
  col: number;
  row: number;
}

/** Snapshot of editor state needed by tool strategies. */
export interface EditorState {
  activeTool: string;
  activeLayerIndex: number;
  selectedGid: number;
  /** Called by the eyedropper strategy when a non-empty tile is picked. */
  onEyedrop?: (gid: number) => void;
}

// ── Tool strategy type ────────────────────────────────────────────────

/**
 * A tool strategy is a pure function that receives a pointer event,
 * the current editor state, and the tilemap model. It returns a
 * Command describing the mutation (for undo/redo) or null for no-op.
 */
export type ToolStrategy = (
  event: ToolEvent,
  state: EditorState,
  tilemap: TilemapModel,
) => Command | null;

// ── Brush strategy ────────────────────────────────────────────────────

/**
 * Paint the selected GID at the given cell on the active layer.
 *
 * Return null (no-op) when:
 * - The event is 'up' (nothing to paint on pointer release)
 * - selectedGid is 0 (no tile selected)
 * - The cell is out of bounds (getCellGid returns 0 and setCellGid is a no-op)
 * - The old GID already matches the new GID (no change needed)
 */
export const brush: ToolStrategy = (
  event: ToolEvent,
  state: EditorState,
  tilemap: TilemapModel,
): Command | null => {
  if (event.type === 'up') {
    return null;
  }

  if (state.selectedGid === 0) {
    return null;
  }

  const { activeLayerIndex, selectedGid } = state;
  const { col, row } = event;

  // Check bounds — if out of bounds, getCellGid returns 0 and
  // setCellGid is a no-op. We detect this by checking coordinates
  // against the tilemap dimensions directly.
  if (
    col < 0 ||
    col >= tilemap.width ||
    row < 0 ||
    row >= tilemap.height
  ) {
    return null;
  }

  const oldGid = tilemap.getCellGid(activeLayerIndex, col, row);

  if (oldGid === selectedGid) {
    return null;
  }

  tilemap.setCellGid(activeLayerIndex, col, row, selectedGid);

  return {
    type: 'paint',
    edits: [
      {
        layerIndex: activeLayerIndex,
        col,
        row,
        oldGid,
        newGid: selectedGid,
      },
    ],
  };
};

// ── Eraser strategy ───────────────────────────────────────────────────

/**
 * Erase the cell at the given coordinates on the active layer by writing
 * EMPTY_GID (0).
 *
 * Return null (no-op) when:
 * - The event is 'up' (nothing to erase on pointer release)
 * - The cell is already empty (oldGid === EMPTY_GID, no change needed)
 * - The cell is out of bounds
 */
export const eraser: ToolStrategy = (
  event: ToolEvent,
  state: EditorState,
  tilemap: TilemapModel,
): Command | null => {
  if (event.type === 'up') {
    return null;
  }

  const { activeLayerIndex } = state;
  const { col, row } = event;

  if (
    col < 0 ||
    col >= tilemap.width ||
    row < 0 ||
    row >= tilemap.height
  ) {
    return null;
  }

  const oldGid = tilemap.getCellGid(activeLayerIndex, col, row);

  if (oldGid === EMPTY_GID) {
    return null;
  }

  tilemap.setCellGid(activeLayerIndex, col, row, EMPTY_GID);

  return {
    type: 'paint',
    edits: [
      {
        layerIndex: activeLayerIndex,
        col,
        row,
        oldGid,
        newGid: EMPTY_GID,
      },
    ],
  };
};

// ── Eyedropper strategy ───────────────────────────────────────────────

/**
 * Read the GID from the clicked cell on the active layer and report it
 * via `state.onEyedrop`. Does not modify the map.
 *
 * Return null (no-op) when:
 * - The event is not 'down' (only triggers on initial click)
 * - The cell is out of bounds
 * - The cell is empty (GID === EMPTY_GID / 0)
 */
export const eyedropper: ToolStrategy = (
  event: ToolEvent,
  state: EditorState,
  tilemap: TilemapModel,
): Command | null => {
  if (event.type !== 'down') {
    return null;
  }

  const { activeLayerIndex } = state;
  const { col, row } = event;

  if (
    col < 0 ||
    col >= tilemap.width ||
    row < 0 ||
    row >= tilemap.height
  ) {
    return null;
  }

  const pickedGid = tilemap.getCellGid(activeLayerIndex, col, row);

  if (pickedGid === EMPTY_GID) {
    return null;
  }

  state.onEyedrop?.(pickedGid);

  return null;
};

// ── Fill strategy ─────────────────────────────────────────────────────

/** Maximum number of cells a single fill operation may replace. */
const FILL_MAX_CELLS = 10_000;

/**
 * Flood-fill the contiguous region of cells sharing the same GID as the
 * clicked cell, replacing them all with the active selection GID.
 *
 * Uses iterative BFS (not recursion) to avoid stack overflow on large maps.
 * Connectivity is 4-directional (up, down, left, right — no diagonals).
 *
 * Return null (no-op) when:
 * - The event is not 'down'
 * - selectedGid is 0
 * - The starting cell is out of bounds
 * - The starting cell already has the selected GID
 * - The fill region would exceed FILL_MAX_CELLS (bounded to prevent runaway)
 */
export const fill: ToolStrategy = (
  event: ToolEvent,
  state: EditorState,
  tilemap: TilemapModel,
): Command | null => {
  if (event.type !== 'down') {
    return null;
  }

  if (state.selectedGid === 0) {
    return null;
  }

  const { activeLayerIndex, selectedGid } = state;
  const { col, row } = event;

  if (
    col < 0 ||
    col >= tilemap.width ||
    row < 0 ||
    row >= tilemap.height
  ) {
    return null;
  }

  const targetGid = tilemap.getCellGid(activeLayerIndex, col, row);

  if (targetGid === selectedGid) {
    return null;
  }

  // BFS flood fill — collect all cells connected to (col, row) that share
  // targetGid, bounded by FILL_MAX_CELLS.
  const edits: CellEdit[] = [];
  const visited = new Set<number>();
  const queue: Array<[number, number]> = [[col, row]];

  // Encode a cell position as a single integer key for the visited set.
  const key = (c: number, r: number): number => r * tilemap.width + c;

  visited.add(key(col, row));

  while (queue.length > 0 && edits.length < FILL_MAX_CELLS) {
    const [c, r] = queue.shift()!;

    const cellGid = tilemap.getCellGid(activeLayerIndex, c, r);
    if (cellGid !== targetGid) {
      continue;
    }

    tilemap.setCellGid(activeLayerIndex, c, r, selectedGid);
    edits.push({
      layerIndex: activeLayerIndex,
      col: c,
      row: r,
      oldGid: targetGid,
      newGid: selectedGid,
    });

    // Enqueue 4-directional neighbours.
    const neighbours: Array<[number, number]> = [
      [c, r - 1], // up
      [c, r + 1], // down
      [c - 1, r], // left
      [c + 1, r], // right
    ];

    for (const [nc, nr] of neighbours) {
      if (
        nc >= 0 &&
        nc < tilemap.width &&
        nr >= 0 &&
        nr < tilemap.height &&
        !visited.has(key(nc, nr))
      ) {
        visited.add(key(nc, nr));
        queue.push([nc, nr]);
      }
    }
  }

  if (edits.length === 0) {
    return null;
  }

  return { type: 'paint', edits };
};

// ── Strategy registry ─────────────────────────────────────────────────

const strategies: Record<string, ToolStrategy> = {
  brush,
  eraser,
  eyedropper,
  fill,
};

// ── Dispatch ──────────────────────────────────────────────────────────

/**
 * Look up the strategy for the active tool and execute it.
 *
 * Return null if the tool is unknown.
 */
export function dispatch(
  event: ToolEvent,
  state: EditorState,
  tilemap: TilemapModel,
): Command | null {
  const strategy = strategies[state.activeTool];
  if (!strategy) {
    return null;
  }
  return strategy(event, state, tilemap);
}
