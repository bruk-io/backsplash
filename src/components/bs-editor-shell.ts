import { html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { BaseElement } from '@bruk-io/bh-01';

@customElement('bs-editor-shell')
export class BsEditorShell extends BaseElement {
  static override styles = [
    ...([BaseElement.styles].flat()),
    css`
      :host {
        display: grid;
        grid-template-areas:
          'toolbar toolbar'
          'sidebar canvas'
          'sidebar bottom';
        grid-template-rows: auto 1fr auto;
        grid-template-columns: 260px 1fr;
        height: 100vh;
      }

      ::slotted([slot='toolbar']) {
        grid-area: toolbar;
      }

      ::slotted([slot='sidebar']) {
        grid-area: sidebar;
      }

      ::slotted([slot='canvas']) {
        grid-area: canvas;
        overflow: hidden;
      }

      ::slotted([slot='bottom']) {
        grid-area: bottom;
      }
    `,
  ];

  override render() {
    return html`
      <slot name="toolbar"></slot>
      <slot name="sidebar"></slot>
      <slot name="canvas"></slot>
      <slot name="bottom"></slot>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'bs-editor-shell': BsEditorShell;
  }
}
