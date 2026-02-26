/**
 * Tileset Model — load image, slice by tile size, index tiles by GID.
 *
 * Pure data model with no DOM or framework dependencies.
 * Manages a single tileset's tile grid and GID namespace.
 */

import { maskGid } from './gid.js';

// Re-export GID constants and utilities for backward compatibility.
export {
  FLIP_HORIZONTAL as FLIPPED_HORIZONTALLY,
  FLIP_VERTICAL as FLIPPED_VERTICALLY,
  FLIP_DIAGONAL as FLIPPED_DIAGONALLY,
  GID_MASK,
  maskGid,
} from './gid.js';

/** Source rectangle for a tile within its spritesheet. */
export interface TileRect {
  x: number;
  y: number;
}

/** Options for constructing a TilesetModel. */
export interface TilesetModelOptions {
  name: string;
  image: ImageBitmap | HTMLImageElement | null;
  tileWidth: number;
  tileHeight: number;
  imageWidth: number;
  imageHeight: number;
  margin?: number;
  spacing?: number;
  firstGid?: number;
}

export class TilesetModel {
  readonly name: string;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly margin: number;
  readonly spacing: number;
  readonly firstGid: number;
  readonly columns: number;
  readonly rows: number;
  readonly tileCount: number;

  image: ImageBitmap | HTMLImageElement | null;

  constructor(options: TilesetModelOptions) {
    this.name = options.name;
    this.image = options.image;
    this.tileWidth = options.tileWidth;
    this.tileHeight = options.tileHeight;
    this.margin = options.margin ?? 0;
    this.spacing = options.spacing ?? 0;
    this.firstGid = options.firstGid ?? 1;

    this.columns = TilesetModel.computeCount(
      options.imageWidth,
      this.tileWidth,
      this.margin,
      this.spacing,
    );
    this.rows = TilesetModel.computeCount(
      options.imageHeight,
      this.tileHeight,
      this.margin,
      this.spacing,
    );
    this.tileCount = this.columns * this.rows;
  }

  /** Compute how many tiles fit along one axis. */
  private static computeCount(
    imageSize: number,
    tileSize: number,
    margin: number,
    spacing: number,
  ): number {
    if (imageSize <= 0 || tileSize <= 0) return 0;
    const usable = imageSize - margin * 2;
    if (usable <= 0) return 0;
    // First tile takes tileSize, each additional takes (spacing + tileSize)
    const count = Math.floor((usable + spacing) / (tileSize + spacing));
    return Math.max(count, 0);
  }

  /** The last GID owned by this tileset. */
  get lastGid(): number {
    return this.firstGid + this.tileCount - 1;
  }

  /** Check if a raw GID (after masking flags) belongs to this tileset. */
  containsGid(gid: number): boolean {
    const raw = maskGid(gid);
    return raw >= this.firstGid && raw <= this.lastGid;
  }

  /**
   * Get the source rectangle (x, y position on the spritesheet) for a GID.
   * Automatically masks flip/rotation flags.
   * Returns null if the GID does not belong to this tileset.
   */
  getTileRect(gid: number): TileRect | null {
    const raw = maskGid(gid);
    if (raw < this.firstGid || raw > this.lastGid) return null;

    const localId = raw - this.firstGid;
    const col = localId % this.columns;
    const row = Math.floor(localId / this.columns);

    return {
      x: this.margin + col * (this.tileWidth + this.spacing),
      y: this.margin + row * (this.tileHeight + this.spacing),
    };
  }
}
