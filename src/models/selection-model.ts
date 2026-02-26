/**
 * Selection Model — hold the current tile selection state.
 *
 * Pure data model with no DOM or framework dependencies.
 * For M3, tracks a single selected tile GID.
 * Future milestones will extend for multi-tile stamps (M6)
 * and map region selections (M9).
 */

export class SelectionModel {
  /** The currently selected tile GID. 0 means no selection. */
  gid: number = 0;

  /** Select a single tile by GID. */
  selectTile(gid: number): void {
    this.gid = gid;
  }

  /** Clear the current selection. */
  clear(): void {
    this.gid = 0;
  }

  /** Returns true if nothing is selected. */
  get isEmpty(): boolean {
    return this.gid === 0;
  }
}
