import { html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { BaseElement, BhIcon } from '@bruk-io/bh-01';
import { TilemapModel } from '../models/tilemap-model.js';
import { TilesetModel } from '../models/tileset-model.js';
import { EditorStore } from '../models/editor-store.js';
import { SelectionModel, type Stamp } from '../models/selection-model.js';
import { TileDetectorWrapper } from '../workers/tile-detector-wrapper.js';
import { saveToJson, loadFromJson, exportToTiledJson, exportToRawArrays } from '../models/serializer.js';
import type { ToolId } from '../models/editor-store.js';
import type {
  Command, CellEdit, AddLayerCommand, DeleteLayerCommand,
  ReorderLayerCommand, RenameLayerCommand, AddObjectCommand,
  DeleteObjectCommand, MoveObjectCommand, EditObjectCommand,
} from '../models/tool-engine.js';
import { HistoryManager } from '../models/history-manager.js';
import type { TileSizeCandidate } from '../workers/tile-detector-wrapper.js';
import type { ImportImageDetail, ImportConfirmDetail } from './bs-import-dialog.js';
import type {
  ViewportChangeDetail, CellHoverDetail, EyedropDetail,
  ObjectPlaceDetail, ObjectSelectDetail, ObjectMoveDetail, ObjectResizeDetail,
} from './bs-map-canvas.js';
import type { StampSelectDetail } from './bs-tileset-panel.js';
import type { ObjectEditDetail, ObjectDeleteDetail } from './bs-object-properties.js';
import type {
  LayerSelectDetail,
  LayerDeleteDetail,
  LayerRenameDetail,
  LayerVisibilityDetail,
  LayerOpacityDetail,
  LayerLockDetail,
  LayerReorderDetail,
} from './bs-layer-panel.js';
import {
  type Layer,
  type MapObject,
  type ObjectLayer,
  createTileLayer,
  createObjectLayer,
  setLayerName,
  setLayerVisible,
  setLayerOpacity,
  setLayerLocked,
  addObject,
  removeObject,
  updateObject,
  nextObjectId,
} from '../models/layer-model.js';

// Register editor icons
BhIcon.register('layers', '<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>');
BhIcon.register('grid-four', '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>');
BhIcon.register('paint-brush', '<path d="M18.37 2.63a2.12 2.12 0 0 1 3 3L14 13l-4 1 1-4 7.37-7.37z"/><path d="M9 14.5A3.5 3.5 0 0 0 5.5 18c-1.2 0-2.6-.5-3.5-1 .9 2.5 3.5 4 6 4a4 4 0 0 0 4-4c0-1-.4-1.9-1-2.6"/>');
BhIcon.register('eraser', '<path d="M7 21h10"/><path d="M5.5 11.5 2 15l5 5 3.5-3.5"/><path d="m18.5 5.5-11 11"/><path d="M22 2 11 13"/>');
BhIcon.register('cursor', '<path d="M5 3l14 7-6 2-3 6z"/>');
BhIcon.register('paint-bucket', '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2L5 12l7 7z"/><path d="M2 21l3-3"/>');
BhIcon.register('arrow-counter-clockwise', '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>');
BhIcon.register('arrow-clockwise', '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>');
BhIcon.register('floppy-disk', '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>');
BhIcon.register('download', '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>');
BhIcon.register('folder-open', '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>');
BhIcon.register('file-plus', '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>');
BhIcon.register('eye', '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>');
BhIcon.register('eye-slash', '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>');
BhIcon.register('lock', '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>');
BhIcon.register('eyedropper', '<path d="M20.71 5.63l-2.34-2.34a1 1 0 0 0-1.41 0l-3.12 3.12-1.41-1.42-1.42 1.42 1.41 1.41-6.6 6.6A2 2 0 0 0 5 16v3h3a2 2 0 0 0 1.42-.59l6.6-6.6 1.41 1.42 1.42-1.42-1.42-1.41 3.12-3.12a1 1 0 0 0 0-1.65z"/><line x1="5" y1="21" x2="10" y2="21"/>');
BhIcon.register('map-pin', '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>');
BhIcon.register('square-dashed', '<rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke-dasharray="4 2"/>');


// Import bh-01 shell components (side-effect registrations)
import '@bruk-io/bh-01';

// Import backsplash components (side-effect registrations)
import './bs-layer-panel.js';
import './bs-object-properties.js';

type PanelId = 'layers' | 'tilesets' | '';

@customElement('bs-editor-shell')
export class BsEditorShell extends BaseElement {
  static override styles = [
    ...([BaseElement.styles].flat()),
    css`
      :host {
        display: block;
        height: 100vh;
        width: 100vw;
      }

      .main-area {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
      }

      .canvas-area {
        flex: 1;
        position: relative;
        overflow: hidden;
        background: var(--bh-color-surface-recessed);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .canvas-area bh-center {
        color: var(--bh-color-text-tertiary);
      }

      .sidebar-slot {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
      }
    `,
  ];

  @state() private _panel: PanelId = 'layers';
  @state() private _tilemap: TilemapModel | null = null;
  @state() private _zoomPercent = 100;
  @state() private _cursorCol = 0;
  @state() private _cursorRow = 0;
  @state() private _importDialogOpen = false;
  @state() private _importCandidates: TileSizeCandidate[] = [];
  @state() private _selectedGid = 0;
  @state() private _activeTilesetIndex = 0;
  @state() private _activeTool: ToolId = 'brush';
  @state() private _activeLayerIndex = 0;
  @state() private _stamp: Stamp | null = null;
  @state() private _projectName = 'Untitled Map';
  @state() private _hasUnsavedChanges = false;
  @state() private _renderVersion = 0;
  @state() private _selectedObjectId = -1;

  private _store = new EditorStore();
  private _fileHandle: FileSystemFileHandle | null = null;
  private _selection = new SelectionModel();
  private _detector = new TileDetectorWrapper();
  private _history = new HistoryManager();
  private _strokeEdits: CellEdit[] = [];
  /** Snapshot of object before drag starts (for undo). */
  private _dragObjectSnapshot: MapObject | null = null;

  private get _sidebarOpen() {
    return this._panel !== '';
  }

  /** Whether the active layer is an object layer. */
  private get _isObjectLayerActive(): boolean {
    const layer = this._tilemap?.getLayer(this._activeLayerIndex);
    return layer?.type === 'object';
  }

  /** Get the selected MapObject, or null. */
  private get _selectedObject(): MapObject | null {
    if (this._selectedObjectId < 0 || !this._tilemap) return null;
    const layer = this._tilemap.getLayer(this._activeLayerIndex);
    if (!layer || layer.type !== 'object') return null;
    return (layer as ObjectLayer).objects.find(o => o.id === this._selectedObjectId) ?? null;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this._initDemoTilemap();
    document.addEventListener('keydown', this._onKeyDown);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._onKeyDown);
  }

  /** Create a default empty tilemap so the canvas shows a grid on first load. */
  private _initDemoTilemap(): void {
    // Game Boy screen: 160×144 px = 20×18 tiles at 8×8
    const tileSize = 8;
    const mapWidth = 20;
    const mapHeight = 18;

    this._tilemap = new TilemapModel({
      width: mapWidth,
      height: mapHeight,
      tileWidth: tileSize,
      tileHeight: tileSize,
    });
    this._store.tilemap = this._tilemap;

    // Fire-and-forget — editor renders immediately, tilesets appear async
    this._loadDefaultTilesets();
  }

  /** Fetch pokered manifest and load tilesets. No-ops gracefully on 404. */
  private async _loadDefaultTilesets(): Promise<void> {
    const manifestUrl = '/tilesets/pokered/manifest.json';

    let manifest: {
      tileWidth: number;
      tileHeight: number;
      margin: number;
      spacing: number;
      tilesets: { name: string; file: string }[];
    };

    try {
      const res = await fetch(manifestUrl);
      if (!res.ok) return;
      manifest = await res.json();
    } catch {
      return; // Network error or missing file — silently skip
    }

    for (const entry of manifest.tilesets) {
      try {
        const imgRes = await fetch(`/tilesets/pokered/${entry.file}`);
        if (!imgRes.ok) continue;
        const blob = await imgRes.blob();
        const image = await createImageBitmap(blob);

        const tilesets = this._tilemap!.tilesets;
        const firstGid = tilesets.length > 0
          ? tilesets[tilesets.length - 1].lastGid + 1
          : 1;

        const tileset = new TilesetModel({
          name: entry.name,
          image,
          tileWidth: manifest.tileWidth,
          tileHeight: manifest.tileHeight,
          imageWidth: image.width,
          imageHeight: image.height,
          margin: manifest.margin,
          spacing: manifest.spacing,
          firstGid,
        });

        this._tilemap!.addTileset(tileset);
      } catch {
        continue; // Skip individual failures
      }
    }

    // Update UI after all tilesets loaded
    this.requestUpdate();
  }

  private _onViewportChange = (e: CustomEvent<ViewportChangeDetail>): void => {
    this._zoomPercent = Math.round(e.detail.zoom * 100);
  };

  private _onCellHover = (e: CustomEvent<CellHoverDetail>): void => {
    this._cursorCol = e.detail.col;
    this._cursorRow = e.detail.row;
  };

  private _onEyedrop = (e: CustomEvent<EyedropDetail>): void => {
    const { gid } = e.detail;
    this._selectedGid = gid;
    this._selection.selectTile(gid);
    this._stamp = null;
    this._store.selectedGid = gid;
  };

  override render() {
    return html`
      <bh-app-shell ?sidebar-open=${this._sidebarOpen}>

        <!-- Activity bar -->
        <bh-activity-bar slot="activity" @bh-activity-change=${this._onActivity}>
          <bh-activity-item item-id="layers" label="Layers">
            <bh-icon name="layers"></bh-icon>
          </bh-activity-item>
          <bh-activity-item item-id="tilesets" label="Tilesets">
            <bh-icon name="grid-four"></bh-icon>
          </bh-activity-item>
        </bh-activity-bar>

        <!-- Sidebar -->
        <div slot="sidebar" class="sidebar-slot">
          ${this._panel === 'layers' ? this._renderLayersPanel() : nothing}
          ${this._panel === 'tilesets' ? this._renderTilesetsPanel() : nothing}
        </div>

        <!-- Main content: toolbar + canvas -->
        <div class="main-area">
          <bh-toolbar variant="surface" sticky gap="xs">
            <bh-cluster slot="start" gap="xs" nowrap>
              <bh-button size="sm" variant=${this._activeTool === 'brush' ? 'primary' : 'ghost'} icon-only label="Brush" @click=${() => this._setTool('brush')}>
                <bh-icon slot="prefix" name="paint-brush"></bh-icon>
              </bh-button>
              <bh-button size="sm" variant=${this._activeTool === 'eraser' ? 'primary' : 'ghost'} icon-only label="Eraser" @click=${() => this._setTool('eraser')}>
                <bh-icon slot="prefix" name="eraser"></bh-icon>
              </bh-button>
              <bh-button size="sm" variant=${this._activeTool === 'select' ? 'primary' : 'ghost'} icon-only label="Select" @click=${() => this._setTool('select')}>
                <bh-icon slot="prefix" name="cursor"></bh-icon>
              </bh-button>
              <bh-button size="sm" variant=${this._activeTool === 'fill' ? 'primary' : 'ghost'} icon-only label="Fill" @click=${() => this._setTool('fill')}>
                <bh-icon slot="prefix" name="paint-bucket"></bh-icon>
              </bh-button>
              <bh-button size="sm" variant=${this._activeTool === 'eyedropper' ? 'primary' : 'ghost'} icon-only label="Eyedropper" @click=${() => this._setTool('eyedropper')}>
                <bh-icon slot="prefix" name="eyedropper"></bh-icon>
              </bh-button>
              ${this._isObjectLayerActive ? html`
                <bh-divider vertical spacing="sm"></bh-divider>
                <bh-button size="sm" variant=${this._activeTool === 'place-object' ? 'primary' : 'ghost'} icon-only label="Place Object" @click=${() => this._setTool('place-object')}>
                  <bh-icon slot="prefix" name="map-pin"></bh-icon>
                </bh-button>
              ` : nothing}
              <bh-divider vertical spacing="sm"></bh-divider>
              <bh-button size="sm" variant="ghost" icon-only label="Undo" ?disabled=${!this._history.canUndo} @click=${this._onUndo}>
                <bh-icon slot="prefix" name="arrow-counter-clockwise"></bh-icon>
              </bh-button>
              <bh-button size="sm" variant="ghost" icon-only label="Redo" ?disabled=${!this._history.canRedo} @click=${this._onRedo}>
                <bh-icon slot="prefix" name="arrow-clockwise"></bh-icon>
              </bh-button>
            </bh-cluster>

            <bh-text variant="small">${this._projectName}${this._hasUnsavedChanges ? ' *' : ''}</bh-text>

            <bh-cluster slot="end" gap="xs" nowrap>
              <bh-button size="sm" variant="ghost" icon-only label="New" @click=${this._onNew}>
                <bh-icon slot="prefix" name="file-plus"></bh-icon>
              </bh-button>
              <bh-button size="sm" variant="ghost" icon-only label="Open" @click=${this._onOpen}>
                <bh-icon slot="prefix" name="folder-open"></bh-icon>
              </bh-button>
              <bh-button size="sm" variant="ghost" icon-only label="Save" @click=${this._onSave}>
                <bh-icon slot="prefix" name="floppy-disk"></bh-icon>
              </bh-button>
              <bh-button size="sm" variant="ghost" icon-only label="Export" @click=${this._onExport}>
                <bh-icon slot="prefix" name="download"></bh-icon>
              </bh-button>
            </bh-cluster>
          </bh-toolbar>

          <div class="canvas-area">
            ${this._tilemap
              ? html`<bs-map-canvas
                  .tilemap=${this._tilemap}
                  .activeTool=${this._activeTool}
                  .activeLayerIndex=${this._activeLayerIndex}
                  .selectedGid=${this._selectedGid}
                  .stamp=${this._stamp}
                  .renderVersion=${this._renderVersion}
                  .selectedObjectId=${this._selectedObjectId}
                  ?object-mode=${this._isObjectLayerActive}
                  show-grid
                  @bs-viewport-change=${this._onViewportChange}
                  @bs-cell-hover=${this._onCellHover}
                  @bs-paint=${this._onPaint}
                  @bs-paint-end=${this._onPaintEnd}
                  @bs-eyedrop=${this._onEyedrop}
                  @bs-object-place=${this._onObjectPlace}
                  @bs-object-select=${this._onObjectSelect}
                  @bs-object-move=${this._onObjectMove}
                  @bs-object-resize=${this._onObjectResize}
                  @bs-object-drag-end=${this._onObjectDragEnd}
                ></bs-map-canvas>`
              : html`<bh-center intrinsic>
                  <bh-stack gap="xs" align="center">
                    <bh-text variant="small">No map loaded</bh-text>
                    <bh-text variant="small" style="color:var(--bh-color-text-muted)">Import a tileset to get started</bh-text>
                  </bh-stack>
                </bh-center>`
            }
          </div>
        </div>

        <!-- Status bar -->
        <bh-status-bar slot="status" message="Ready">
          <span slot="end">Zoom: ${this._zoomPercent}%</span>
          <span slot="end">${this._cursorCol}, ${this._cursorRow}</span>
        </bh-status-bar>

      </bh-app-shell>

      <bs-import-dialog
        ?open=${this._importDialogOpen}
        .candidates=${this._importCandidates}
        @bs-import-image=${this._onImportImage}
        @bs-import-confirm=${this._onImportConfirm}
        @bs-import-cancel=${this._onImportCancel}
      ></bs-import-dialog>
    `;
  }

  private _renderLayersPanel() {
    const layers = this._tilemap ? [...this._tilemap.layers] : [];
    return html`
      <bh-sidebar-panel style="height:100%">
        <bh-panel-header slot="header" label="Layers">
          <bh-button
            slot="end"
            variant="ghost"
            size="sm"
            label="Add Object Layer"
            @click=${this._onObjectLayerAdd}
          >
            <bh-icon slot="prefix" name="map-pin" size="sm"></bh-icon>
          </bh-button>
        </bh-panel-header>
        <bs-layer-panel
          .layers=${layers}
          .activeLayerIndex=${this._activeLayerIndex}
          @bs-layer-select=${this._onLayerSelect}
          @bs-layer-add=${this._onLayerAdd}
          @bs-layer-delete=${this._onLayerDelete}
          @bs-layer-rename=${this._onLayerRename}
          @bs-layer-visibility=${this._onLayerVisibility}
          @bs-layer-opacity=${this._onLayerOpacity}
          @bs-layer-lock=${this._onLayerLock}
          @bs-layer-reorder=${this._onLayerReorder}
        ></bs-layer-panel>
        ${this._isObjectLayerActive && this._selectedObject ? html`
          <bh-divider></bh-divider>
          <bs-object-properties
            .object=${this._selectedObject}
            @bs-object-edit=${this._onObjectEdit}
            @bs-object-delete=${this._onObjectDeleteFromPanel}
          ></bs-object-properties>
        ` : nothing}
      </bh-sidebar-panel>
    `;
  }

  private _renderTilesetsPanel() {
    const tilesets = this._tilemap?.tilesets ?? [];
    const activeTileset = tilesets[this._activeTilesetIndex] ?? null;
    return html`
      <bh-sidebar-panel style="height:100%">
        <bh-panel-header slot="header" label="Tilesets">
          <bh-button
            slot="end"
            variant="ghost"
            size="sm"
            icon-only
            label="Import Tileset"
            @click=${this._openImportDialog}
          >
            <bh-icon slot="prefix" name="plus"></bh-icon>
          </bh-button>
        </bh-panel-header>
        ${tilesets.length > 0
          ? html`
              ${tilesets.length > 1
                ? html`<bh-cluster gap="xs" wrap style="padding:var(--bh-spacing-2, 8px)">
                    ${tilesets.map(
                      (ts, i) => html`
                        <bh-button
                          variant=${i === this._activeTilesetIndex ? 'primary' : 'outline'}
                          size="sm"
                          @click=${() => { this._activeTilesetIndex = i; }}
                        >
                          ${ts.name || `Tileset ${i + 1}`}
                        </bh-button>
                      `,
                    )}
                  </bh-cluster>`
                : nothing}
              ${activeTileset
                ? html`<bs-tileset-panel
                    .tileset=${activeTileset}
                    .selectedGid=${this._selectedGid}
                    @bs-tile-select=${this._onTileSelect}
                    @bs-stamp-select=${this._onStampSelect}
                  ></bs-tileset-panel>`
                : nothing}
            `
          : html`<bh-center intrinsic>
              <bh-stack gap="xs" align="center">
                <bh-text variant="small" style="color:var(--bh-color-text-tertiary)">
                  No tilesets
                </bh-text>
                <bh-text variant="small" style="color:var(--bh-color-text-muted)">
                  Click + to import a tileset
                </bh-text>
              </bh-stack>
            </bh-center>`
        }
      </bh-sidebar-panel>
    `;
  }

  private _openImportDialog(): void {
    this._importDialogOpen = true;
  }

  private async _onImportImage(e: CustomEvent<ImportImageDetail>): Promise<void> {
    // Clone the ImageBitmap so the dialog keeps its copy for preview.
    // The detect() method transfers the bitmap to the worker (it becomes neutered).
    const clone = await createImageBitmap(e.detail.image);
    const candidates = await this._detector.detect(clone);
    this._importCandidates = candidates;
  }

  private _onImportConfirm(e: CustomEvent<ImportConfirmDetail>): void {
    const { image, name, tileWidth, tileHeight, margin, spacing } = e.detail;

    // Determine firstGid — next available after existing tilesets
    const tilesets = this._tilemap!.tilesets;
    const firstGid = tilesets.length > 0
      ? tilesets[tilesets.length - 1].lastGid + 1
      : 1;

    const tileset = new TilesetModel({
      name,
      image,
      tileWidth,
      tileHeight,
      imageWidth: image.width,
      imageHeight: image.height,
      margin,
      spacing,
      firstGid,
    });

    this._tilemap!.addTileset(tileset);
    this._activeTilesetIndex = this._tilemap!.tilesets.length - 1;
    this._importDialogOpen = false;
    this._importCandidates = [];

    // Force reactive update since tilemap is mutated, not replaced
    this.requestUpdate();
  }

  private _onImportCancel(): void {
    this._importDialogOpen = false;
    this._importCandidates = [];
  }

  private _onTileSelect(e: CustomEvent<{ gid: number }>): void {
    this._selectedGid = e.detail.gid;
    this._selection.selectTile(e.detail.gid);
    this._stamp = null;
    this._store.selectedGid = e.detail.gid;
  }

  private _onStampSelect(e: CustomEvent<StampSelectDetail>): void {
    const { topLeftGid, width, height, tilesetColumns } = e.detail;
    this._selection.selectStamp(topLeftGid, width, height, tilesetColumns);
    this._selectedGid = topLeftGid;
    this._stamp = this._selection.stamp;
    this._store.selectedGid = topLeftGid;
  }

  private _setTool(tool: ToolId): void {
    this._activeTool = tool;
    this._store.activeTool = tool;
  }

  private _onPaint(e: CustomEvent<{ command: Command }>): void {
    // Accumulate edits from each cell during a drag stroke.
    if (e.detail.command.type === 'paint') {
      this._strokeEdits.push(...e.detail.command.edits);
    }
    this._hasUnsavedChanges = true;
    this.requestUpdate();
  }

  private _onPaintEnd(): void {
    // Merge all edits from the stroke into a single PaintCommand and record it.
    if (this._strokeEdits.length > 0) {
      this._history.push({ type: 'paint', edits: this._strokeEdits });
      this._strokeEdits = [];
    }
  }

  private _onUndo(): void {
    if (this._tilemap && this._history.canUndo) {
      this._history.undo(this._tilemap);
      this._renderVersion++;
      this.requestUpdate();
    }
  }

  private _onRedo(): void {
    if (this._tilemap && this._history.canRedo) {
      this._history.redo(this._tilemap);
      this._renderVersion++;
      this.requestUpdate();
    }
  }

  private _onKeyDown = (e: KeyboardEvent): void => {
    const mod = e.metaKey || e.ctrlKey;

    // Modifier key shortcuts
    if (mod) {
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        this._onUndo();
      } else if (e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        this._onRedo();
      } else if (e.key === 's') {
        e.preventDefault();
        this._onSave();
      } else if (e.key === 'o') {
        e.preventDefault();
        this._onOpen();
      }
      return;
    }

    // Single-letter tool shortcuts — skip if focus is in an input/textarea
    const target = e.target as Element | null;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      return;
    }

    switch (e.key) {
      case 'b':
        this._setTool('brush');
        break;
      case 'e':
        this._setTool('eraser');
        break;
      case 'g':
        this._setTool('fill');
        break;
      case 'i':
        this._setTool('eyedropper');
        break;
      case 'o':
        if (this._isObjectLayerActive) {
          this._setTool('place-object');
        }
        break;
    }
  };

  private _onActivity(e: CustomEvent<{ id: string }>) {
    this._panel = (e.detail.id || '') as PanelId;
  }

  // ── Layer event handlers ──────────────────────────────────────

  private _onLayerSelect(e: CustomEvent<LayerSelectDetail>): void {
    this._activeLayerIndex = e.detail.index;
    this._selectedObjectId = -1;
    // Auto-switch to place-object tool when selecting an object layer
    const layer = this._tilemap?.getLayer(e.detail.index);
    if (layer?.type === 'object' && this._activeTool !== 'place-object') {
      this._setTool('place-object');
    } else if (layer?.type === 'tile' && this._activeTool === 'place-object') {
      this._setTool('brush');
    }
  }

  private _onLayerAdd(): void {
    if (!this._tilemap) return;
    const count = this._tilemap.layers.length;
    const layer = createTileLayer(
      `Layer ${count + 1}`,
      this._tilemap.width,
      this._tilemap.height,
      count,
    );
    this._tilemap.addLayer(layer);
    const index = this._tilemap.layers.length - 1;
    this._activeLayerIndex = index;
    this._history.push({ type: 'add-layer', layer, layerIndex: index } satisfies AddLayerCommand);
    this._renderVersion++;
    this.requestUpdate();
  }

  private _onLayerDelete(e: CustomEvent<LayerDeleteDetail>): void {
    if (!this._tilemap || this._tilemap.layers.length <= 1) return;
    const { index } = e.detail;
    const layer = this._tilemap.getLayer(index);
    if (!layer) return;
    this._tilemap.removeLayer(index);
    this._history.push({ type: 'delete-layer', layer, layerIndex: index } satisfies DeleteLayerCommand);
    // Adjust active index if needed.
    if (this._activeLayerIndex >= this._tilemap.layers.length) {
      this._activeLayerIndex = this._tilemap.layers.length - 1;
    }
    this._renderVersion++;
    this.requestUpdate();
  }

  private _onLayerRename(e: CustomEvent<LayerRenameDetail>): void {
    if (!this._tilemap) return;
    const { index, name } = e.detail;
    const layer = this._tilemap.getLayer(index);
    if (!layer) return;
    const oldName = layer.name;
    const updated = setLayerName(layer, name);
    this._replaceLayer(index, updated);
    this._history.push({ type: 'rename-layer', layerIndex: index, oldName, newName: name } satisfies RenameLayerCommand);
    this.requestUpdate();
  }

  private _onLayerVisibility(e: CustomEvent<LayerVisibilityDetail>): void {
    if (!this._tilemap) return;
    const layer = this._tilemap.getLayer(e.detail.index);
    if (!layer) return;
    const updated = setLayerVisible(layer, e.detail.visible);
    this._replaceLayer(e.detail.index, updated);
    this.requestUpdate();
  }

  private _onLayerOpacity(e: CustomEvent<LayerOpacityDetail>): void {
    if (!this._tilemap) return;
    const layer = this._tilemap.getLayer(e.detail.index);
    if (!layer) return;
    const updated = setLayerOpacity(layer, e.detail.opacity);
    this._replaceLayer(e.detail.index, updated);
    this.requestUpdate();
  }

  private _onLayerLock(e: CustomEvent<LayerLockDetail>): void {
    if (!this._tilemap) return;
    const layer = this._tilemap.getLayer(e.detail.index);
    if (!layer) return;
    const updated = setLayerLocked(layer, e.detail.locked);
    this._replaceLayer(e.detail.index, updated);
    this.requestUpdate();
  }

  private _onLayerReorder(e: CustomEvent<LayerReorderDetail>): void {
    if (!this._tilemap) return;
    const { fromIndex, toIndex } = e.detail;
    this._tilemap.moveLayer(fromIndex, toIndex);
    this._history.push({ type: 'reorder-layer', fromIndex, toIndex } satisfies ReorderLayerCommand);
    // Update active index to follow the moved layer.
    if (this._activeLayerIndex === fromIndex) {
      this._activeLayerIndex = toIndex;
    }
    this._renderVersion++;
    this.requestUpdate();
  }

  // ── Object layer handlers ──────────────────────────────────────

  private _onObjectLayerAdd(): void {
    if (!this._tilemap) return;
    const count = this._tilemap.layers.length;
    const layer = createObjectLayer(`Object ${count + 1}`, count);
    this._tilemap.addLayer(layer);
    const index = this._tilemap.layers.length - 1;
    this._activeLayerIndex = index;
    this._history.push({ type: 'add-layer', layer, layerIndex: index } satisfies AddLayerCommand);
    this._setTool('place-object');
    this._renderVersion++;
    this.requestUpdate();
  }

  private _onObjectPlace(e: CustomEvent<ObjectPlaceDetail>): void {
    if (!this._tilemap) return;
    const layer = this._tilemap.getLayer(this._activeLayerIndex);
    if (!layer || layer.type !== 'object') return;

    const { x, y, width, height } = e.detail;
    const id = nextObjectId(layer as ObjectLayer);
    const obj: MapObject = {
      id,
      name: '',
      type: 'default',
      x,
      y,
      width,
      height,
      properties: {},
    };

    const updated = addObject(layer as ObjectLayer, obj);
    this._tilemap.replaceLayer(this._activeLayerIndex, updated);
    this._selectedObjectId = id;
    this._history.push({
      type: 'add-object',
      layerIndex: this._activeLayerIndex,
      object: obj,
    } satisfies AddObjectCommand);
    this._hasUnsavedChanges = true;
    this._renderVersion++;
    this.requestUpdate();
  }

  private _onObjectSelect(e: CustomEvent<ObjectSelectDetail>): void {
    this._selectedObjectId = e.detail.objectId;

    // Take snapshot of selected object for undo if a drag starts
    if (e.detail.objectId >= 0) {
      this._dragObjectSnapshot = this._selectedObject ? { ...this._selectedObject } : null;
    } else {
      this._dragObjectSnapshot = null;
    }
    this.requestUpdate();
  }

  private _onObjectMove(e: CustomEvent<ObjectMoveDetail>): void {
    if (!this._tilemap) return;
    const layer = this._tilemap.getLayer(this._activeLayerIndex);
    if (!layer || layer.type !== 'object') return;

    const obj = (layer as ObjectLayer).objects.find(o => o.id === e.detail.objectId);
    if (!obj) return;

    const moved: MapObject = { ...obj, x: e.detail.x, y: e.detail.y };
    const updated = updateObject(layer as ObjectLayer, moved);
    this._tilemap.replaceLayer(this._activeLayerIndex, updated);
    this._hasUnsavedChanges = true;
    this._renderVersion++;
    this.requestUpdate();
  }

  private _onObjectResize(e: CustomEvent<ObjectResizeDetail>): void {
    if (!this._tilemap) return;
    const layer = this._tilemap.getLayer(this._activeLayerIndex);
    if (!layer || layer.type !== 'object') return;

    const obj = (layer as ObjectLayer).objects.find(o => o.id === e.detail.objectId);
    if (!obj) return;

    const resized: MapObject = {
      ...obj,
      x: e.detail.x,
      y: e.detail.y,
      width: e.detail.width,
      height: e.detail.height,
    };
    const updated = updateObject(layer as ObjectLayer, resized);
    this._tilemap.replaceLayer(this._activeLayerIndex, updated);
    this._hasUnsavedChanges = true;
    this._renderVersion++;
    this.requestUpdate();
  }

  private _onObjectDragEnd(): void {
    // Push a move or edit command for undo
    if (!this._dragObjectSnapshot || !this._tilemap) return;
    const layer = this._tilemap.getLayer(this._activeLayerIndex);
    if (!layer || layer.type !== 'object') return;

    const current = (layer as ObjectLayer).objects.find(o => o.id === this._dragObjectSnapshot!.id);
    if (!current) return;

    // Only push if something actually changed
    const old = this._dragObjectSnapshot;
    if (old.x !== current.x || old.y !== current.y ||
        old.width !== current.width || old.height !== current.height) {
      this._history.push({
        type: 'move-object',
        layerIndex: this._activeLayerIndex,
        objectId: old.id,
        oldObject: old,
        newObject: { ...current },
      } satisfies MoveObjectCommand);
    }

    this._dragObjectSnapshot = null;
  }

  private _onObjectEdit(e: CustomEvent<ObjectEditDetail>): void {
    if (!this._tilemap) return;
    const layer = this._tilemap.getLayer(this._activeLayerIndex);
    if (!layer || layer.type !== 'object') return;

    const obj = (layer as ObjectLayer).objects.find(o => o.id === e.detail.objectId);
    if (!obj) return;

    const oldObj = { ...obj };
    const newObj: MapObject = {
      ...obj,
      name: e.detail.name,
      type: e.detail.type,
      x: e.detail.x,
      y: e.detail.y,
      width: e.detail.width,
      height: e.detail.height,
      properties: e.detail.properties,
    };

    const updated = updateObject(layer as ObjectLayer, newObj);
    this._tilemap.replaceLayer(this._activeLayerIndex, updated);
    this._history.push({
      type: 'edit-object',
      layerIndex: this._activeLayerIndex,
      objectId: obj.id,
      oldObject: oldObj,
      newObject: newObj,
    } satisfies EditObjectCommand);
    this._hasUnsavedChanges = true;
    this._renderVersion++;
    this.requestUpdate();
  }

  private _onObjectDeleteFromPanel(e: CustomEvent<ObjectDeleteDetail>): void {
    if (!this._tilemap) return;
    const layer = this._tilemap.getLayer(this._activeLayerIndex);
    if (!layer || layer.type !== 'object') return;

    const obj = (layer as ObjectLayer).objects.find(o => o.id === e.detail.objectId);
    if (!obj) return;

    const updated = removeObject(layer as ObjectLayer, obj.id);
    this._tilemap.replaceLayer(this._activeLayerIndex, updated);
    this._selectedObjectId = -1;
    this._history.push({
      type: 'delete-object',
      layerIndex: this._activeLayerIndex,
      object: { ...obj },
    } satisfies DeleteObjectCommand);
    this._hasUnsavedChanges = true;
    this._renderVersion++;
    this.requestUpdate();
  }

  // ── Save / Load / Export handlers ──────────────────────────────

  private async _onSave(): Promise<void> {
    if (!this._tilemap) return;

    try {
      // Re-use existing handle or prompt for a new one
      if (!this._fileHandle) {
        this._fileHandle = await window.showSaveFilePicker({
          suggestedName: `${this._projectName}.backsplash`,
          types: [{
            description: 'Backsplash Project',
            accept: { 'application/json': ['.backsplash'] },
          }],
        });
        // Update project name from chosen filename
        const name = this._fileHandle.name.replace(/\.backsplash$/, '');
        this._projectName = name;
      }

      const json = saveToJson(this._tilemap);
      const writable = await this._fileHandle.createWritable();
      await writable.write(json);
      await writable.close();
      this._hasUnsavedChanges = false;
    } catch (e) {
      // User cancelled the file picker — silently ignore
      if (e instanceof DOMException && e.name === 'AbortError') return;
      throw e;
    }
  }

  private async _onOpen(): Promise<void> {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{
          description: 'Backsplash Project',
          accept: { 'application/json': ['.backsplash'] },
        }],
      });

      const file = await handle.getFile();
      const json = await file.text();
      const tilemap = loadFromJson(json);

      this._fileHandle = handle;
      this._projectName = handle.name.replace(/\.backsplash$/, '');
      this._tilemap = tilemap;
      this._store.tilemap = tilemap;
      this._activeLayerIndex = 0;
      this._selectedGid = 0;
      this._stamp = null;
      this._history = new HistoryManager();
      this._hasUnsavedChanges = false;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      throw e;
    }
  }

  private async _onExport(): Promise<void> {
    if (!this._tilemap) return;

    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: `${this._projectName}.json`,
        types: [
          { description: 'Tiled JSON', accept: { 'application/json': ['.json'] } },
          { description: 'Raw Arrays JSON', accept: { 'application/json': ['.json'] } },
        ],
      });

      // Use the filename to infer format: if it contains "raw" use raw, otherwise Tiled
      const filename = handle.name.toLowerCase();
      const json = filename.includes('raw')
        ? exportToRawArrays(this._tilemap)
        : exportToTiledJson(this._tilemap);

      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      throw e;
    }
  }

  private _onNew(): void {
    this._tilemap = null;
    this._fileHandle = null;
    this._projectName = 'Untitled Map';
    this._selectedGid = 0;
    this._stamp = null;
    this._activeLayerIndex = 0;
    this._activeTilesetIndex = 0;
    this._history = new HistoryManager();
    this._hasUnsavedChanges = false;
    this._initDemoTilemap();
  }

  private _replaceLayer(index: number, layer: Layer): void {
    if (!this._tilemap) return;
    this._tilemap.replaceLayer(index, layer);
    this._renderVersion++;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'bs-editor-shell': BsEditorShell;
  }
}
