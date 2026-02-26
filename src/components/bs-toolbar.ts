import { html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { BaseElement } from '@bruk-io/bh-01';

@customElement('bs-toolbar')
export class BsToolbar extends BaseElement {
  static override styles = [
    BaseElement.styles,
    css`
      :host {
        display: flex;
        align-items: center;
        gap: var(--bh-spacing-2);
        padding: var(--bh-spacing-2) var(--bh-spacing-3);
        background: var(--bh-color-surface);
        border-bottom: 1px solid var(--bh-color-border);
        min-height: 44px;
      }

      .title {
        font-weight: var(--bh-font-semibold);
        color: var(--bh-color-text);
        margin-right: auto;
      }

      .placeholder {
        color: var(--bh-color-text-muted);
        font-size: var(--bh-text-xs);
      }
    `,
  ];

  override render() {
    return html`
      <span class="title">Backsplash</span>
      <span class="placeholder">Tools will go here</span>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'bs-toolbar': BsToolbar;
  }
}
