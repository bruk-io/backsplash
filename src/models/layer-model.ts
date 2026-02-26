/**
 * Layer Model — Owned by Tilemap Model.
 *
 * Layer types: TileLayer (grid of GIDs in flat Uint32Array, row-major),
 * ObjectLayer (freeform positioned entities, stub for now).
 *
 * Each layer has name, visibility, opacity, lock state, and z-order.
 *
 * GID encoding: GID 0 = empty cell. Top 3 bits of a 32-bit GID are
 * reserved for flip/rotation flags:
 *   bit 31 — horizontal flip
 *   bit 30 — vertical flip
 *   bit 29 — diagonal flip (anti-diagonal transpose)
 */

// Re-export GID constants and utilities from the single source of truth.
export {
  EMPTY_GID,
  FLIP_HORIZONTAL,
  FLIP_VERTICAL,
  FLIP_DIAGONAL,
  GID_MASK,
  maskGid,
  maskGid as extractTileId,
  isFlippedHorizontal,
  isFlippedVertical,
  isFlippedDiagonal,
  composeGid,
} from './gid.js';

// ── Interfaces ─────────────────────────────────────────────────────────

/** Base properties shared by all layer types. */
export interface LayerBase {
  readonly name: string;
  readonly visible: boolean;
  readonly opacity: number; // 0.0 to 1.0
  readonly locked: boolean;
  readonly zOrder: number;
}

/**
 * TileLayer stores GIDs in a flat Uint32Array (row-major).
 * Index formula: row * width + col.
 */
export interface TileLayer extends LayerBase {
  readonly type: 'tile';
  readonly data: Uint32Array;
}

/** A positioned entity within an ObjectLayer. */
export interface MapObject {
  readonly id: number;
  readonly name: string;
  readonly type: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly properties: Readonly<Record<string, string | number | boolean>>;
}

/** ObjectLayer holds freeform positioned entities (stub for future use). */
export interface ObjectLayer extends LayerBase {
  readonly type: 'object';
  readonly objects: readonly MapObject[];
}

/** Discriminated union of all layer types. */
export type Layer = TileLayer | ObjectLayer;

// ── Factory Functions ──────────────────────────────────────────────────

/** Create a new empty tile layer with all cells set to GID 0. */
export function createTileLayer(
  name: string,
  width: number,
  height: number,
  zOrder: number = 0,
): TileLayer {
  return {
    type: 'tile',
    name,
    visible: true,
    opacity: 1.0,
    locked: false,
    zOrder,
    data: new Uint32Array(width * height),
  };
}

/** Create a new empty object layer. */
export function createObjectLayer(
  name: string,
  zOrder: number = 0,
): ObjectLayer {
  return {
    type: 'object',
    name,
    visible: true,
    opacity: 1.0,
    locked: false,
    zOrder,
    objects: [],
  };
}

// ── Cell Access ────────────────────────────────────────────────────────

/** Get the GID at (col, row) in a tile layer. Row-major: index = row * width + col. */
export function getCell(
  layer: TileLayer,
  col: number,
  row: number,
  width: number,
): number {
  const index = row * width + col;
  return layer.data[index]!;
}

/** Set the GID at (col, row) in a tile layer. Row-major: index = row * width + col. */
export function setCell(
  layer: TileLayer,
  col: number,
  row: number,
  width: number,
  gid: number,
): void {
  const index = row * width + col;
  layer.data[index] = gid;
}

// ── Layer Property Updates ─────────────────────────────────────────────

/** Return a new layer with the given name. */
export function setLayerName<T extends Layer>(layer: T, name: string): T {
  return { ...layer, name };
}

/** Return a new layer with the given visibility. */
export function setLayerVisible<T extends Layer>(layer: T, visible: boolean): T {
  return { ...layer, visible };
}

/** Return a new layer with the given opacity (clamped to 0.0-1.0). */
export function setLayerOpacity<T extends Layer>(layer: T, opacity: number): T {
  return { ...layer, opacity: Math.max(0, Math.min(1, opacity)) };
}

/** Return a new layer with the given lock state. */
export function setLayerLocked<T extends Layer>(layer: T, locked: boolean): T {
  return { ...layer, locked };
}

/** Return a new layer with the given z-order. */
export function setLayerZOrder<T extends Layer>(layer: T, zOrder: number): T {
  return { ...layer, zOrder };
}
