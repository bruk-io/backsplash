import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TilemapModel } from '../models/tilemap-model.js';
import { TilesetModel } from '../models/tileset-model.js';
import './bs-map-canvas.js';
import type { BsMapCanvas } from './bs-map-canvas.js';
import type { ViewportChangeDetail, CellHoverDetail } from './bs-map-canvas.js';

// ── Helpers ──────────────────────────────────────────────────────────────

/** Create a test tilemap with a simple 2x2 colored tileset (4 tiles). */
async function createTestTilemap(): Promise<{
  tilemap: TilemapModel;
  tileset: TilesetModel;
}> {
  const tileSize = 32;
  const offscreen = new OffscreenCanvas(64, 64);
  const ctx = offscreen.getContext('2d')!;
  const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00'];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      ctx.fillStyle = colors[r * 2 + c];
      ctx.fillRect(c * tileSize, r * tileSize, tileSize, tileSize);
    }
  }
  const bitmap = await createImageBitmap(offscreen);
  const tileset = new TilesetModel({
    name: 'Test',
    image: bitmap,
    tileWidth: tileSize,
    tileHeight: tileSize,
    imageWidth: 64,
    imageHeight: 64,
  });
  const tilemap = new TilemapModel({
    width: 10,
    height: 10,
    tileWidth: tileSize,
    tileHeight: tileSize,
  });
  tilemap.addTileset(tileset);
  // Fill with alternating tiles
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 10; col++) {
      tilemap.setCellGid(0, col, row, ((col + row) % 4) + 1);
    }
  }
  return { tilemap, tileset };
}

/** Wait for Lit element update and one animation frame. */
async function nextFrame(): Promise<void> {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
}

/** Create and mount a bs-map-canvas with explicit size. */
async function createCanvas(): Promise<BsMapCanvas> {
  const el = document.createElement('bs-map-canvas') as BsMapCanvas;
  // Give it a concrete size so the canvas has layout dimensions.
  el.style.width = '640px';
  el.style.height = '480px';
  el.style.display = 'block';
  document.body.appendChild(el);
  await el.updateComplete;
  await nextFrame();
  return el;
}

/** Collect events of a given type from an element. */
function collectEvents<T>(
  el: HTMLElement,
  eventName: string,
): { events: CustomEvent<T>[]; stop: () => void } {
  const events: CustomEvent<T>[] = [];
  const handler = (e: Event) => events.push(e as CustomEvent<T>);
  el.addEventListener(eventName, handler);
  return {
    events,
    stop: () => el.removeEventListener(eventName, handler),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('bs-map-canvas', () => {
  let el: BsMapCanvas;

  beforeEach(async () => {
    el = await createCanvas();
  });

  afterEach(() => {
    el.remove();
  });

  // ── Rendering basics ─────────────────────────────────────────────────

  describe('rendering', () => {
    it('renders a canvas element in its shadow DOM', () => {
      const canvas = el.shadowRoot!.querySelector('canvas');
      expect(canvas).toBeTruthy();
    });

    it('canvas has non-zero dimensions when the host has layout', async () => {
      // The ResizeObserver should have sized the canvas backing store
      const canvas = el.shadowRoot!.querySelector('canvas')!;
      // Wait a bit for ResizeObserver callback
      await nextFrame();
      await nextFrame();
      expect(canvas.width).toBeGreaterThan(0);
      expect(canvas.height).toBeGreaterThan(0);
    });

    it('renders tile data when tilemap is set', async () => {
      const { tilemap } = await createTestTilemap();
      el.tilemap = tilemap;
      await el.updateComplete;
      await nextFrame();
      await nextFrame();

      // The canvas should have some non-transparent pixel data
      const canvas = el.shadowRoot!.querySelector('canvas')!;
      const ctx = canvas.getContext('2d')!;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      // Check that at least some pixels are non-zero (tiles were rendered)
      let hasPixelData = false;
      for (let i = 3; i < imageData.data.length; i += 4) {
        if (imageData.data[i] > 0) {
          hasPixelData = true;
          break;
        }
      }
      expect(hasPixelData).toBe(true);
    });
  });

  // ── Viewport change events (zoom) ────────────────────────────────────

  describe('bs-viewport-change event', () => {
    it('emits on wheel scroll with zoom, offsetX, offsetY', async () => {
      const { tilemap } = await createTestTilemap();
      el.tilemap = tilemap;
      await el.updateComplete;
      await nextFrame();

      const { events, stop } = collectEvents<ViewportChangeDetail>(
        el,
        'bs-viewport-change',
      );

      const canvas = el.shadowRoot!.querySelector('canvas')!;
      canvas.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: -100,
          clientX: 150,
          clientY: 150,
          bubbles: true,
        }),
      );

      stop();
      expect(events.length).toBeGreaterThanOrEqual(1);
      const detail = events[0].detail;
      expect(detail).toHaveProperty('zoom');
      expect(detail).toHaveProperty('offsetX');
      expect(detail).toHaveProperty('offsetY');
      // Scrolling up (negative deltaY) should increase zoom
      expect(detail.zoom).toBeGreaterThan(1);
    });

    it('scroll down decreases zoom', async () => {
      const { tilemap } = await createTestTilemap();
      el.tilemap = tilemap;
      await el.updateComplete;
      await nextFrame();

      const { events, stop } = collectEvents<ViewportChangeDetail>(
        el,
        'bs-viewport-change',
      );

      const canvas = el.shadowRoot!.querySelector('canvas')!;
      canvas.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: 100,
          clientX: 150,
          clientY: 150,
          bubbles: true,
        }),
      );

      stop();
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].detail.zoom).toBeLessThan(1);
    });
  });

  // ── Cell hover events ────────────────────────────────────────────────

  describe('bs-cell-hover event', () => {
    it('emits col and row on pointer move over the map', async () => {
      const { tilemap } = await createTestTilemap();
      el.tilemap = tilemap;
      await el.updateComplete;
      await nextFrame();

      const { events, stop } = collectEvents<CellHoverDetail>(
        el,
        'bs-cell-hover',
      );

      const canvas = el.shadowRoot!.querySelector('canvas')!;
      const rect = canvas.getBoundingClientRect();
      // Move to pixel (16, 16) from canvas top-left -> tile (0, 0) at zoom=1
      canvas.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: rect.left + 16,
          clientY: rect.top + 16,
          bubbles: true,
        }),
      );

      stop();
      expect(events.length).toBe(1);
      expect(events[0].detail.col).toBe(0);
      expect(events[0].detail.row).toBe(0);
    });

    it('emits different col/row for different tile positions', async () => {
      const { tilemap } = await createTestTilemap();
      el.tilemap = tilemap;
      await el.updateComplete;
      await nextFrame();

      const { events, stop } = collectEvents<CellHoverDetail>(
        el,
        'bs-cell-hover',
      );

      const canvas = el.shadowRoot!.querySelector('canvas')!;
      const rect = canvas.getBoundingClientRect();
      // At zoom=1, offset=(0,0): pixel (48, 80) -> col=1, row=2 (32px tiles)
      canvas.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: rect.left + 48,
          clientY: rect.top + 80,
          bubbles: true,
        }),
      );

      stop();
      expect(events.length).toBe(1);
      expect(events[0].detail.col).toBe(1);
      expect(events[0].detail.row).toBe(2);
    });

    it('does not emit when pointer is outside map bounds', async () => {
      const { tilemap } = await createTestTilemap();
      el.tilemap = tilemap;
      await el.updateComplete;
      await nextFrame();

      const { events, stop } = collectEvents<CellHoverDetail>(
        el,
        'bs-cell-hover',
      );

      const canvas = el.shadowRoot!.querySelector('canvas')!;
      const rect = canvas.getBoundingClientRect();
      // Map is 10x10 tiles at 32px = 320x320. Move to (400, 400) which is outside.
      canvas.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: rect.left + 400,
          clientY: rect.top + 400,
          bubbles: true,
        }),
      );

      stop();
      expect(events.length).toBe(0);
    });

    it('does not emit when no tilemap is set', async () => {
      const { events, stop } = collectEvents<CellHoverDetail>(
        el,
        'bs-cell-hover',
      );

      const canvas = el.shadowRoot!.querySelector('canvas')!;
      const rect = canvas.getBoundingClientRect();
      canvas.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: rect.left + 16,
          clientY: rect.top + 16,
          bubbles: true,
        }),
      );

      stop();
      expect(events.length).toBe(0);
    });
  });

  // ── Pan interaction ──────────────────────────────────────────────────

  describe('pan interaction', () => {
    it('middle-click drag emits viewport change with updated offset', async () => {
      const { tilemap } = await createTestTilemap();
      el.tilemap = tilemap;
      await el.updateComplete;
      await nextFrame();

      const { events, stop } = collectEvents<ViewportChangeDetail>(
        el,
        'bs-viewport-change',
      );

      const canvas = el.shadowRoot!.querySelector('canvas')!;

      // Start pan with middle button
      canvas.dispatchEvent(
        new PointerEvent('pointerdown', {
          button: 1,
          clientX: 100,
          clientY: 100,
          pointerId: 1,
          bubbles: true,
        }),
      );

      // Move
      canvas.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: 150,
          clientY: 120,
          pointerId: 1,
          bubbles: true,
        }),
      );

      // Release
      canvas.dispatchEvent(
        new PointerEvent('pointerup', {
          button: 1,
          clientX: 150,
          clientY: 120,
          pointerId: 1,
          bubbles: true,
        }),
      );

      stop();
      // The pointermove during pan should have emitted a viewport change
      expect(events.length).toBeGreaterThanOrEqual(1);
      const detail = events[0].detail;
      // Panned 50px right, 20px down from initial offset (0,0)
      expect(detail.offsetX).toBe(50);
      expect(detail.offsetY).toBe(20);
      expect(detail.zoom).toBe(1);
    });

    it('left-click does not start pan without space key', async () => {
      const { tilemap } = await createTestTilemap();
      el.tilemap = tilemap;
      await el.updateComplete;
      await nextFrame();

      const { events, stop } = collectEvents<ViewportChangeDetail>(
        el,
        'bs-viewport-change',
      );

      const canvas = el.shadowRoot!.querySelector('canvas')!;

      canvas.dispatchEvent(
        new PointerEvent('pointerdown', {
          button: 0,
          clientX: 100,
          clientY: 100,
          pointerId: 1,
          bubbles: true,
        }),
      );
      canvas.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: 150,
          clientY: 120,
          pointerId: 1,
          bubbles: true,
        }),
      );
      canvas.dispatchEvent(
        new PointerEvent('pointerup', {
          button: 0,
          clientX: 150,
          clientY: 120,
          pointerId: 1,
          bubbles: true,
        }),
      );

      stop();
      // No viewport-change events since no pan happened
      expect(events.length).toBe(0);
    });
  });

  // ── Zoom interaction ─────────────────────────────────────────────────

  describe('zoom interaction', () => {
    it('wheel events change zoom level', async () => {
      const { tilemap } = await createTestTilemap();
      el.tilemap = tilemap;
      await el.updateComplete;
      await nextFrame();

      const { events, stop } = collectEvents<ViewportChangeDetail>(
        el,
        'bs-viewport-change',
      );

      const canvas = el.shadowRoot!.querySelector('canvas')!;

      // Zoom in
      canvas.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: -200,
          clientX: 200,
          clientY: 200,
          bubbles: true,
        }),
      );

      stop();
      expect(events.length).toBe(1);
      expect(events[0].detail.zoom).toBeGreaterThan(1);
    });

    it('zoom clamps at maximum (4x)', async () => {
      const { tilemap } = await createTestTilemap();
      el.tilemap = tilemap;
      await el.updateComplete;
      await nextFrame();

      const canvas = el.shadowRoot!.querySelector('canvas')!;

      // Fire many zoom-in wheel events to exceed max
      for (let i = 0; i < 50; i++) {
        canvas.dispatchEvent(
          new WheelEvent('wheel', {
            deltaY: -500,
            clientX: 200,
            clientY: 200,
            bubbles: true,
          }),
        );
      }

      const { events, stop } = collectEvents<ViewportChangeDetail>(
        el,
        'bs-viewport-change',
      );

      // One more zoom attempt
      canvas.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: -500,
          clientX: 200,
          clientY: 200,
          bubbles: true,
        }),
      );

      stop();
      expect(events.length).toBe(1);
      // Zoom should not exceed 4
      expect(events[0].detail.zoom).toBeLessThanOrEqual(4);
    });

    it('zoom clamps at minimum (0.25x)', async () => {
      const { tilemap } = await createTestTilemap();
      el.tilemap = tilemap;
      await el.updateComplete;
      await nextFrame();

      const canvas = el.shadowRoot!.querySelector('canvas')!;

      // Fire many zoom-out wheel events to go below min
      for (let i = 0; i < 50; i++) {
        canvas.dispatchEvent(
          new WheelEvent('wheel', {
            deltaY: 500,
            clientX: 200,
            clientY: 200,
            bubbles: true,
          }),
        );
      }

      const { events, stop } = collectEvents<ViewportChangeDetail>(
        el,
        'bs-viewport-change',
      );

      canvas.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: 500,
          clientX: 200,
          clientY: 200,
          bubbles: true,
        }),
      );

      stop();
      expect(events.length).toBe(1);
      expect(events[0].detail.zoom).toBeGreaterThanOrEqual(0.25);
    });
  });

  // ── Grid toggle ──────────────────────────────────────────────────────

  describe('grid toggle', () => {
    it('show-grid defaults to true', () => {
      expect(el.showGrid).toBe(true);
    });

    it('setting show-grid to false and back does not throw', async () => {
      el.showGrid = false;
      await el.updateComplete;
      await nextFrame();
      // No error thrown

      el.showGrid = true;
      await el.updateComplete;
      await nextFrame();
      // Still no error
      expect(el.showGrid).toBe(true);
    });

    it('show-grid can be controlled via attribute', async () => {
      // Setting the boolean attribute should keep it true
      el.setAttribute('show-grid', '');
      await el.updateComplete;
      expect(el.showGrid).toBe(true);

      // Setting property directly to false works
      el.showGrid = false;
      await el.updateComplete;
      expect(el.showGrid).toBe(false);
    });
  });
});
