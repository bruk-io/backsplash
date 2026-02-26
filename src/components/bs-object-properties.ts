/**
 * Object Properties Panel — edit selected object properties.
 *
 * Shows name, type, position (x/y), size (width/height), and custom
 * key-value properties. All changes emit events for the parent to handle.
 */

import { html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { BaseElement, BhIcon } from '@bruk-io/bh-01';
import type { MapObject } from '../models/layer-model.js';

BhIcon.register('x-circle', '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>');

// ── Event detail types ────────────────────────────────────────────────

export interface ObjectEditDetail {
  objectId: number;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  properties: Record<string, string | number | boolean>;
}

export interface ObjectDeleteDetail {
  objectId: number;
}

// ── Component ─────────────────────────────────────────────────────────

@customElement('bs-object-properties')
export class BsObjectProperties extends BaseElement {
  static override styles = [
    ...([BaseElement.styles].flat()),
    css`
      :host {
        display: block;
        overflow-y: auto;
      }

      .empty-state {
        padding: var(--bh-spacing-4, 16px);
        text-align: center;
      }

      .field-group {
        padding: var(--bh-spacing-2, 8px);
      }

      .field-row {
        display: flex;
        align-items: center;
        gap: var(--bh-spacing-2, 8px);
        padding: var(--bh-spacing-1, 4px) 0;
      }

      .field-label {
        width: 50px;
        flex-shrink: 0;
        text-align: right;
      }

      .field-row bh-input {
        flex: 1;
        min-width: 0;
      }

      .coord-row {
        display: grid;
        grid-template-columns: 50px 1fr 50px 1fr;
        gap: var(--bh-spacing-1, 4px);
        align-items: center;
        padding: var(--bh-spacing-1, 4px) 0;
      }

      .coord-label {
        text-align: right;
      }

      .props-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--bh-spacing-1, 4px) 0;
      }

      .prop-row {
        display: grid;
        grid-template-columns: 1fr 1fr auto;
        gap: var(--bh-spacing-1, 4px);
        align-items: center;
        padding: var(--bh-spacing-1, 4px) 0;
      }
    `,
  ];

  /** The currently selected object, or null for no selection. */
  @property({ attribute: false }) object: MapObject | null = null;

  /** Key for adding a new custom property. */
  @state() private _newPropKey = '';

  /** Value for adding a new custom property. */
  @state() private _newPropValue = '';

  override render() {
    if (!this.object) {
      return html`
        <div class="empty-state">
          <bh-text variant="small" style="color:var(--bh-color-text-muted)">
            No object selected
          </bh-text>
        </div>
      `;
    }

    const obj = this.object;
    const propEntries = Object.entries(obj.properties);

    return html`
      <div class="field-group">
        <bh-section-header label="Identity"></bh-section-header>

        <div class="field-row">
          <bh-text variant="small" class="field-label">Name</bh-text>
          <bh-input
            size="sm"
            .value=${obj.name}
            @bh-change=${(e: CustomEvent<{ value: string }>) =>
              this._emitEdit({ ...obj, name: e.detail.value })}
          ></bh-input>
        </div>

        <div class="field-row">
          <bh-text variant="small" class="field-label">Type</bh-text>
          <bh-input
            size="sm"
            .value=${obj.type}
            @bh-change=${(e: CustomEvent<{ value: string }>) =>
              this._emitEdit({ ...obj, type: e.detail.value })}
          ></bh-input>
        </div>

        <bh-divider spacing="sm"></bh-divider>
        <bh-section-header label="Position & Size"></bh-section-header>

        <div class="coord-row">
          <bh-text variant="small" class="coord-label">X</bh-text>
          <bh-input
            size="sm"
            type="number"
            .value=${String(obj.x)}
            @bh-change=${(e: CustomEvent<{ value: string }>) =>
              this._emitEdit({ ...obj, x: Number(e.detail.value) || 0 })}
          ></bh-input>
          <bh-text variant="small" class="coord-label">Y</bh-text>
          <bh-input
            size="sm"
            type="number"
            .value=${String(obj.y)}
            @bh-change=${(e: CustomEvent<{ value: string }>) =>
              this._emitEdit({ ...obj, y: Number(e.detail.value) || 0 })}
          ></bh-input>
        </div>

        <div class="coord-row">
          <bh-text variant="small" class="coord-label">W</bh-text>
          <bh-input
            size="sm"
            type="number"
            .value=${String(obj.width)}
            @bh-change=${(e: CustomEvent<{ value: string }>) =>
              this._emitEdit({ ...obj, width: Math.max(0, Number(e.detail.value) || 0) })}
          ></bh-input>
          <bh-text variant="small" class="coord-label">H</bh-text>
          <bh-input
            size="sm"
            type="number"
            .value=${String(obj.height)}
            @bh-change=${(e: CustomEvent<{ value: string }>) =>
              this._emitEdit({ ...obj, height: Math.max(0, Number(e.detail.value) || 0) })}
          ></bh-input>
        </div>

        ${propEntries.length > 0 || true ? html`
          <bh-divider spacing="sm"></bh-divider>
          <div class="props-header">
            <bh-section-header label="Properties"></bh-section-header>
          </div>

          ${propEntries.map(([key, value]) => html`
            <div class="prop-row">
              <bh-input size="sm" .value=${key} disabled></bh-input>
              <bh-input
                size="sm"
                .value=${String(value)}
                @bh-change=${(e: CustomEvent<{ value: string }>) =>
                  this._onPropChange(key, e.detail.value)}
              ></bh-input>
              <bh-button
                size="sm"
                variant="ghost"
                icon-only
                label="Remove"
                @click=${() => this._onPropRemove(key)}
              >
                <bh-icon slot="prefix" name="x-circle" size="sm"></bh-icon>
              </bh-button>
            </div>
          `)}

          <!-- Add new property row -->
          <div class="prop-row">
            <bh-input
              size="sm"
              placeholder="key"
              .value=${this._newPropKey}
              @bh-change=${(e: CustomEvent<{ value: string }>) => { this._newPropKey = e.detail.value; }}
            ></bh-input>
            <bh-input
              size="sm"
              placeholder="value"
              .value=${this._newPropValue}
              @bh-change=${(e: CustomEvent<{ value: string }>) => { this._newPropValue = e.detail.value; }}
            ></bh-input>
            <bh-button
              size="sm"
              variant="ghost"
              icon-only
              label="Add Property"
              ?disabled=${!this._newPropKey.trim()}
              @click=${this._onPropAdd}
            >
              <bh-icon slot="prefix" name="plus" size="sm"></bh-icon>
            </bh-button>
          </div>
        ` : nothing}

        <bh-divider spacing="sm"></bh-divider>
        <bh-button
          variant="outline"
          size="sm"
          style="width:100%"
          @click=${this._onDelete}
        >
          Delete Object
        </bh-button>
      </div>
    `;
  }

  private _emitEdit(updated: MapObject): void {
    this.dispatchEvent(
      new CustomEvent<ObjectEditDetail>('bs-object-edit', {
        detail: {
          objectId: updated.id,
          name: updated.name,
          type: updated.type,
          x: updated.x,
          y: updated.y,
          width: updated.width,
          height: updated.height,
          properties: { ...updated.properties },
        },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _onPropChange(key: string, value: string): void {
    if (!this.object) return;
    const props = { ...this.object.properties };
    // Try to preserve type: number, boolean, or string
    const num = Number(value);
    if (value === 'true') {
      props[key] = true;
    } else if (value === 'false') {
      props[key] = false;
    } else if (!isNaN(num) && value.trim() !== '') {
      props[key] = num;
    } else {
      props[key] = value;
    }
    this._emitEdit({ ...this.object, properties: props });
  }

  private _onPropRemove(key: string): void {
    if (!this.object) return;
    const props = { ...this.object.properties };
    delete props[key];
    this._emitEdit({ ...this.object, properties: props });
  }

  private _onPropAdd(): void {
    if (!this.object || !this._newPropKey.trim()) return;
    const props = { ...this.object.properties };
    props[this._newPropKey.trim()] = this._newPropValue;
    this._emitEdit({ ...this.object, properties: props });
    this._newPropKey = '';
    this._newPropValue = '';
  }

  private _onDelete(): void {
    if (!this.object) return;
    this.dispatchEvent(
      new CustomEvent<ObjectDeleteDetail>('bs-object-delete', {
        detail: { objectId: this.object.id },
        bubbles: true,
        composed: true,
      }),
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'bs-object-properties': BsObjectProperties;
  }
}
