import { html, css } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import { BaseElement } from '@bruk-io/bh-01';
import type { TilemapModel } from '../models/tilemap-model.js';
import type { TileLayer } from '../models/layer-model.js';
import {
  getVisibleTileRange,
  screenToTile,
  zoomAtPoint,
  pan,
  tileToScreen,
  type Viewport,
} from '../models/viewport.js';

/** Zoom multiplier per wheel delta unit. */
const ZOOM_FACTOR = 0.001;

/** Minimum zoom level. */
const MIN_ZOOM = 0.25;

/** Maximum zoom level. */
const MAX_ZOOM = 4;

/** Viewport change event detail. */
export interface ViewportChangeDetail {
  zoom: number;
  offsetX: number;
  offsetY: number;
}

/** Cell hover event detail. */
export interface CellHoverDetail {
  col: number;
  row: number;
}

/**
 * Map canvas component — renders tilemap data onto an HTML canvas.
 *
 * Handle pan (middle-click drag or Space+drag), zoom (scroll wheel
 * centered on cursor), viewport culling, and grid overlay.
 */
@customElement('bs-map-canvas')
export class BsMapCanvas extends BaseElement {
  static override styles = [
    ...([BaseElement.styles].flat()),
    css`
      :host {
        display: block;
        width: 100%;
        height: 100%;
        overflow: hidden;
      }

      canvas {
        display: block;
        width: 100%;
        height: 100%;
      }
    `,
  ];

  /** The tilemap to render — set by parent. */
  @property({ attribute: false }) tilemap: TilemapModel | null = null;

  /** Whether to show the grid overlay. */
  @property({ type: Boolean, attribute: 'show-grid' }) showGrid = true;

  /** Viewport offset X (pan). */
  @state() private _offsetX = 0;

  /** Viewport offset Y (pan). */
  @state() private _offsetY = 0;

  /** Zoom scale factor. */
  @state() private _zoom = 1;

  /** Current viewport state derived from offset and zoom. */
  private get _viewport(): Viewport {
    return { offsetX: this._offsetX, offsetY: this._offsetY, zoom: this._zoom };
  }

  /** Whether panning is active. */
  private _isPanning = false;

  /** Whether space key is held. */
  private _spaceDown = false;

  /** Last pointer position during pan. */
  private _lastPanX = 0;
  private _lastPanY = 0;

  /** Canvas element reference. */
  @query('canvas') private _canvas!: HTMLCanvasElement;

  /** ResizeObserver for tracking container size. */
  private _resizeObserver: ResizeObserver | null = null;

  /** Canvas pixel dimensions (physical). */
  private _canvasWidth = 0;
  private _canvasHeight = 0;

  /** Animation frame request ID. */
  private _rafId = 0;

  /** Whether a render is pending. */
  private _renderPending = false;

  // ── Lifecycle ────────────────────────────────────────────────────────

  override connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = 0;
    }
  }

  override firstUpdated(): void {
    this._resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        this._updateCanvasSize(width, height);
      }
    });
    this._resizeObserver.observe(this._canvas);
    this._scheduleRender();
  }

  override updated(): void {
    this._scheduleRender();
  }

  override render() {
    return html`
      <canvas
        @wheel=${this._onWheel}
        @pointerdown=${this._onPointerDown}
        @pointermove=${this._onPointerMove}
        @pointerup=${this._onPointerUp}
        @pointerleave=${this._onPointerLeave}
        @contextmenu=${this._onContextMenu}
      ></canvas>
    `;
  }

  // ── Canvas sizing ────────────────────────────────────────────────────

  /** Update the canvas backing store size to match its CSS layout. */
  private _updateCanvasSize(width: number, height: number): void {
    const dpr = window.devicePixelRatio || 1;
    this._canvasWidth = Math.round(width * dpr);
    this._canvasHeight = Math.round(height * dpr);
    this._canvas.width = this._canvasWidth;
    this._canvas.height = this._canvasHeight;
    this._scheduleRender();
  }

  // ── Render scheduling ────────────────────────────────────────────────

  /** Request a canvas render on the next animation frame. */
  private _scheduleRender(): void {
    if (this._renderPending) return;
    this._renderPending = true;
    this._rafId = requestAnimationFrame(() => {
      this._renderPending = false;
      this._renderCanvas();
    });
  }

  // ── Canvas rendering ─────────────────────────────────────────────────

  /** Render the full canvas: tiles + grid overlay. */
  private _renderCanvas(): void {
    const canvas = this._canvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Clear
    const cssWidth = canvas.width / dpr;
    const cssHeight = canvas.height / dpr;
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const map = this.tilemap;
    if (!map) return;

    const vp = this._viewport;

    // Calculate visible tile range (viewport culling)
    const { startCol, startRow, endCol, endRow } = getVisibleTileRange(
      vp,
      cssWidth,
      cssHeight,
      map.width,
      map.height,
      map.tileWidth,
      map.tileHeight,
    );

    // Render tile layers bottom to top
    ctx.imageSmoothingEnabled = false;

    for (let li = 0; li < map.layers.length; li++) {
      const layer = map.layers[li];
      if (layer.type !== 'tile' || !layer.visible) continue;
      const tileLayer = layer as TileLayer;

      const prevAlpha = ctx.globalAlpha;
      ctx.globalAlpha = tileLayer.opacity;

      for (let row = startRow; row < endRow; row++) {
        for (let col = startCol; col < endCol; col++) {
          const gid = map.getCellGid(li, col, row);
          if (gid === 0) continue;

          const tileset = map.getTilesetForGid(gid);
          if (!tileset || !tileset.image) continue;

          const rect = tileset.getTileRect(gid);
          if (!rect) continue;

          const dest = tileToScreen(col, row, vp, map.tileWidth, map.tileHeight);

          ctx.drawImage(
            tileset.image as CanvasImageSource,
            rect.x,
            rect.y,
            tileset.tileWidth,
            tileset.tileHeight,
            dest.x,
            dest.y,
            dest.width,
            dest.height,
          );
        }
      }

      ctx.globalAlpha = prevAlpha;
    }

    // Grid overlay
    if (this.showGrid) {
      this._renderGrid(ctx, cssWidth, cssHeight, startCol, startRow, endCol, endRow);
    }
  }

  /** Draw grid lines at tile boundaries within the visible range. */
  private _renderGrid(
    ctx: CanvasRenderingContext2D,
    cssWidth: number,
    cssHeight: number,
    startCol: number,
    startRow: number,
    endCol: number,
    endRow: number,
  ): void {
    const map = this.tilemap;
    if (!map) return;

    const vp = this._viewport;
    const tw = map.tileWidth;
    const th = map.tileHeight;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();

    // Vertical lines
    for (let col = startCol; col <= endCol; col++) {
      const dest = tileToScreen(col, 0, vp, tw, th);
      const x = Math.round(dest.x) + 0.5;
      const yStartDest = tileToScreen(0, startRow, vp, tw, th);
      const yEndDest = tileToScreen(0, endRow, vp, tw, th);
      const yStart = Math.max(0, yStartDest.y);
      const yEnd = Math.min(cssHeight, yEndDest.y);
      ctx.moveTo(x, yStart);
      ctx.lineTo(x, yEnd);
    }

    // Horizontal lines
    for (let row = startRow; row <= endRow; row++) {
      const dest = tileToScreen(0, row, vp, tw, th);
      const y = Math.round(dest.y) + 0.5;
      const xStartDest = tileToScreen(startCol, 0, vp, tw, th);
      const xEndDest = tileToScreen(endCol, 0, vp, tw, th);
      const xStart = Math.max(0, xStartDest.x);
      const xEnd = Math.min(cssWidth, xEndDest.x);
      ctx.moveTo(xStart, y);
      ctx.lineTo(xEnd, y);
    }

    ctx.stroke();
  }

  // ── Event handlers ───────────────────────────────────────────────────

  /** Prevent default context menu on canvas. */
  private _onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  /** Handle scroll wheel for zoom (centered on cursor). */
  private _onWheel = (e: WheelEvent): void => {
    e.preventDefault();

    const rect = this._canvas.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;
    const delta = -e.deltaY * ZOOM_FACTOR;

    const newVp = zoomAtPoint(this._viewport, cursorX, cursorY, delta, MIN_ZOOM, MAX_ZOOM);
    this._offsetX = newVp.offsetX;
    this._offsetY = newVp.offsetY;
    this._zoom = newVp.zoom;

    this._emitViewportChange();
  };

  /** Handle pointer down — start panning on middle-click or Space+click. */
  private _onPointerDown = (e: PointerEvent): void => {
    // Middle mouse button (1) or space + left click (0)
    if (e.button === 1 || (e.button === 0 && this._spaceDown)) {
      e.preventDefault();
      this._isPanning = true;
      this._lastPanX = e.clientX;
      this._lastPanY = e.clientY;
      this._canvas.setPointerCapture(e.pointerId);
    }
  };

  /** Handle pointer move — pan or emit hover position. */
  private _onPointerMove = (e: PointerEvent): void => {
    if (this._isPanning) {
      const dx = e.clientX - this._lastPanX;
      const dy = e.clientY - this._lastPanY;
      this._lastPanX = e.clientX;
      this._lastPanY = e.clientY;
      const newVp = pan(this._viewport, dx, dy);
      this._offsetX = newVp.offsetX;
      this._offsetY = newVp.offsetY;
      this._emitViewportChange();
      return;
    }

    // Emit cell hover
    this._emitCellHover(e);
  };

  /** Handle pointer up — stop panning. */
  private _onPointerUp = (e: PointerEvent): void => {
    if (this._isPanning) {
      this._isPanning = false;
      this._canvas.releasePointerCapture(e.pointerId);
    }
  };

  /** Handle pointer leaving the canvas. */
  private _onPointerLeave = (e: PointerEvent): void => {
    if (this._isPanning) {
      this._isPanning = false;
      this._canvas.releasePointerCapture(e.pointerId);
    }
  };

  /** Track space key for Space+drag panning. */
  private _onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Space') {
      this._spaceDown = true;
    }
  };

  /** Release space key. */
  private _onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'Space') {
      this._spaceDown = false;
    }
  };

  // ── Event emission ───────────────────────────────────────────────────

  /** Dispatch viewport change event. */
  private _emitViewportChange(): void {
    this.dispatchEvent(
      new CustomEvent<ViewportChangeDetail>('bs-viewport-change', {
        detail: {
          zoom: this._zoom,
          offsetX: this._offsetX,
          offsetY: this._offsetY,
        },
        bubbles: true,
        composed: true,
      }),
    );
    this._scheduleRender();
  }

  /** Dispatch cell hover event based on pointer position. */
  private _emitCellHover(e: PointerEvent): void {
    const map = this.tilemap;
    if (!map) return;

    const rect = this._canvas.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    const tile = screenToTile(
      cursorX,
      cursorY,
      this._viewport,
      map.width,
      map.height,
      map.tileWidth,
      map.tileHeight,
    );

    if (tile) {
      this.dispatchEvent(
        new CustomEvent<CellHoverDetail>('bs-cell-hover', {
          detail: { col: tile.col, row: tile.row },
          bubbles: true,
          composed: true,
        }),
      );
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'bs-map-canvas': BsMapCanvas;
  }
}
