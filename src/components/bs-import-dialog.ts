import { html, css, nothing } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import { BaseElement } from '@bruk-io/bh-01';

/** A ranked tile-size detection candidate. */
export interface TileSizeCandidate {
  width: number;
  height: number;
  confidence: number;
}

/** Detail for the bs-import-image event. */
export interface ImportImageDetail {
  image: ImageBitmap;
  name: string;
}

/** Detail for the bs-import-confirm event. */
export interface ImportConfirmDetail {
  image: ImageBitmap;
  name: string;
  tileWidth: number;
  tileHeight: number;
  margin: number;
  spacing: number;
}

/**
 * Tileset import wizard dialog.
 *
 * Step 1 — File picker with drag-drop, browse, and clipboard paste.
 * Step 2 — Grid overlay preview, candidate selection, manual override,
 *           margin/spacing fields, and confirm/cancel actions.
 */
@customElement('bs-import-dialog')
export class BsImportDialog extends BaseElement {
  static override styles = [
    ...([BaseElement.styles].flat()),
    css`
      :host {
        display: none;
      }
      :host([open]) {
        display: flex;
        position: fixed;
        inset: 0;
        z-index: 1000;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.5);
      }

      .dialog {
        background: var(--bh-color-surface);
        border: 1px solid var(--bh-color-border);
        border-radius: var(--bh-radius-md, 8px);
        padding: var(--bh-spacing-6, 24px);
        min-width: 480px;
        max-width: 640px;
        max-height: 80vh;
        overflow-y: auto;
      }

      .drop-zone {
        border: 2px dashed var(--bh-color-border);
        border-radius: var(--bh-radius-md, 8px);
        padding: var(--bh-spacing-8, 32px);
        text-align: center;
        cursor: pointer;
        transition: border-color 0.15s;
      }
      .drop-zone.drag-over {
        border-color: var(--bh-color-primary);
        background: var(--bh-color-surface-hover);
      }

      .preview-canvas {
        width: 100%;
        max-height: 360px;
        border: 1px solid var(--bh-color-border);
        border-radius: var(--bh-radius-md, 8px);
        object-fit: contain;
      }

      input[type='file'] {
        display: none;
      }
    `,
  ];

  /** Whether the dialog is open. */
  @property({ type: Boolean, reflect: true }) open = false;

  /** Detection candidates (set by parent after worker responds). */
  @property({ attribute: false }) candidates: TileSizeCandidate[] = [];

  @state() private _image: ImageBitmap | null = null;
  @state() private _imageName = '';
  @state() private _tileWidth = 32;
  @state() private _tileHeight = 32;
  @state() private _margin = 0;
  @state() private _spacing = 0;
  @state() private _step: 'pick' | 'configure' = 'pick';
  @state() private _dragOver = false;

  @query('.preview-canvas') private _canvas!: HTMLCanvasElement;
  @query('input[type="file"]') private _fileInput!: HTMLInputElement;

  private _boundPasteHandler = this._onPaste.bind(this);

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('paste', this._boundPasteHandler);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('paste', this._boundPasteHandler);
  }

  override updated(changed: Map<string, unknown>): void {
    super.updated(changed);

    // Re-draw preview when any grid parameter or image changes
    if (
      this._step === 'configure' &&
      this._image &&
      (changed.has('_image') ||
        changed.has('_tileWidth') ||
        changed.has('_tileHeight') ||
        changed.has('_margin') ||
        changed.has('_spacing') ||
        changed.has('_step'))
    ) {
      // Wait for canvas to be in the DOM after step change
      this.updateComplete.then(() => this._renderPreview());
    }

    // Auto-select top candidate when candidates arrive
    if (changed.has('candidates') && this.candidates.length > 0) {
      const top = this.candidates[0];
      this._tileWidth = top.width;
      this._tileHeight = top.height;
    }
  }

  override render() {
    if (!this.open) return nothing;

    return html`
      <div class="dialog" @click=${this._stopPropagation}>
        <bh-stack gap="md">
          <bh-text variant="heading-sm">Import Tileset</bh-text>
          ${this._step === 'pick' ? this._renderPicker() : this._renderConfigure()}
        </bh-stack>
      </div>
    `;
  }

  // ── Step 1: File picker ───────────────────────────────────────────

  private _renderPicker() {
    return html`
      <div
        class="drop-zone ${this._dragOver ? 'drag-over' : ''}"
        @dragover=${this._onDragOver}
        @dragleave=${this._onDragLeave}
        @drop=${this._onDrop}
        @click=${this._browse}
      >
        <bh-stack gap="sm" align="center">
          <bh-icon name="download" size="lg"></bh-icon>
          <bh-text>Drop a spritesheet image here</bh-text>
          <bh-text variant="small" style="color:var(--bh-color-text-muted)">or</bh-text>
          <bh-button variant="outline" size="sm" @click=${this._browse}>Browse files</bh-button>
        </bh-stack>
      </div>
      <input type="file" accept="image/*" @change=${this._onFileChange} />
      <bh-cluster gap="xs" justify="end">
        <bh-button variant="ghost" @click=${this._cancel}>Cancel</bh-button>
      </bh-cluster>
    `;
  }

  // ── Step 2: Configure ─────────────────────────────────────────────

  private _renderConfigure() {
    return html`
      <bh-stack gap="md">
        <canvas class="preview-canvas"></canvas>

        ${this.candidates.length > 0
          ? html`
              <bh-stack gap="xs">
                <bh-text variant="small" style="color:var(--bh-color-text-muted)">Detected sizes</bh-text>
                <bh-cluster gap="xs" wrap>
                  ${this.candidates.map(
                    (c) => html`
                      <bh-button
                        variant=${c.width === this._tileWidth && c.height === this._tileHeight
                          ? 'primary'
                          : 'outline'}
                        size="sm"
                        @click=${() => this._selectCandidate(c)}
                      >
                        ${c.width}\u00d7${c.height} (${Math.round(c.confidence * 100)}%)
                      </bh-button>
                    `,
                  )}
                </bh-cluster>
              </bh-stack>
            `
          : nothing}

        <bh-cluster gap="sm" wrap>
          <bh-input
            type="number"
            label="Tile W"
            .value=${String(this._tileWidth)}
            @input=${this._onTileWidthInput}
          ></bh-input>
          <bh-input
            type="number"
            label="Tile H"
            .value=${String(this._tileHeight)}
            @input=${this._onTileHeightInput}
          ></bh-input>
          <bh-input
            type="number"
            label="Margin"
            .value=${String(this._margin)}
            @input=${this._onMarginInput}
          ></bh-input>
          <bh-input
            type="number"
            label="Spacing"
            .value=${String(this._spacing)}
            @input=${this._onSpacingInput}
          ></bh-input>
        </bh-cluster>

        <bh-cluster gap="xs" justify="end">
          <bh-button variant="ghost" @click=${this._cancel}>Cancel</bh-button>
          <bh-button variant="primary" @click=${this._confirm}>Import</bh-button>
        </bh-cluster>
      </bh-stack>
    `;
  }

  // ── Grid preview rendering ────────────────────────────────────────

  private _renderPreview(): void {
    const canvas = this._canvas;
    const image = this._image;
    if (!canvas || !image) return;

    const maxW = canvas.clientWidth || 580;
    const maxH = 360;

    // Scale image to fit preview area
    const scale = Math.min(maxW / image.width, maxH / image.height, 1);
    const drawW = Math.round(image.width * scale);
    const drawH = Math.round(image.height * scale);

    canvas.width = drawW;
    canvas.height = drawH;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw the spritesheet image
    ctx.drawImage(image, 0, 0, drawW, drawH);

    // Draw grid overlay
    const tw = this._tileWidth * scale;
    const th = this._tileHeight * scale;
    const margin = this._margin * scale;
    const spacing = this._spacing * scale;

    if (tw <= 0 || th <= 0) return;

    ctx.strokeStyle = 'rgba(0, 150, 255, 0.7)';
    ctx.lineWidth = 1;

    // Vertical lines
    let x = margin;
    while (x <= drawW) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, drawH);
      ctx.stroke();
      x += tw;
      if (x <= drawW) {
        // Draw spacing gap indicator if spacing > 0
        if (spacing > 0) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, drawH);
          ctx.stroke();
        }
        x += spacing;
      }
    }

    // Horizontal lines
    let y = margin;
    while (y <= drawH) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(drawW, y);
      ctx.stroke();
      y += th;
      if (y <= drawH) {
        if (spacing > 0) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(drawW, y);
          ctx.stroke();
        }
        y += spacing;
      }
    }
  }

  // ── Drag-and-drop handlers ────────────────────────────────────────

  private _onDragOver(e: DragEvent): void {
    e.preventDefault();
    this._dragOver = true;
  }

  private _onDragLeave(): void {
    this._dragOver = false;
  }

  private _onDrop(e: DragEvent): void {
    e.preventDefault();
    this._dragOver = false;

    const file = e.dataTransfer?.files[0];
    if (file && file.type.startsWith('image/')) {
      this._loadFile(file);
    }
  }

  // ── Browse handler ────────────────────────────────────────────────

  private _browse(e: Event): void {
    e.stopPropagation();
    this._fileInput?.click();
  }

  private _onFileChange(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this._loadFile(file);
    }
  }

  // ── Clipboard paste handler ───────────────────────────────────────

  private _onPaste(e: ClipboardEvent): void {
    if (!this.open) return;

    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          this._loadFile(file);
          return;
        }
      }
    }
  }

  // ── File loading ──────────────────────────────────────────────────

  private async _loadFile(file: File): Promise<void> {
    const bitmap = await createImageBitmap(file);
    this._image = bitmap;
    this._imageName = file.name;
    this._step = 'configure';

    this.dispatchEvent(
      new CustomEvent<ImportImageDetail>('bs-import-image', {
        detail: { image: bitmap, name: file.name },
        bubbles: true,
        composed: true,
      }),
    );
  }

  // ── Candidate selection ───────────────────────────────────────────

  private _selectCandidate(c: TileSizeCandidate): void {
    this._tileWidth = c.width;
    this._tileHeight = c.height;
  }

  // ── Input handlers ────────────────────────────────────────────────

  private _onTileWidthInput(e: Event): void {
    const value = parseInt((e.target as HTMLInputElement).value, 10);
    if (!Number.isNaN(value) && value > 0) this._tileWidth = value;
  }

  private _onTileHeightInput(e: Event): void {
    const value = parseInt((e.target as HTMLInputElement).value, 10);
    if (!Number.isNaN(value) && value > 0) this._tileHeight = value;
  }

  private _onMarginInput(e: Event): void {
    const value = parseInt((e.target as HTMLInputElement).value, 10);
    if (!Number.isNaN(value) && value >= 0) this._margin = value;
  }

  private _onSpacingInput(e: Event): void {
    const value = parseInt((e.target as HTMLInputElement).value, 10);
    if (!Number.isNaN(value) && value >= 0) this._spacing = value;
  }

  // ── Actions ───────────────────────────────────────────────────────

  private _confirm(): void {
    if (!this._image) return;

    this.dispatchEvent(
      new CustomEvent<ImportConfirmDetail>('bs-import-confirm', {
        detail: {
          image: this._image,
          name: this._imageName,
          tileWidth: this._tileWidth,
          tileHeight: this._tileHeight,
          margin: this._margin,
          spacing: this._spacing,
        },
        bubbles: true,
        composed: true,
      }),
    );

    this._reset();
  }

  private _cancel(): void {
    this.dispatchEvent(
      new CustomEvent('bs-import-cancel', {
        bubbles: true,
        composed: true,
      }),
    );
    this._reset();
  }

  private _reset(): void {
    this._image = null;
    this._imageName = '';
    this._tileWidth = 32;
    this._tileHeight = 32;
    this._margin = 0;
    this._spacing = 0;
    this._step = 'pick';
    this._dragOver = false;
    this.open = false;
  }

  private _stopPropagation(e: Event): void {
    e.stopPropagation();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'bs-import-dialog': BsImportDialog;
  }
}
