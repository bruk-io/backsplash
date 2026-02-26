import {
  type Layer,
  type TileLayer,
  createTileLayer,
  getCell,
  setCell,
} from './layer-model.js';
import { maskGid } from './gid.js';
import { TilesetModel } from './tileset-model.js';

/**
 * Options for constructing a TilemapModel.
 */
export interface TilemapOptions {
  /** Map width in tiles. */
  width: number;
  /** Map height in tiles. */
  height: number;
  /** Tile width in pixels. */
  tileWidth: number;
  /** Tile height in pixels. */
  tileHeight: number;
}

/**
 * Core data structure for a tile map.
 *
 * Hold map dimensions, tile size, an ordered layer stack, and tileset
 * references. Provide convenience methods for cell access by
 * (col, row, layer) and coordinate conversion between pixel and tile space.
 */
export class TilemapModel {
  readonly width: number;
  readonly height: number;
  readonly tileWidth: number;
  readonly tileHeight: number;

  private _layers: Layer[] = [];
  private _tilesets: TilesetModel[] = [];

  constructor(options: TilemapOptions) {
    this.width = options.width;
    this.height = options.height;
    this.tileWidth = options.tileWidth;
    this.tileHeight = options.tileHeight;

    // Create one default tile layer
    this._layers.push(
      createTileLayer('Layer 1', this.width, this.height),
    );
  }

  // ── Layer management ──────────────────────────────────────────────

  /** Ordered layer stack (index 0 = bottom). */
  get layers(): readonly Layer[] {
    return this._layers;
  }

  /** Append a layer to the top of the stack. */
  addLayer(layer: Layer): void {
    this._layers.push(layer);
  }

  /** Remove and return the layer at the given index. */
  removeLayer(index: number): Layer | undefined {
    if (index < 0 || index >= this._layers.length) {
      return undefined;
    }
    return this._layers.splice(index, 1)[0];
  }

  /** Move a layer from one position to another. */
  moveLayer(fromIndex: number, toIndex: number): void {
    if (
      fromIndex < 0 ||
      fromIndex >= this._layers.length ||
      toIndex < 0 ||
      toIndex >= this._layers.length ||
      fromIndex === toIndex
    ) {
      return;
    }
    const [layer] = this._layers.splice(fromIndex, 1);
    this._layers.splice(toIndex, 0, layer);
  }

  /** Get the layer at the given index. */
  getLayer(index: number): Layer | undefined {
    return this._layers[index];
  }

  // ── Tileset management ────────────────────────────────────────────

  /** Registered tilesets. */
  get tilesets(): readonly TilesetModel[] {
    return this._tilesets;
  }

  /** Register a tileset with this map. */
  addTileset(tileset: TilesetModel): void {
    this._tilesets.push(tileset);
  }

  /** Remove a tileset from this map. */
  removeTileset(tileset: TilesetModel): void {
    const idx = this._tilesets.indexOf(tileset);
    if (idx !== -1) {
      this._tilesets.splice(idx, 1);
    }
  }

  /**
   * Find which tileset owns a GID.
   *
   * Mask the top 3 flip/rotation bits before comparing against tileset
   * GID ranges. Search tilesets in reverse order so the highest firstGid
   * that is less than or equal to the raw ID wins.
   */
  getTilesetForGid(gid: number): TilesetModel | undefined {
    const rawId = maskGid(gid);
    if (rawId === 0) {
      return undefined;
    }

    // Tilesets are searched in reverse so the one with the highest
    // firstGid that still fits is returned.
    for (let i = this._tilesets.length - 1; i >= 0; i--) {
      const ts = this._tilesets[i];
      if (rawId >= ts.firstGid && rawId <= ts.lastGid) {
        return ts;
      }
    }
    return undefined;
  }

  // ── Cell access (convenience wrappers) ────────────────────────────

  /**
   * Get the GID at (col, row) on a specific tile layer.
   *
   * Return 0 if the layer index is out of range, the layer is not a
   * tile layer, or the coordinates are out of bounds.
   */
  getCellGid(layerIndex: number, col: number, row: number): number {
    const layer = this._layers[layerIndex];
    if (!layer || layer.type !== 'tile') {
      return 0;
    }
    if (col < 0 || col >= this.width || row < 0 || row >= this.height) {
      return 0;
    }
    return getCell(layer as TileLayer, col, row, this.width);
  }

  /**
   * Set the GID at (col, row) on a specific tile layer.
   *
   * No-op if the layer index is out of range, the layer is not a tile
   * layer, or the coordinates are out of bounds.
   */
  setCellGid(
    layerIndex: number,
    col: number,
    row: number,
    gid: number,
  ): void {
    const layer = this._layers[layerIndex];
    if (!layer || layer.type !== 'tile') {
      return;
    }
    if (col < 0 || col >= this.width || row < 0 || row >= this.height) {
      return;
    }
    setCell(layer as TileLayer, col, row, this.width, gid);
  }

  // ── Coordinate conversion ─────────────────────────────────────────

  /**
   * Convert a pixel position to tile column/row.
   *
   * Clamp the result to the valid map range [0, width-1] x [0, height-1].
   */
  pixelToTile(px: number, py: number): { col: number; row: number } {
    const col = Math.max(
      0,
      Math.min(this.width - 1, Math.floor(px / this.tileWidth)),
    );
    const row = Math.max(
      0,
      Math.min(this.height - 1, Math.floor(py / this.tileHeight)),
    );
    return { col, row };
  }

  /**
   * Convert a tile column/row to the pixel position of its top-left corner.
   */
  tileToPixel(col: number, row: number): { x: number; y: number } {
    return {
      x: col * this.tileWidth,
      y: row * this.tileHeight,
    };
  }

  /** Map width in pixels. */
  get pixelWidth(): number {
    return this.width * this.tileWidth;
  }

  /** Map height in pixels. */
  get pixelHeight(): number {
    return this.height * this.tileHeight;
  }
}
