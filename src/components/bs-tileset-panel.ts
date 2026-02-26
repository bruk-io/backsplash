import { html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { BaseElement } from '@bruk-io/bh-01';

@customElement('bs-tileset-panel')
export class BsTilesetPanel extends BaseElement {
  static override styles = [
    BaseElement.styles,
    css`
      :host {
        display: flex;
        flex-direction: column;
        background: var(--bh-color-surface);
        border-top: 1px solid var(--bh-color-border);
        min-height: 200px;
        max-height: 300px;
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
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--bh-color-text-tertiary);
        font-size: var(--bh-text-xs);
      }
    `,
  ];

  override render() {
    return html`
      <div class="header">Tilesets</div>
      <div class="placeholder">No tilesets loaded</div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'bs-tileset-panel': BsTilesetPanel;
  }
}
