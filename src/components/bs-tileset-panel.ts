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
    `,
  ];

  /** The tileset to display. */
  @property({ attribute: false }) tileset: TilesetModel | null = null;

  /** Currently selected GID. */
  @property({ type: Number, attribute: 'selected-gid' }) selectedGid = 0;

  /** Blob URL created from an ImageBitmap for use in CSS background-image. */
  @state() private _imageUrl = '';

  /** Cached image dimensions for background-size. */
  private _imageWidth = 0;
  private _imageHeight = 0;

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
      <div class="tile-grid" style=${style}>
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

    const selected = gid === this.selectedGid;
    return html`
      <div
        class="tile ${selected ? 'selected' : ''}"
        style="
          width: ${this.tileset!.tileWidth}px;
          height: ${this.tileset!.tileHeight}px;
          background-image: url(${this._imageUrl});
          background-position: -${rect.x}px -${rect.y}px;
          background-size: ${this._imageWidth}px ${this._imageHeight}px;
        "
        @click=${() => this._selectTile(gid)}
      ></div>
    `;
  }

  private _selectTile(gid: number): void {
    this.selectedGid = gid;
    this.dispatchEvent(
      new CustomEvent<TileSelectDetail>('bs-tile-select', {
        detail: { gid },
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
