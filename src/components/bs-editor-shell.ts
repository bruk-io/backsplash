import { html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { BaseElement, BhIcon } from '@bruk-io/bh-01';
import { TilemapModel } from '../models/tilemap-model.js';
import { TilesetModel } from '../models/tileset-model.js';
import type { ViewportChangeDetail, CellHoverDetail } from './bs-map-canvas.js';

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
BhIcon.register('eye', '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>');
BhIcon.register('eye-slash', '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>');
BhIcon.register('lock', '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>');

// Import bh-01 shell components (side-effect registrations)
import '@bruk-io/bh-01';

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

  private get _sidebarOpen() {
    return this._panel !== '';
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this._initDemoTilemap();
  }

  /** Create a demo tilemap with colored-rectangle tiles to prove the rendering pipeline. */
  private _initDemoTilemap(): void {
    const tileSize = 32;
    const cols = 4;
    const rows = 4;
    const imgW = cols * tileSize;
    const imgH = rows * tileSize;

    // Generate a colored-rectangle tileset via OffscreenCanvas
    const offscreen = new OffscreenCanvas(imgW, imgH);
    const ctx = offscreen.getContext('2d')!;
    const colors = [
      '#4a9eff', '#ff6b6b', '#51cf66', '#ffd43b',
      '#cc5de8', '#ff922b', '#20c997', '#748ffc',
      '#f06595', '#94d82d', '#fcc419', '#22b8cf',
      '#845ef7', '#ff8787', '#69db7c', '#fab005',
    ];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = colors[r * cols + c];
        ctx.fillRect(c * tileSize, r * tileSize, tileSize, tileSize);
      }
    }

    // Convert to ImageBitmap and create the tileset + tilemap
    createImageBitmap(offscreen).then((bitmap) => {
      const tileset = new TilesetModel({
        name: 'Demo Tileset',
        image: bitmap,
        tileWidth: tileSize,
        tileHeight: tileSize,
        imageWidth: imgW,
        imageHeight: imgH,
        firstGid: 1,
      });

      const mapWidth = 20;
      const mapHeight = 15;
      const tilemap = new TilemapModel({
        width: mapWidth,
        height: mapHeight,
        tileWidth: tileSize,
        tileHeight: tileSize,
      });
      tilemap.addTileset(tileset);

      // Fill with a checkerboard/pattern using available GIDs (1-16)
      for (let row = 0; row < mapHeight; row++) {
        for (let col = 0; col < mapWidth; col++) {
          const gid = ((col + row) % 16) + 1;
          tilemap.setCellGid(0, col, row, gid);
        }
      }

      this._tilemap = tilemap;
    });
  }

  private _onViewportChange = (e: CustomEvent<ViewportChangeDetail>): void => {
    this._zoomPercent = Math.round(e.detail.zoom * 100);
  };

  private _onCellHover = (e: CustomEvent<CellHoverDetail>): void => {
    this._cursorCol = e.detail.col;
    this._cursorRow = e.detail.row;
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
              <bh-button size="sm" variant="ghost" icon-only label="Brush">
                <bh-icon slot="prefix" name="paint-brush"></bh-icon>
              </bh-button>
              <bh-button size="sm" variant="ghost" icon-only label="Eraser">
                <bh-icon slot="prefix" name="eraser"></bh-icon>
              </bh-button>
              <bh-button size="sm" variant="ghost" icon-only label="Select">
                <bh-icon slot="prefix" name="cursor"></bh-icon>
              </bh-button>
              <bh-button size="sm" variant="ghost" icon-only label="Fill">
                <bh-icon slot="prefix" name="paint-bucket"></bh-icon>
              </bh-button>
              <bh-divider vertical spacing="sm"></bh-divider>
              <bh-button size="sm" variant="ghost" icon-only label="Undo">
                <bh-icon slot="prefix" name="arrow-counter-clockwise"></bh-icon>
              </bh-button>
              <bh-button size="sm" variant="ghost" icon-only label="Redo">
                <bh-icon slot="prefix" name="arrow-clockwise"></bh-icon>
              </bh-button>
            </bh-cluster>

            <bh-text variant="small">Untitled Map</bh-text>

            <bh-cluster slot="end" gap="xs" nowrap>
              <bh-button size="sm" variant="ghost" icon-only label="Save">
                <bh-icon slot="prefix" name="floppy-disk"></bh-icon>
              </bh-button>
              <bh-button size="sm" variant="ghost" icon-only label="Export">
                <bh-icon slot="prefix" name="download"></bh-icon>
              </bh-button>
            </bh-cluster>
          </bh-toolbar>

          <div class="canvas-area">
            ${this._tilemap
              ? html`<bs-map-canvas
                  .tilemap=${this._tilemap}
                  show-grid
                  @bs-viewport-change=${this._onViewportChange}
                  @bs-cell-hover=${this._onCellHover}
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
    `;
  }

  private _renderLayersPanel() {
    return html`
      <bh-sidebar-panel style="height:100%">
        <bh-panel-header slot="header" label="Layers">
          <bh-button slot="end" variant="ghost" size="sm" icon-only label="Add Layer">
            <bh-icon slot="prefix" name="plus"></bh-icon>
          </bh-button>
        </bh-panel-header>
        <bh-tree selected="layer-1">
          <bh-tree-item value="layer-1" label="Layer 1">
            <bh-icon slot="icon" name="layers" size="sm"></bh-icon>
            <bh-icon slot="end" name="eye" size="sm"></bh-icon>
          </bh-tree-item>
        </bh-tree>
      </bh-sidebar-panel>
    `;
  }

  private _renderTilesetsPanel() {
    return html`
      <bh-sidebar-panel style="height:100%">
        <bh-panel-header slot="header" label="Tilesets">
          <bh-button slot="end" variant="ghost" size="sm" icon-only label="Import Tileset">
            <bh-icon slot="prefix" name="plus"></bh-icon>
          </bh-button>
        </bh-panel-header>
        <bh-center intrinsic style="padding:var(--bh-spacing-4)">
          <bh-text variant="small" style="color:var(--bh-color-text-tertiary)">No tilesets loaded</bh-text>
        </bh-center>
      </bh-sidebar-panel>
    `;
  }

  private _onActivity(e: CustomEvent<{ id: string }>) {
    this._panel = (e.detail.id || '') as PanelId;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'bs-editor-shell': BsEditorShell;
  }
}
