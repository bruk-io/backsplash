/**
 * EditorStore — reactive state container for editor-wide state.
 *
 * Single source of truth for: active tool, active layer, selected tile,
 * tilemap reference, and viewport pan/zoom. UI components subscribe to
 * state changes via addEventListener('editor-state-change', ...).
 */

import type { TilemapModel } from './tilemap-model.js';

/** Tool identifiers available in the editor. */
export type ToolId = 'brush' | 'eraser' | 'fill' | 'eyedropper' | 'select';

/** Detail payload for editor-state-change events. */
export interface EditorStateChangeDetail {
  /** The property name that changed. */
  property: string;
}

/**
 * Reactive state container extending EventTarget.
 *
 * Dispatches a `CustomEvent<EditorStateChangeDetail>` named
 * `'editor-state-change'` whenever a property is updated via its setter.
 * Components subscribe with `addEventListener` and read current state
 * directly from the store instance.
 */
export class EditorStore extends EventTarget {
  private _activeTool: ToolId = 'brush';
  private _activeLayerIndex = 0;
  private _selectedGid = 0;
  private _tilemap: TilemapModel | null = null;
  private _zoom = 1;
  private _offsetX = 0;
  private _offsetY = 0;

  // ── Active tool ───────────────────────────────────────────────────

  get activeTool(): ToolId {
    return this._activeTool;
  }

  set activeTool(value: ToolId) {
    if (this._activeTool === value) return;
    this._activeTool = value;
    this._notify('activeTool');
  }

  // ── Active layer ──────────────────────────────────────────────────

  get activeLayerIndex(): number {
    return this._activeLayerIndex;
  }

  set activeLayerIndex(value: number) {
    if (this._activeLayerIndex === value) return;
    this._activeLayerIndex = value;
    this._notify('activeLayerIndex');
  }

  // ── Selected GID ──────────────────────────────────────────────────

  get selectedGid(): number {
    return this._selectedGid;
  }

  set selectedGid(value: number) {
    if (this._selectedGid === value) return;
    this._selectedGid = value;
    this._notify('selectedGid');
  }

  // ── Tilemap ───────────────────────────────────────────────────────

  get tilemap(): TilemapModel | null {
    return this._tilemap;
  }

  set tilemap(value: TilemapModel | null) {
    if (this._tilemap === value) return;
    this._tilemap = value;
    this._notify('tilemap');
  }

  // ── Viewport: zoom ────────────────────────────────────────────────

  get zoom(): number {
    return this._zoom;
  }

  set zoom(value: number) {
    if (this._zoom === value) return;
    this._zoom = value;
    this._notify('zoom');
  }

  // ── Viewport: offset ─────────────────────────────────────────────

  get offsetX(): number {
    return this._offsetX;
  }

  set offsetX(value: number) {
    if (this._offsetX === value) return;
    this._offsetX = value;
    this._notify('offsetX');
  }

  get offsetY(): number {
    return this._offsetY;
  }

  set offsetY(value: number) {
    if (this._offsetY === value) return;
    this._offsetY = value;
    this._notify('offsetY');
  }

  // ── Internal ──────────────────────────────────────────────────────

  /** Dispatch a state-change event for the given property. */
  private _notify(property: string): void {
    this.dispatchEvent(
      new CustomEvent<EditorStateChangeDetail>('editor-state-change', {
        detail: { property },
      }),
    );
  }
}
