/**
 * GID Constants & Utilities — single source of truth.
 *
 * A GID (Global tile ID) is a 32-bit unsigned integer where the top 3 bits
 * encode flip/rotation flags and the lower 29 bits hold the raw tile index.
 *
 *   bit 31 — horizontal flip
 *   bit 30 — vertical flip
 *   bit 29 — diagonal flip (anti-diagonal transpose)
 */

/** GID value representing an empty cell. */
export const EMPTY_GID = 0;

/** Flip/rotation flags stored in the top 3 bits of a 32-bit GID. */
export const FLIP_HORIZONTAL = 0x80000000;
export const FLIP_VERTICAL = 0x40000000;
export const FLIP_DIAGONAL = 0x20000000;

/** Mask covering all three flag bits. */
export const FLIP_FLAGS_MASK = 0xe0000000;

/** Mask to extract the raw tile ID, stripping all flags. */
export const GID_MASK = 0x1fffffff;

/** Strip flip/rotation flags from a GID, returning the raw tile index. */
export function maskGid(gid: number): number {
  return (gid & GID_MASK) >>> 0;
}

/** Check whether a GID has the horizontal flip flag set. */
export function isFlippedHorizontal(gid: number): boolean {
  return (gid & FLIP_HORIZONTAL) !== 0;
}

/** Check whether a GID has the vertical flip flag set. */
export function isFlippedVertical(gid: number): boolean {
  return (gid & FLIP_VERTICAL) !== 0;
}

/** Check whether a GID has the diagonal flip flag set. */
export function isFlippedDiagonal(gid: number): boolean {
  return (gid & FLIP_DIAGONAL) !== 0;
}

/** Compose a GID from a raw tile ID and optional flip/rotation flags. */
export function composeGid(
  tileId: number,
  flipH: boolean = false,
  flipV: boolean = false,
  flipD: boolean = false,
): number {
  let gid = tileId & GID_MASK;
  if (flipH) gid |= FLIP_HORIZONTAL;
  if (flipV) gid |= FLIP_VERTICAL;
  if (flipD) gid |= FLIP_DIAGONAL;
  return gid >>> 0;
}
