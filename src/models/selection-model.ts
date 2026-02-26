/**
 * Selection Model — hold the current tile selection state.
 *
 * Supports single-tile selection (GID) and multi-tile stamp
 * selection (2D grid of GIDs with width/height). When a stamp
 * is set, `gid` reflects the top-left tile of the stamp.
 */

/**
 * A rectangular grid of GIDs representing a multi-tile stamp.
 * Row-major order: gids[row * width + col].
 */
export interface Stamp {
  /** Width of the stamp in tiles. */
  width: number;
  /** Height of the stamp in tiles. */
  height: number;
  /** Flat array of GIDs in row-major order. */
  gids: number[];
}

export class SelectionModel {
  /** The currently selected tile GID. 0 means no selection. */
  gid: number = 0;

  /** Multi-tile stamp selection, or null for single-tile mode. */
  stamp: Stamp | null = null;

  /** Select a single tile by GID. Clears any stamp. */
  selectTile(gid: number): void {
    this.gid = gid;
    this.stamp = null;
  }

  /**
   * Select a rectangular stamp from a tileset.
   *
   * The stamp is defined by a top-left GID, width/height in tiles,
   * and the tileset's column count (to compute sequential GIDs).
   * Sets `gid` to the top-left tile of the stamp.
   */
  selectStamp(
    topLeftGid: number,
    width: number,
    height: number,
    tilesetColumns: number,
  ): void {
    if (width <= 0 || height <= 0) return;

    // Single tile — degenerate to selectTile
    if (width === 1 && height === 1) {
      this.selectTile(topLeftGid);
      return;
    }

    const gids: number[] = [];
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        gids.push(topLeftGid + r * tilesetColumns + c);
      }
    }

    this.gid = topLeftGid;
    this.stamp = { width, height, gids };
  }

  /** Clear the current selection. */
  clear(): void {
    this.gid = 0;
    this.stamp = null;
  }

  /** Returns true if nothing is selected. */
  get isEmpty(): boolean {
    return this.gid === 0 && this.stamp === null;
  }

  /** Returns true if a multi-tile stamp is selected. */
  get isStamp(): boolean {
    return this.stamp !== null;
  }
}
