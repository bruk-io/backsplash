import { html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { BaseElement } from '@bruk-io/bh-01';

@customElement('bs-layer-panel')
export class BsLayerPanel extends BaseElement {
  static override styles = [
    BaseElement.styles,
    css`
      :host {
        display: flex;
        flex-direction: column;
        background: var(--bh-color-surface);
        border-right: 1px solid var(--bh-color-border);
        overflow-y: auto;
      }

      .header {
        padding: var(--bh-spacing-2) var(--bh-spacing-3);
        font-weight: var(--bh-font-semibold);
        font-size: var(--bh-text-xs);
        text-transform: uppercase;
        letter-spacing: var(--bh-tracking-wide);
        color: var(--bh-color-text-muted);
        border-bottom: 1px solid var(--bh-color-border);
      }

      .placeholder {
        padding: var(--bh-spacing-4);
        color: var(--bh-color-text-tertiary);
        font-size: var(--bh-text-xs);
        text-align: center;
      }
    `,
  ];

  override render() {
    return html`
      <div class="header">Layers</div>
      <div class="placeholder">No layers yet</div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'bs-layer-panel': BsLayerPanel;
  }
}
