/**
 * Track dirty (changed) cells on the canvas to enable partial redraws
 * instead of re-rendering the entire visible viewport on every paint stroke.
 */
export class DirtyTracker {
  private _cells = new Set<string>();
  private _fullRedraw = true; // Start with full redraw needed

  /** Mark a single cell as dirty. */
  markCell(col: number, row: number): void {
    this._cells.add(`${col},${row}`);
  }

  /** Mark the entire canvas as needing a full redraw. */
  markFull(): void {
    this._fullRedraw = true;
  }

  /** Whether a full redraw is needed. */
  get needsFullRedraw(): boolean {
    return this._fullRedraw;
  }

  /** Whether there are any dirty cells. */
  get hasDirtyCells(): boolean {
    return this._cells.size > 0;
  }

  /** Get all dirty cells and clear them. */
  flush(): { fullRedraw: boolean; cells: Array<{ col: number; row: number }> } {
    const result = {
      fullRedraw: this._fullRedraw,
      cells: [...this._cells].map(key => {
        const [col, row] = key.split(',').map(Number);
        return { col, row };
      }),
    };
    this._cells.clear();
    this._fullRedraw = false;
    return result;
  }
}
