import { TilemapModel } from './tilemap-model.js';

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

// ── Strategy registry ─────────────────────────────────────────────────

const strategies: Record<string, ToolStrategy> = {
  brush,
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
