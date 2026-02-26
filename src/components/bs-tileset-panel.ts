/**
 * Tileset Panel — display a tileset as a grid of selectable tile thumbnails.
 *
 * Each tile is rendered via CSS background-position clipping from the
 * spritesheet image. Single-click selects a tile and emits 'bs-tile-select'.
 */

import { html, css, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { BaseElement } from '@bruk-io/bh-01';
import { TilesetModel } from '../models/tileset-model.js';

/** Detail payload for the bs-tile-select event. */
export interface TileSelectDetail {
  gid: number;
}

/** Detail payload for the bs-stamp-select event. */
export interface StampSelectDetail {
  topLeftGid: number;
  width: number;
  height: number;
  tilesetColumns: number;
}

@customElement('bs-tileset-panel')
export class BsTilesetPanel extends BaseElement {
  static override styles = [
    ...([BaseElement.styles].flat()),
    css`
      :host {
        display: block;
        overflow: hidden;
      }

      .tile-grid {
        display: grid;
        grid-template-columns: repeat(var(--columns), var(--tile-width));
        gap: 1px;
        padding: var(--bh-spacing-2, 8px);
        overflow-y: auto;
        max-height: 100%;
      }

      .tile {
        cursor: pointer;
        image-rendering: pixelated;
        border: 2px solid transparent;
        box-sizing: content-box;
      }

      .tile:hover {
        border-color: var(--bh-color-primary);
        opacity: 0.8;
      }

      .tile.selected {
        border-color: var(--bh-color-primary);
      }

      .tile.in-stamp {
        border-color: var(--bh-color-primary);
        opacity: 0.85;
      }
    `,
  ];

  /** The tileset to display. */
  @property({ attribute: false }) tileset: TilesetModel | null = null;

  /** Currently selected GID. */
  @property({ type: Number, attribute: 'selected-gid' }) selectedGid = 0;

  /** Blob URL created from an ImageBitmap for use in CSS background-image. */
  @state() private _imageUrl = '';

  /** GIDs in the current stamp selection (for highlight rendering). */
  @state() private _stampGids = new Set<number>();

  /** Cached image dimensions for background-size. */
  private _imageWidth = 0;
  private _imageHeight = 0;

  /** GID where pointer-down started a drag selection. */
  private _dragStartGid = 0;

  /** Whether a drag selection is in progress. */
  private _isDragging = false;

  override async willUpdate(changed: PropertyValues): Promise<void> {
    if (changed.has('tileset') && this.tileset?.image) {
      const img = this.tileset.image;
      if (img instanceof ImageBitmap) {
        this._imageWidth = img.width;
        this._imageHeight = img.height;
        const canvas = new OffscreenCanvas(img.width, img.height);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const blob = await canvas.convertToBlob();
        if (this._imageUrl) URL.revokeObjectURL(this._imageUrl);
        this._imageUrl = URL.createObjectURL(blob);
        this.requestUpdate();
      } else if (img instanceof HTMLImageElement) {
        this._imageWidth = img.naturalWidth;
        this._imageHeight = img.naturalHeight;
        this._imageUrl = img.src;
      }
    }

    // Clear state when tileset is removed
    if (changed.has('tileset') && !this.tileset) {
      if (this._imageUrl) URL.revokeObjectURL(this._imageUrl);
      this._imageUrl = '';
      this._imageWidth = 0;
      this._imageHeight = 0;
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._imageUrl) {
      URL.revokeObjectURL(this._imageUrl);
      this._imageUrl = '';
    }
  }

  override render() {
    if (!this.tileset) {
      return html`
        <bh-center intrinsic>
          <bh-text variant="small" style="color:var(--bh-color-text-tertiary)">
            No tileset loaded
          </bh-text>
        </bh-center>
      `;
    }

    if (!this._imageUrl) {
      return nothing;
    }

    const style = `--columns: ${this.tileset.columns}; --tile-width: ${this.tileset.tileWidth}px`;
    return html`
      <div
        class="tile-grid"
        style=${style}
        @pointerup=${this._onGridPointerUp}
        @pointerleave=${this._onGridPointerLeave}
      >
        ${this._renderTiles()}
      </div>
    `;
  }

  private _renderTiles() {
    const ts = this.tileset!;
    const tiles = [];
    for (let gid = ts.firstGid; gid <= ts.lastGid; gid++) {
      tiles.push(this._renderTile(gid));
    }
    return tiles;
  }

  private _renderTile(gid: number) {
    const rect = this.tileset!.getTileRect(gid);
    if (!rect) return nothing;

    const selected = gid === this.selectedGid && this._stampGids.size === 0;
    const inStamp = this._stampGids.has(gid);
    return html`
      <div
        class="tile ${selected ? 'selected' : ''} ${inStamp ? 'in-stamp' : ''}"
        style="
          width: ${this.tileset!.tileWidth}px;
          height: ${this.tileset!.tileHeight}px;
          background-image: url(${this._imageUrl});
          background-position: -${rect.x}px -${rect.y}px;
          background-size: ${this._imageWidth}px ${this._imageHeight}px;
        "
        @pointerdown=${(e: PointerEvent) => this._onTilePointerDown(e, gid)}
        @pointerenter=${() => this._onTilePointerEnter(gid)}
      ></div>
    `;
  }

  /** Start a drag selection on pointer down. */
  private _onTilePointerDown(e: PointerEvent, gid: number): void {
    if (e.button !== 0) return;
    this._isDragging = true;
    this._dragStartGid = gid;
    this._stampGids = new Set<number>();
  }

  /** Update the drag selection as the pointer enters a new tile. */
  private _onTilePointerEnter(gid: number): void {
    if (!this._isDragging) return;
    this._updateDragHighlight(gid);
  }

  /** Finalize the selection on pointer up. */
  private _onGridPointerUp = (): void => {
    if (!this._isDragging) return;
    this._isDragging = false;
    this._finalizeDragSelection();
  };

  /** Cancel drag if pointer leaves the grid. */
  private _onGridPointerLeave = (): void => {
    if (!this._isDragging) return;
    this._isDragging = false;
    this._finalizeDragSelection();
  };

  /** Compute the rectangular region between dragStart and current GID. */
  private _getDragRect(endGid: number): { startCol: number; startRow: number; endCol: number; endRow: number } {
    const ts = this.tileset!;
    const startLocal = this._dragStartGid - ts.firstGid;
    const endLocal = endGid - ts.firstGid;

    const startCol = startLocal % ts.columns;
    const startRow = Math.floor(startLocal / ts.columns);
    const endCol = endLocal % ts.columns;
    const endRow = Math.floor(endLocal / ts.columns);

    return {
      startCol: Math.min(startCol, endCol),
      startRow: Math.min(startRow, endRow),
      endCol: Math.max(startCol, endCol),
      endRow: Math.max(startRow, endRow),
    };
  }

  /** Update the visual highlight during drag. */
  private _updateDragHighlight(endGid: number): void {
    const ts = this.tileset!;
    const { startCol, startRow, endCol, endRow } = this._getDragRect(endGid);
    const gids = new Set<number>();
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        gids.add(ts.firstGid + r * ts.columns + c);
      }
    }
    this._stampGids = gids;
  }

  /** Emit the correct event based on the final selection size. */
  private _finalizeDragSelection(): void {
    const stampGids = this._stampGids;

    // Single tile (click without drag, or 1x1 region)
    if (stampGids.size <= 1) {
      const gid = stampGids.size === 1 ? [...stampGids][0] : this._dragStartGid;
      this._stampGids = new Set<number>();
      this.selectedGid = gid;
      this.dispatchEvent(
        new CustomEvent<TileSelectDetail>('bs-tile-select', {
          detail: { gid },
          bubbles: true,
          composed: true,
        }),
      );
      return;
    }

    // Multi-tile stamp selection
    const ts = this.tileset!;
    // Find the top-left GID (smallest in the set)
    const sortedGids = [...stampGids].sort((a, b) => a - b);
    const topLeftGid = sortedGids[0];
    const bottomRightGid = sortedGids[sortedGids.length - 1];

    const topLeftLocal = topLeftGid - ts.firstGid;
    const bottomRightLocal = bottomRightGid - ts.firstGid;

    const startCol = topLeftLocal % ts.columns;
    const endCol = bottomRightLocal % ts.columns;
    const startRow = Math.floor(topLeftLocal / ts.columns);
    const endRow = Math.floor(bottomRightLocal / ts.columns);

    const width = endCol - startCol + 1;
    const height = endRow - startRow + 1;

    this.selectedGid = topLeftGid;
    this.dispatchEvent(
      new CustomEvent<StampSelectDetail>('bs-stamp-select', {
        detail: {
          topLeftGid,
          width,
          height,
          tilesetColumns: ts.columns,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'bs-tileset-panel': BsTilesetPanel;
  }
}
