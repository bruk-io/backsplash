/**
 * Layer Panel — display and manage the layer stack.
 *
 * Render layers in reverse order (top layer first). Each row shows the
 * layer name, visibility toggle, lock toggle, opacity slider, and a
 * drag handle for reordering. Double-click the name to rename inline.
 *
 * All mutations are emitted as events — the parent shell handles state changes.
 */

import { html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { BaseElement, BhIcon } from '@bruk-io/bh-01';
import type { Layer } from '../models/layer-model.js';

// ── Icon registrations ───────────────────────────────────────────────
BhIcon.register(
  'eye-off',
  '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
);
BhIcon.register(
  'lock-open',
  '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
);
BhIcon.register(
  'trash',
  '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
);
BhIcon.register(
  'grip-vertical',
  '<circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/>',
);
BhIcon.register('plus', '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>');

// ── Event detail types ───────────────────────────────────────────────

export interface LayerSelectDetail {
  index: number;
}

export interface LayerAddDetail {}

export interface LayerDeleteDetail {
  index: number;
}

export interface LayerRenameDetail {
  index: number;
  name: string;
}

export interface LayerVisibilityDetail {
  index: number;
  visible: boolean;
}

export interface LayerOpacityDetail {
  index: number;
  opacity: number;
}

export interface LayerLockDetail {
  index: number;
  locked: boolean;
}

export interface LayerReorderDetail {
  fromIndex: number;
  toIndex: number;
}

// ── Component ────────────────────────────────────────────────────────

@customElement('bs-layer-panel')
export class BsLayerPanel extends BaseElement {
  static override styles = [
    ...([BaseElement.styles].flat()),
    css`
      :host {
        display: block;
        overflow: hidden;
        height: 100%;
      }

      .layer-list {
        display: flex;
        flex-direction: column;
        overflow-y: auto;
        max-height: 100%;
        padding: var(--bh-spacing-1, 4px) 0;
      }

      .layer-row {
        display: flex;
        align-items: center;
        gap: var(--bh-spacing-1, 4px);
        padding: var(--bh-spacing-1, 4px) var(--bh-spacing-2, 8px);
        cursor: pointer;
        border-left: 3px solid transparent;
        user-select: none;
        min-height: 36px;
      }

      .layer-row:hover {
        background: var(--bh-color-surface-hover);
      }

      .layer-row.active {
        background: var(--bh-color-surface-selected, var(--bh-color-surface-hover));
        border-left-color: var(--bh-color-primary);
      }

      .layer-row.hidden-layer {
        opacity: 0.5;
      }

      .layer-row.drag-over-above {
        border-top: 2px solid var(--bh-color-primary);
      }

      .layer-row.drag-over-below {
        border-bottom: 2px solid var(--bh-color-primary);
      }

      .drag-handle {
        cursor: grab;
        color: var(--bh-color-text-muted);
        display: flex;
        align-items: center;
        flex-shrink: 0;
        touch-action: none;
      }

      .drag-handle:active {
        cursor: grabbing;
      }

      .layer-name {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .layer-name bh-text {
        cursor: pointer;
      }

      .layer-actions {
        display: flex;
        align-items: center;
        gap: var(--bh-spacing-1, 4px);
        flex-shrink: 0;
      }

      .opacity-row {
        display: flex;
        align-items: center;
        gap: var(--bh-spacing-2, 8px);
        padding: 0 var(--bh-spacing-2, 8px) var(--bh-spacing-1, 4px)
          calc(var(--bh-spacing-2, 8px) + 3px);
      }

      .opacity-row bh-slider {
        flex: 1;
      }

      .add-bar {
        display: flex;
        justify-content: center;
        padding: var(--bh-spacing-2, 8px);
        border-top: 1px solid var(--bh-color-border);
      }
    `,
  ];

  /** The layer stack (index 0 = bottom). */
  @property({ attribute: false }) layers: readonly Layer[] = [];

  /** Currently active layer index. */
  @property({ type: Number, attribute: 'active-layer-index' }) activeLayerIndex = 0;

  /** Index of the layer being renamed (display index, i.e. reversed). -1 = none. */
  @state() private _editingIndex = -1;

  /** Current value of the rename input. */
  @state() private _editValue = '';

  /** Index of the layer whose opacity slider is expanded (model index). -1 = none. */
  @state() private _expandedOpacity = -1;

  // ── Drag state ───────────────────────────────────────────────────

  /** Model index of the layer being dragged. -1 = none. */
  private _dragFromIndex = -1;

  /** Model index of the current drop target. -1 = none. */
  @state() private _dragOverIndex = -1;

  /** Whether cursor is above or below the midpoint of the drop target row. */
  @state() private _dragPosition: 'above' | 'below' = 'above';

  /** Y coordinate of the pointer during drag. */
  private _dragY = 0;

  // ── Render ─────────────────────────────────────────────────────

  override render() {
    // Render layers in reverse order (top layer first in the list).
    const reversed = [...this.layers].reverse();

    return html`
      <div class="layer-list">
        ${reversed.map((layer, displayIndex) => {
          const modelIndex = this.layers.length - 1 - displayIndex;
          return this._renderLayerRow(layer, modelIndex, displayIndex);
        })}
      </div>
      <div class="add-bar">
        <bh-button
          variant="ghost"
          size="sm"
          icon-only
          label="Add Layer"
          @click=${this._onAdd}
        >
          <bh-icon slot="prefix" name="plus"></bh-icon>
        </bh-button>
      </div>
    `;
  }

  private _renderLayerRow(layer: Layer, modelIndex: number, displayIndex: number) {
    const isActive = modelIndex === this.activeLayerIndex;
    const isHidden = !layer.visible;
    const isEditing = this._editingIndex === displayIndex;
    const isDragOverAbove =
      this._dragOverIndex === modelIndex && this._dragPosition === 'above';
    const isDragOverBelow =
      this._dragOverIndex === modelIndex && this._dragPosition === 'below';
    const showOpacity = this._expandedOpacity === modelIndex;

    const rowClasses = {
      'layer-row': true,
      active: isActive,
      'hidden-layer': isHidden,
      'drag-over-above': isDragOverAbove,
      'drag-over-below': isDragOverBelow,
    };

    return html`
      <div
        class=${classMap(rowClasses)}
        @click=${() => this._onSelect(modelIndex)}
        data-model-index=${modelIndex}
      >
        <!-- Drag handle -->
        <div
          class="drag-handle"
          @pointerdown=${(e: PointerEvent) => this._onDragStart(e, modelIndex)}
        >
          <bh-icon name="grip-vertical" size="sm"></bh-icon>
        </div>

        <!-- Layer name / rename input -->
        <div class="layer-name">
          ${isEditing
            ? html`<bh-input
                size="sm"
                .value=${this._editValue}
                @bh-change=${(e: CustomEvent<{ value: string }>) =>
                  this._onRenameConfirm(modelIndex, e.detail.value)}
                @keydown=${(e: KeyboardEvent) => this._onRenameKeydown(e, modelIndex)}
              ></bh-input>`
            : html`<bh-text
                variant="small"
                @dblclick=${(e: Event) => {
                  e.stopPropagation();
                  this._startRename(displayIndex, layer.name);
                }}
              >
                ${layer.name}
              </bh-text>`}
        </div>

        <!-- Action buttons -->
        <div class="layer-actions">
          <!-- Visibility toggle -->
          <bh-button
            variant="ghost"
            size="sm"
            icon-only
            label=${layer.visible ? 'Hide Layer' : 'Show Layer'}
            @click=${(e: Event) => {
              e.stopPropagation();
              this._onVisibility(modelIndex, !layer.visible);
            }}
          >
            <bh-icon
              slot="prefix"
              name=${layer.visible ? 'eye' : 'eye-off'}
              size="sm"
            ></bh-icon>
          </bh-button>

          <!-- Lock toggle -->
          <bh-button
            variant="ghost"
            size="sm"
            icon-only
            label=${layer.locked ? 'Unlock Layer' : 'Lock Layer'}
            @click=${(e: Event) => {
              e.stopPropagation();
              this._onLock(modelIndex, !layer.locked);
            }}
          >
            <bh-icon
              slot="prefix"
              name=${layer.locked ? 'lock' : 'lock-open'}
              size="sm"
            ></bh-icon>
          </bh-button>

          <!-- Delete -->
          <bh-button
            variant="ghost"
            size="sm"
            icon-only
            label="Delete Layer"
            ?disabled=${this.layers.length <= 1}
            @click=${(e: Event) => {
              e.stopPropagation();
              this._onDelete(modelIndex);
            }}
          >
            <bh-icon slot="prefix" name="trash" size="sm"></bh-icon>
          </bh-button>
        </div>
      </div>

      <!-- Opacity slider (shown when row is active) -->
      ${isActive || showOpacity
        ? html`
            <div class="opacity-row">
              <bh-text variant="small" style="color:var(--bh-color-text-muted)">
                Opacity
              </bh-text>
              <bh-slider
                min="0"
                max="100"
                step="1"
                .value=${Math.round(layer.opacity * 100)}
                show-value
                @bh-change=${(e: CustomEvent<{ value: number }>) => {
                  this._onOpacity(modelIndex, e.detail.value / 100);
                }}
              ></bh-slider>
            </div>
          `
        : nothing}
    `;
  }

  // ── Event handlers ─────────────────────────────────────────────

  private _onSelect(index: number): void {
    this.dispatchEvent(
      new CustomEvent<LayerSelectDetail>('bs-layer-select', {
        detail: { index },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _onAdd(): void {
    this.dispatchEvent(
      new CustomEvent<LayerAddDetail>('bs-layer-add', {
        detail: {},
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _onDelete(index: number): void {
    this.dispatchEvent(
      new CustomEvent<LayerDeleteDetail>('bs-layer-delete', {
        detail: { index },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _onVisibility(index: number, visible: boolean): void {
    this.dispatchEvent(
      new CustomEvent<LayerVisibilityDetail>('bs-layer-visibility', {
        detail: { index, visible },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _onLock(index: number, locked: boolean): void {
    this.dispatchEvent(
      new CustomEvent<LayerLockDetail>('bs-layer-lock', {
        detail: { index, locked },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _onOpacity(index: number, opacity: number): void {
    this.dispatchEvent(
      new CustomEvent<LayerOpacityDetail>('bs-layer-opacity', {
        detail: { index, opacity },
        bubbles: true,
        composed: true,
      }),
    );
  }

  // ── Rename ─────────────────────────────────────────────────────

  private _startRename(displayIndex: number, currentName: string): void {
    this._editingIndex = displayIndex;
    this._editValue = currentName;

    // Focus the input after it renders.
    this.updateComplete.then(() => {
      const input = this.shadowRoot?.querySelector('bh-input');
      if (input) {
        // bh-input wraps a native input — focus through the component.
        (input as HTMLElement).focus();
        // Select all text.
        const native = input.shadowRoot?.querySelector('input');
        native?.select();
      }
    });
  }

  private _onRenameConfirm(modelIndex: number, value: string): void {
    const trimmed = value.trim();
    if (trimmed && trimmed !== this.layers[modelIndex]?.name) {
      this.dispatchEvent(
        new CustomEvent<LayerRenameDetail>('bs-layer-rename', {
          detail: { index: modelIndex, name: trimmed },
          bubbles: true,
          composed: true,
        }),
      );
    }
    this._editingIndex = -1;
    this._editValue = '';
  }

  private _onRenameKeydown(e: KeyboardEvent, modelIndex: number): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      const input = e.target as HTMLElement;
      // Read current value from bh-input.
      const value = (input as unknown as { value: string }).value ?? this._editValue;
      this._onRenameConfirm(modelIndex, value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this._editingIndex = -1;
      this._editValue = '';
    }
  }

  // ── Drag-to-reorder (pointer events) ──────────────────────────

  private _onDragStart(e: PointerEvent, modelIndex: number): void {
    e.preventDefault();
    e.stopPropagation();

    this._dragFromIndex = modelIndex;
    this._dragY = e.clientY;

    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    target.addEventListener('pointermove', this._onDragMove);
    target.addEventListener('pointerup', this._onDragEnd);
    target.addEventListener('pointercancel', this._onDragEnd);
  }

  private _onDragMove = (e: PointerEvent): void => {
    this._dragY = e.clientY;

    // Find which row the pointer is over.
    const rows = this.shadowRoot?.querySelectorAll('.layer-row');
    if (!rows) return;

    for (const row of rows) {
      const rect = row.getBoundingClientRect();
      if (this._dragY >= rect.top && this._dragY <= rect.bottom) {
        const modelIndex = Number((row as HTMLElement).dataset.modelIndex);
        if (!isNaN(modelIndex)) {
          this._dragOverIndex = modelIndex;
          const midY = rect.top + rect.height / 2;
          this._dragPosition = this._dragY < midY ? 'above' : 'below';
        }
        return;
      }
    }
  };

  private _onDragEnd = (e: PointerEvent): void => {
    const target = e.currentTarget as HTMLElement;
    target.releasePointerCapture(e.pointerId);
    target.removeEventListener('pointermove', this._onDragMove);
    target.removeEventListener('pointerup', this._onDragEnd);
    target.removeEventListener('pointercancel', this._onDragEnd);

    if (this._dragFromIndex >= 0 && this._dragOverIndex >= 0) {
      // Calculate the target model index based on drag position.
      // Since the list is rendered in reverse, "above" in the visual list
      // means a higher model index, and "below" means a lower model index.
      let toIndex = this._dragOverIndex;

      // Adjust: if dropping above the target row, we want to place it
      // above in the visual list = higher model index.
      if (this._dragPosition === 'above' && toIndex < this.layers.length - 1) {
        // In model terms, "above in visual" = higher index.
        // If dragging from below the target (lower model index), the target
        // shifts down after removal, so we compensate.
        if (this._dragFromIndex < toIndex) {
          // fromIndex is below toIndex in model — after splice, target shifts down.
          // toIndex stays the same.
        } else if (this._dragFromIndex > toIndex) {
          toIndex = toIndex + 1;
        }
      } else if (this._dragPosition === 'below') {
        if (this._dragFromIndex > toIndex) {
          // Already correct — inserting at the target index.
        } else if (this._dragFromIndex < toIndex) {
          toIndex = toIndex - 1;
        }
      }

      if (this._dragFromIndex !== toIndex) {
        this.dispatchEvent(
          new CustomEvent<LayerReorderDetail>('bs-layer-reorder', {
            detail: { fromIndex: this._dragFromIndex, toIndex },
            bubbles: true,
            composed: true,
          }),
        );
      }
    }

    // Reset drag state.
    this._dragFromIndex = -1;
    this._dragOverIndex = -1;
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'bs-layer-panel': BsLayerPanel;
  }
}
