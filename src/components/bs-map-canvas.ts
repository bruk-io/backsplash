import { html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { BaseElement } from '@bruk-io/bh-01';

@customElement('bs-map-canvas')
export class BsMapCanvas extends BaseElement {
  static override styles = [
    ...([BaseElement.styles].flat()),
    css`
      :host {
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--bh-color-surface-recessed);
        position: relative;
        overflow: hidden;
      }

      .placeholder {
        color: var(--bh-color-text-tertiary);
        font-size: var(--bh-text-sm);
        text-align: center;
      }

      .placeholder span {
        display: block;
        font-size: var(--bh-text-xs);
        margin-top: var(--bh-spacing-1);
        color: var(--bh-color-text-muted);
      }
    `,
  ];

  override render() {
    return html`
      <div class="placeholder">
        No map loaded
        <span>Import a tileset to get started</span>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'bs-map-canvas': BsMapCanvas;
  }
}
