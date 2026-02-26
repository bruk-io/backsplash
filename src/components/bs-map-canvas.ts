import { html, css } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import { BaseElement } from '@bruk-io/bh-01';
import type { TilemapModel } from '../models/tilemap-model.js';
import type { TileLayer, ObjectLayer, MapObject } from '../models/layer-model.js';
import type { Stamp } from '../models/selection-model.js';
import {
  getVisibleTileRange,
  screenToTile,
  zoomAtPoint,
  pan,
  tileToScreen,
  type Viewport,
} from '../models/viewport.js';
import { dispatch, type Command, type EditorState } from '../models/tool-engine.js';

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

/** Paint event detail — carries the command produced by a tool. */
export interface PaintDetail {
  command: Command;
}

/** Eyedrop event detail — carries the GID picked by the eyedropper tool. */
export interface EyedropDetail {
  gid: number;
}

/** Object place event detail — carries the placed object bounds in map pixel coords. */
export interface ObjectPlaceDetail {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Object select event detail — carries the selected object ID (-1 for deselect). */
export interface ObjectSelectDetail {
  objectId: number;
}

/** Object move event detail — carries the moved object ID and new position. */
export interface ObjectMoveDetail {
  objectId: number;
  x: number;
  y: number;
}

/** Object resize event detail — carries the resized object ID and new bounds. */
export interface ObjectResizeDetail {
  objectId: number;
  x: number;
  y: number;
  width: number;
  height: number;
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

  /** Active tool name (e.g. 'brush'). */
  @property({ attribute: false }) activeTool: string = 'brush';

  /** Index of the active layer for painting. */
  @property({ attribute: false }) activeLayerIndex: number = 0;

  /** Currently selected tile GID. 0 means no tile selected. */
  @property({ attribute: false }) selectedGid: number = 0;

  /** Multi-tile stamp selection, or null for single-tile brush. */
  @property({ attribute: false }) stamp: Stamp | null = null;

  /** Monotonic counter — bump to force canvas re-render when tilemap is mutated in place. */
  @property({ type: Number }) renderVersion = 0;

  /** ID of the currently selected object, or -1 for none. */
  @property({ type: Number }) selectedObjectId = -1;

  /** Whether the active layer is an object layer (set by parent). */
  @property({ type: Boolean, attribute: 'object-mode' }) objectMode = false;

  /** When true, pause the rAF render loop (renders once then stops). Used by Playwright for screenshots. */
  @property({ type: Boolean, reflect: true }) freeze = false;

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

  /** Whether a paint drag is active. */
  private _isPainting = false;

  /** Cells painted during the current drag stroke ("col,row" keys). */
  private _paintedCells = new Set<string>();

  /** Current hover tile position for ghost preview (-1 means not hovering). */
  private _hoverCol = -1;
  private _hoverRow = -1;

  // ── Object interaction state ──────────────────────────────────────

  /** Whether an object drag (place, move, or resize) is active. */
  private _isObjectDragging = false;

  /** What kind of object drag is happening. */
  private _objectDragType: 'place' | 'move' | 'resize' | null = null;

  /** Starting map-pixel position of object drag. */
  private _objectDragStartX = 0;
  private _objectDragStartY = 0;

  /** Current map-pixel position during object drag. */
  private _objectDragCurrentX = 0;
  private _objectDragCurrentY = 0;

  /** The object being moved (original position for undo). */
  private _movingObjectId = -1;
  private _movingObjectStartX = 0;
  private _movingObjectStartY = 0;

  /** Resize handle index (0-7: TL, TR, BL, BR, T, B, L, R). */
  private _resizeHandleIndex = -1;
  private _resizeOrigX = 0;
  private _resizeOrigY = 0;
  private _resizeOrigW = 0;
  private _resizeOrigH = 0;

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
    if (this._renderPending || this.freeze) return;
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

    // Render object layers
    this._renderObjectLayers(ctx, map, vp);

    // Object placement preview
    this._renderPlacementPreview(ctx);

    // Ghost preview (stamp or single tile) at hover position
    if (this._hoverCol >= 0 && this._hoverRow >= 0 && !this._isPainting && !this._isPanning) {
      this._renderGhostPreview(ctx, map, vp);
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

  // ── Ghost preview ──────────────────────────────────────────────────

  /** Render a semi-transparent preview of the brush/stamp at the hover position. */
  private _renderGhostPreview(
    ctx: CanvasRenderingContext2D,
    map: TilemapModel,
    vp: Viewport,
  ): void {
    // Only show ghost for brush tool with a selected tile
    if (this.activeTool !== 'brush' || this.selectedGid === 0) return;

    ctx.globalAlpha = 0.4;
    ctx.imageSmoothingEnabled = false;

    if (this.stamp) {
      // Multi-tile stamp ghost
      for (let sr = 0; sr < this.stamp.height; sr++) {
        for (let sc = 0; sc < this.stamp.width; sc++) {
          const gid = this.stamp.gids[sr * this.stamp.width + sc];
          if (gid === 0) continue;

          const c = this._hoverCol + sc;
          const r = this._hoverRow + sr;
          if (c < 0 || c >= map.width || r < 0 || r >= map.height) continue;

          this._renderGhostTile(ctx, map, vp, gid, c, r);
        }
      }
    } else {
      // Single tile ghost
      if (this._hoverCol >= 0 && this._hoverCol < map.width &&
          this._hoverRow >= 0 && this._hoverRow < map.height) {
        this._renderGhostTile(ctx, map, vp, this.selectedGid, this._hoverCol, this._hoverRow);
      }
    }

    ctx.globalAlpha = 1;
  }

  /** Render a single ghost tile at the given map position. */
  private _renderGhostTile(
    ctx: CanvasRenderingContext2D,
    map: TilemapModel,
    vp: Viewport,
    gid: number,
    col: number,
    row: number,
  ): void {
    const tileset = map.getTilesetForGid(gid);
    if (!tileset || !tileset.image) return;

    const rect = tileset.getTileRect(gid);
    if (!rect) return;

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

  // ── Object layer rendering ───────────────────────────────────────────

  /** Color palette for object types. */
  private static readonly _OBJECT_COLORS = [
    'rgba(59, 130, 246, 0.35)',  // blue
    'rgba(16, 185, 129, 0.35)',  // green
    'rgba(245, 158, 11, 0.35)',  // amber
    'rgba(239, 68, 68, 0.35)',   // red
    'rgba(139, 92, 246, 0.35)',  // purple
    'rgba(236, 72, 153, 0.35)',  // pink
  ];

  private static readonly _OBJECT_BORDER_COLORS = [
    'rgb(59, 130, 246)',
    'rgb(16, 185, 129)',
    'rgb(245, 158, 11)',
    'rgb(239, 68, 68)',
    'rgb(139, 92, 246)',
    'rgb(236, 72, 153)',
  ];

  /** Map type strings to consistent color indices. */
  private _typeColorMap = new Map<string, number>();
  private _nextColorIndex = 0;

  private _getTypeColorIndex(type: string): number {
    let idx = this._typeColorMap.get(type);
    if (idx === undefined) {
      idx = this._nextColorIndex % BsMapCanvas._OBJECT_COLORS.length;
      this._nextColorIndex++;
      this._typeColorMap.set(type, idx);
    }
    return idx;
  }

  /** Render all visible object layers. */
  private _renderObjectLayers(
    ctx: CanvasRenderingContext2D,
    map: TilemapModel,
    vp: Viewport,
  ): void {
    for (let li = 0; li < map.layers.length; li++) {
      const layer = map.layers[li];
      if (layer.type !== 'object' || !layer.visible) continue;

      const prevAlpha = ctx.globalAlpha;
      ctx.globalAlpha = layer.opacity;

      for (const obj of (layer as ObjectLayer).objects) {
        this._renderObject(ctx, vp, map, obj);
      }

      ctx.globalAlpha = prevAlpha;
    }
  }

  /** Render a single object as a colored rectangle or crosshair point. */
  private _renderObject(
    ctx: CanvasRenderingContext2D,
    vp: Viewport,
    _map: TilemapModel,
    obj: MapObject,
  ): void {
    const colorIdx = this._getTypeColorIndex(obj.type);
    const fillColor = BsMapCanvas._OBJECT_COLORS[colorIdx];
    const borderColor = BsMapCanvas._OBJECT_BORDER_COLORS[colorIdx];
    const isSelected = obj.id === this.selectedObjectId;

    // Convert object pixel coords to screen coords
    const sx = obj.x * vp.zoom + vp.offsetX;
    const sy = obj.y * vp.zoom + vp.offsetY;

    if (obj.width === 0 && obj.height === 0) {
      // Point object — draw crosshair
      const size = 8;
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = isSelected ? 2 : 1.5;
      ctx.beginPath();
      ctx.moveTo(sx - size, sy);
      ctx.lineTo(sx + size, sy);
      ctx.moveTo(sx, sy - size);
      ctx.lineTo(sx, sy + size);
      ctx.stroke();

      // Circle at center
      ctx.beginPath();
      ctx.arc(sx, sy, 4, 0, Math.PI * 2);
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.stroke();
    } else {
      // Rectangle object
      const sw = obj.width * vp.zoom;
      const sh = obj.height * vp.zoom;

      ctx.fillStyle = fillColor;
      ctx.fillRect(sx, sy, sw, sh);

      ctx.strokeStyle = isSelected ? 'rgb(255, 255, 255)' : borderColor;
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeRect(sx, sy, sw, sh);

      // Selection handles
      if (isSelected) {
        this._renderSelectionHandles(ctx, sx, sy, sw, sh);
      }
    }

    // Type label
    const label = obj.name || obj.type;
    if (label) {
      ctx.font = '11px sans-serif';
      ctx.fillStyle = borderColor;
      ctx.fillText(label, sx + 3, sy - 4);
    }
  }

  /** Draw resize handles at corners and edge midpoints. */
  private _renderSelectionHandles(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    const size = 6;
    const half = size / 2;
    ctx.fillStyle = 'rgb(255, 255, 255)';
    ctx.strokeStyle = 'rgb(59, 130, 246)';
    ctx.lineWidth = 1;

    const handles = [
      [x, y], [x + w, y], [x, y + h], [x + w, y + h], // corners
      [x + w / 2, y], [x + w / 2, y + h], // top/bottom mid
      [x, y + h / 2], [x + w, y + h / 2], // left/right mid
    ];

    for (const [hx, hy] of handles) {
      ctx.fillRect(hx - half, hy - half, size, size);
      ctx.strokeRect(hx - half, hy - half, size, size);
    }
  }

  // ── Object interaction helpers ──────────────────────────────────────

  /** Convert screen coordinates to map pixel coordinates. */
  private _screenToMapPixel(screenX: number, screenY: number): { x: number; y: number } {
    const vp = this._viewport;
    return {
      x: (screenX - vp.offsetX) / vp.zoom,
      y: (screenY - vp.offsetY) / vp.zoom,
    };
  }

  /** Hit-test objects on the active layer. Returns the topmost object ID at the point, or -1. */
  private _hitTestObject(mapX: number, mapY: number): number {
    const map = this.tilemap;
    if (!map) return -1;

    const layer = map.getLayer(this.activeLayerIndex);
    if (!layer || layer.type !== 'object') return -1;

    const objects = (layer as ObjectLayer).objects;
    // Iterate in reverse so topmost (last added) wins
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i];
      if (obj.width === 0 && obj.height === 0) {
        // Point object — hit within 8px radius (in map coords)
        const dist = Math.sqrt((mapX - obj.x) ** 2 + (mapY - obj.y) ** 2);
        if (dist <= 8 / this._viewport.zoom) return obj.id;
      } else {
        // Rectangle object
        if (mapX >= obj.x && mapX <= obj.x + obj.width &&
            mapY >= obj.y && mapY <= obj.y + obj.height) {
          return obj.id;
        }
      }
    }
    return -1;
  }

  /** Hit-test resize handles of the selected object. Returns handle index (0-7) or -1. */
  private _hitTestHandle(screenX: number, screenY: number): number {
    const map = this.tilemap;
    if (!map || this.selectedObjectId < 0) return -1;

    const layer = map.getLayer(this.activeLayerIndex);
    if (!layer || layer.type !== 'object') return -1;

    const obj = (layer as ObjectLayer).objects.find(o => o.id === this.selectedObjectId);
    if (!obj || (obj.width === 0 && obj.height === 0)) return -1;

    const vp = this._viewport;
    const sx = obj.x * vp.zoom + vp.offsetX;
    const sy = obj.y * vp.zoom + vp.offsetY;
    const sw = obj.width * vp.zoom;
    const sh = obj.height * vp.zoom;

    const handles = [
      [sx, sy], [sx + sw, sy], [sx, sy + sh], [sx + sw, sy + sh], // corners: TL, TR, BL, BR
      [sx + sw / 2, sy], [sx + sw / 2, sy + sh], // edges: T, B
      [sx, sy + sh / 2], [sx + sw, sy + sh / 2], // edges: L, R
    ];

    const hitSize = 8;
    for (let i = 0; i < handles.length; i++) {
      const [hx, hy] = handles[i];
      if (Math.abs(screenX - hx) <= hitSize && Math.abs(screenY - hy) <= hitSize) {
        return i;
      }
    }
    return -1;
  }

  /** Render the placement preview rectangle during object drag. */
  private _renderPlacementPreview(ctx: CanvasRenderingContext2D): void {
    if (!this._isObjectDragging || this._objectDragType !== 'place') return;

    const vp = this._viewport;
    const x1 = Math.min(this._objectDragStartX, this._objectDragCurrentX);
    const y1 = Math.min(this._objectDragStartY, this._objectDragCurrentY);
    const x2 = Math.max(this._objectDragStartX, this._objectDragCurrentX);
    const y2 = Math.max(this._objectDragStartY, this._objectDragCurrentY);

    const sx = x1 * vp.zoom + vp.offsetX;
    const sy = y1 * vp.zoom + vp.offsetY;
    const sw = (x2 - x1) * vp.zoom;
    const sh = (y2 - y1) * vp.zoom;

    ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
    ctx.strokeStyle = 'rgb(59, 130, 246)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.fillRect(sx, sy, sw, sh);
    ctx.strokeRect(sx, sy, sw, sh);
    ctx.setLineDash([]);
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

  /** Handle pointer down — start panning on middle-click or Space+click, painting on left-click. */
  private _onPointerDown = (e: PointerEvent): void => {
    // Middle mouse button (1) or space + left click (0) → pan
    if (e.button === 1 || (e.button === 0 && this._spaceDown)) {
      e.preventDefault();
      this._isPanning = true;
      this._lastPanX = e.clientX;
      this._lastPanY = e.clientY;
      this._canvas.setPointerCapture(e.pointerId);
      return;
    }

    // Left-click without space
    if (e.button === 0) {
      e.preventDefault();
      this._canvas.setPointerCapture(e.pointerId);

      // Object mode — handle object interactions
      if (this.objectMode) {
        this._onObjectPointerDown(e);
        return;
      }

      // Tile mode — paint
      this._isPainting = true;
      this._paintedCells.clear();

      const tile = this._getTileFromPointer(e);
      if (tile) {
        this._paintAtCell(tile.col, tile.row, 'down');
      }
    }
  };

  /** Handle pointer move — pan, paint, object drag, or emit hover position. */
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

    if (this._isObjectDragging) {
      this._onObjectPointerMove(e);
      return;
    }

    if (this._isPainting) {
      const tile = this._getTileFromPointer(e);
      if (tile) {
        this._paintAtCell(tile.col, tile.row, 'move');
      }
      return;
    }

    // Emit cell hover
    this._emitCellHover(e);
  };

  /** Handle pointer up — stop panning, painting, or object dragging. */
  private _onPointerUp = (e: PointerEvent): void => {
    if (this._isPanning) {
      this._isPanning = false;
      this._canvas.releasePointerCapture(e.pointerId);
      return;
    }

    if (this._isObjectDragging) {
      this._onObjectPointerUp(e);
      return;
    }

    if (this._isPainting) {
      this._isPainting = false;
      this._paintedCells.clear();
      this._canvas.releasePointerCapture(e.pointerId);
      this.dispatchEvent(
        new CustomEvent('bs-paint-end', {
          bubbles: true,
          composed: true,
        }),
      );
    }
  };

  /** Handle pointer leaving the canvas. */
  private _onPointerLeave = (e: PointerEvent): void => {
    // Clear ghost preview
    this._hoverCol = -1;
    this._hoverRow = -1;
    this._scheduleRender();

    if (this._isPanning) {
      this._isPanning = false;
      this._canvas.releasePointerCapture(e.pointerId);
    }
    if (this._isObjectDragging) {
      this._isObjectDragging = false;
      this._objectDragType = null;
    }
    if (this._isPainting) {
      this._isPainting = false;
      this._paintedCells.clear();
      this._canvas.releasePointerCapture(e.pointerId);
      this.dispatchEvent(
        new CustomEvent('bs-paint-end', {
          bubbles: true,
          composed: true,
        }),
      );
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

  // ── Object pointer handlers ──────────────────────────────────────────

  /** Handle pointer down in object mode. */
  private _onObjectPointerDown(e: PointerEvent): void {
    const rect = this._canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const mapPos = this._screenToMapPixel(screenX, screenY);

    // Check resize handles first (if an object is selected)
    const handleIdx = this._hitTestHandle(screenX, screenY);
    if (handleIdx >= 0) {
      const map = this.tilemap;
      if (!map) return;
      const layer = map.getLayer(this.activeLayerIndex);
      if (!layer || layer.type !== 'object') return;
      const obj = (layer as ObjectLayer).objects.find(o => o.id === this.selectedObjectId);
      if (!obj) return;

      this._isObjectDragging = true;
      this._objectDragType = 'resize';
      this._resizeHandleIndex = handleIdx;
      this._resizeOrigX = obj.x;
      this._resizeOrigY = obj.y;
      this._resizeOrigW = obj.width;
      this._resizeOrigH = obj.height;
      this._objectDragStartX = mapPos.x;
      this._objectDragStartY = mapPos.y;
      return;
    }

    // Check if clicking on an existing object
    const hitId = this._hitTestObject(mapPos.x, mapPos.y);
    if (hitId >= 0) {
      // Select and start move
      this.dispatchEvent(
        new CustomEvent<ObjectSelectDetail>('bs-object-select', {
          detail: { objectId: hitId },
          bubbles: true,
          composed: true,
        }),
      );

      const map = this.tilemap;
      if (!map) return;
      const layer = map.getLayer(this.activeLayerIndex);
      if (!layer || layer.type !== 'object') return;
      const obj = (layer as ObjectLayer).objects.find(o => o.id === hitId);
      if (!obj) return;

      this._isObjectDragging = true;
      this._objectDragType = 'move';
      this._movingObjectId = hitId;
      this._movingObjectStartX = obj.x;
      this._movingObjectStartY = obj.y;
      this._objectDragStartX = mapPos.x;
      this._objectDragStartY = mapPos.y;
      return;
    }

    // Clicked on empty space — deselect if something was selected
    if (this.selectedObjectId >= 0) {
      this.dispatchEvent(
        new CustomEvent<ObjectSelectDetail>('bs-object-select', {
          detail: { objectId: -1 },
          bubbles: true,
          composed: true,
        }),
      );
    }

    // Start placing a new object (if place-object tool is active)
    if (this.activeTool === 'place-object') {
      this._isObjectDragging = true;
      this._objectDragType = 'place';
      this._objectDragStartX = mapPos.x;
      this._objectDragStartY = mapPos.y;
      this._objectDragCurrentX = mapPos.x;
      this._objectDragCurrentY = mapPos.y;
    }
  }

  /** Handle pointer move in object mode. */
  private _onObjectPointerMove(e: PointerEvent): void {
    const rect = this._canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const mapPos = this._screenToMapPixel(screenX, screenY);

    if (this._objectDragType === 'place') {
      this._objectDragCurrentX = mapPos.x;
      this._objectDragCurrentY = mapPos.y;
      this._scheduleRender();
    } else if (this._objectDragType === 'move') {
      const dx = mapPos.x - this._objectDragStartX;
      const dy = mapPos.y - this._objectDragStartY;
      const newX = this._movingObjectStartX + dx;
      const newY = this._movingObjectStartY + dy;
      this.dispatchEvent(
        new CustomEvent<ObjectMoveDetail>('bs-object-move', {
          detail: { objectId: this._movingObjectId, x: Math.round(newX), y: Math.round(newY) },
          bubbles: true,
          composed: true,
        }),
      );
    } else if (this._objectDragType === 'resize') {
      const bounds = this._calculateResize(mapPos.x, mapPos.y);
      this.dispatchEvent(
        new CustomEvent<ObjectResizeDetail>('bs-object-resize', {
          detail: {
            objectId: this.selectedObjectId,
            x: Math.round(bounds.x),
            y: Math.round(bounds.y),
            width: Math.round(bounds.width),
            height: Math.round(bounds.height),
          },
          bubbles: true,
          composed: true,
        }),
      );
    }
  }

  /** Handle pointer up in object mode. */
  private _onObjectPointerUp(e: PointerEvent): void {
    this._canvas.releasePointerCapture(e.pointerId);

    if (this._objectDragType === 'place') {
      const x = Math.round(Math.min(this._objectDragStartX, this._objectDragCurrentX));
      const y = Math.round(Math.min(this._objectDragStartY, this._objectDragCurrentY));
      const w = Math.round(Math.abs(this._objectDragCurrentX - this._objectDragStartX));
      const h = Math.round(Math.abs(this._objectDragCurrentY - this._objectDragStartY));

      this.dispatchEvent(
        new CustomEvent<ObjectPlaceDetail>('bs-object-place', {
          detail: { x, y, width: w, height: h },
          bubbles: true,
          composed: true,
        }),
      );
    } else if (this._objectDragType === 'move') {
      // Move end — shell already applied live updates, just emit paint-end for history
      this.dispatchEvent(new CustomEvent('bs-object-drag-end', { bubbles: true, composed: true }));
    } else if (this._objectDragType === 'resize') {
      this.dispatchEvent(new CustomEvent('bs-object-drag-end', { bubbles: true, composed: true }));
    }

    this._isObjectDragging = false;
    this._objectDragType = null;
    this._scheduleRender();
  }

  /** Calculate new bounds during resize based on handle and current mouse position. */
  private _calculateResize(mapX: number, mapY: number): { x: number; y: number; width: number; height: number } {
    let x = this._resizeOrigX;
    let y = this._resizeOrigY;
    let w = this._resizeOrigW;
    let h = this._resizeOrigH;
    const dx = mapX - this._objectDragStartX;
    const dy = mapY - this._objectDragStartY;

    // Handle indices: 0=TL, 1=TR, 2=BL, 3=BR, 4=T, 5=B, 6=L, 7=R
    switch (this._resizeHandleIndex) {
      case 0: // TL
        x += dx; y += dy; w -= dx; h -= dy;
        break;
      case 1: // TR
        y += dy; w += dx; h -= dy;
        break;
      case 2: // BL
        x += dx; w -= dx; h += dy;
        break;
      case 3: // BR
        w += dx; h += dy;
        break;
      case 4: // T
        y += dy; h -= dy;
        break;
      case 5: // B
        h += dy;
        break;
      case 6: // L
        x += dx; w -= dx;
        break;
      case 7: // R
        w += dx;
        break;
    }

    // Enforce minimum size
    if (w < 1) { w = 1; }
    if (h < 1) { h = 1; }

    return { x, y, width: w, height: h };
  }

  // ── Painting helpers ─────────────────────────────────────────────────

  /** Convert a pointer event to tile coordinates, or null if out of bounds. */
  private _getTileFromPointer(e: PointerEvent): { col: number; row: number } | null {
    const map = this.tilemap;
    if (!map) return null;

    const rect = this._canvas.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    return screenToTile(
      cursorX,
      cursorY,
      this._viewport,
      map.width,
      map.height,
      map.tileWidth,
      map.tileHeight,
    );
  }

  /**
   * Paint at the given cell using the tool engine.
   *
   * Skip if the cell was already painted in this drag stroke.
   * Dispatch a `bs-paint` event with the resulting command.
   */
  private _paintAtCell(col: number, row: number, eventType: 'down' | 'move'): void {
    const map = this.tilemap;
    if (!map) return;

    const key = `${col},${row}`;
    if (this._paintedCells.has(key)) return;
    this._paintedCells.add(key);

    const editorState: EditorState = {
      activeTool: this.activeTool,
      activeLayerIndex: this.activeLayerIndex,
      selectedGid: this.selectedGid,
      stamp: this.stamp,
      onEyedrop: (gid: number) => {
        this.dispatchEvent(
          new CustomEvent<EyedropDetail>('bs-eyedrop', {
            detail: { gid },
            bubbles: true,
            composed: true,
          }),
        );
      },
    };

    const command = dispatch({ type: eventType, col, row }, editorState, map);

    if (command) {
      this.dispatchEvent(
        new CustomEvent<PaintDetail>('bs-paint', {
          detail: { command },
          bubbles: true,
          composed: true,
        }),
      );
      this._scheduleRender();
    }
  }

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

      // Track hover for ghost preview
      if (this._hoverCol !== tile.col || this._hoverRow !== tile.row) {
        this._hoverCol = tile.col;
        this._hoverRow = tile.row;
        this._scheduleRender();
      }
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'bs-map-canvas': BsMapCanvas;
  }
}
