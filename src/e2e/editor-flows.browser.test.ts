import { describe, it, expect, beforeEach, afterEach } from 'vitest';
// Side-effect imports to register all custom elements
import '../components/bs-editor-shell.js';
import '../components/bs-map-canvas.js';
import '../components/bs-tileset-panel.js';
import '../components/bs-import-dialog.js';
import type { BsEditorShell } from '../components/bs-editor-shell.js';
import type { BsMapCanvas } from '../components/bs-map-canvas.js';
import type { BsTilesetPanel } from '../components/bs-tileset-panel.js';
import { TilesetModel } from '../models/tileset-model.js';

// ── Helpers ──────────────────────────────────────────────────────────────

/** Wait for Lit element update and one animation frame. */
async function nextFrame(): Promise<void> {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
}

/** Wait for multiple update cycles to allow async operations to settle. */
async function settle(el: HTMLElement & { updateComplete: Promise<boolean> }, cycles = 3): Promise<void> {
  for (let i = 0; i < cycles; i++) {
    await el.updateComplete;
    await nextFrame();
  }
}

/** Create and mount a bs-editor-shell with explicit size. */
async function createShell(): Promise<BsEditorShell> {
  const el = document.createElement('bs-editor-shell') as BsEditorShell;
  el.style.width = '1280px';
  el.style.height = '720px';
  el.style.display = 'block';
  document.body.appendChild(el);
  await el.updateComplete;
  await nextFrame();
  return el;
}

function getMapCanvas(shell: BsEditorShell): BsMapCanvas {
  return shell.shadowRoot!.querySelector('bs-map-canvas') as BsMapCanvas;
}

function getTilesetPanel(shell: BsEditorShell): BsTilesetPanel | null {
  return shell.shadowRoot!.querySelector('bs-tileset-panel');
}

/**
 * Open the tilesets panel on the shell by setting the panel state directly.
 * Clicking bh-activity-item may not reliably trigger the parent's event in tests,
 * so we set the private _panel state and request an update.
 */
async function openTilesetsPanel(shell: BsEditorShell): Promise<void> {
  (shell as any)._panel = 'tilesets';
  shell.requestUpdate();
  await settle(shell);
}

/**
 * Set up a tileset directly on the tilemap model, bypassing the import dialog.
 * This is more reliable for testing painting, tool switching, etc.
 * The import dialog UI flow was already manually tested via Playwright screenshots.
 */
async function setupTilesetDirectly(
  shell: BsEditorShell,
  colors: string[] = ['#ff0000', '#00ff00', '#0000ff', '#ffff00'],
  tileSize = 32,
): Promise<void> {
  const cols = 2;
  const rows = Math.ceil(colors.length / cols);

  // Create a canvas-based image
  const canvas = document.createElement('canvas');
  canvas.width = cols * tileSize;
  canvas.height = rows * tileSize;
  const ctx = canvas.getContext('2d')!;
  colors.forEach((color, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    ctx.fillStyle = color;
    ctx.fillRect(col * tileSize, row * tileSize, tileSize, tileSize);
  });

  const bitmap = await createImageBitmap(canvas);
  const mapCanvas = getMapCanvas(shell);
  const tilemap = mapCanvas.tilemap!;

  const tilesets = tilemap.tilesets;
  const firstGid = tilesets.length > 0
    ? tilesets[tilesets.length - 1].lastGid + 1
    : 1;

  const tileset = new TilesetModel({
    name: 'test-tileset',
    image: bitmap,
    tileWidth: tileSize,
    tileHeight: tileSize,
    imageWidth: canvas.width,
    imageHeight: canvas.height,
    margin: 0,
    spacing: 0,
    firstGid,
  });

  tilemap.addTileset(tileset);

  // Update the shell's active tileset index to trigger reactive re-render
  // (mirrors what the import flow does in bs-editor-shell.ts)
  (shell as any)._activeTilesetIndex = tilemap.tilesets.length - 1;

  // Switch to tilesets panel so tileset panel renders
  await openTilesetsPanel(shell);
  shell.requestUpdate();
  await settle(shell, 3);
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('Editor E2E flows', () => {
  let shell: BsEditorShell;

  beforeEach(async () => {
    shell = await createShell();
  });

  afterEach(() => {
    shell.remove();
  });

  // ── Tileset setup flow ───────────────────────────────────────────────

  describe('Tileset setup', () => {
    it('creates a tileset and shows tiles in the palette', async () => {
      await setupTilesetDirectly(shell);

      const mapCanvas = getMapCanvas(shell);
      const tilemap = mapCanvas.tilemap!;
      expect(tilemap.tilesets.length).toBe(1);

      const tileset = tilemap.tilesets[0];
      expect(tileset.tileWidth).toBe(32);
      expect(tileset.tileHeight).toBe(32);
      expect(tileset.firstGid).toBe(1);

      // Tileset panel should show tiles
      await settle(shell, 3);
      const panel = getTilesetPanel(shell);
      expect(panel).toBeTruthy();

      // Wait for the tileset panel to render tile divs (async blob URL creation)
      await new Promise((r) => setTimeout(r, 500));
      await settle(shell, 3);

      const tiles = panel!.shadowRoot!.querySelectorAll('.tile');
      expect(tiles.length).toBe(4);
    });
  });

  // ── Tile painting flow ───────────────────────────────────────────────

  describe('Tile painting flow', () => {
    it('paints a tile on the canvas when brush tool is active', async () => {
      await setupTilesetDirectly(shell);

      // Wait for tileset panel to render
      await new Promise((r) => setTimeout(r, 500));
      await settle(shell, 3);

      // Select a tile from the tileset panel (click the first .tile element)
      const tilesetPanel = getTilesetPanel(shell)!;
      const firstTile = tilesetPanel.shadowRoot!.querySelector('.tile') as HTMLElement;
      expect(firstTile).toBeTruthy();
      firstTile.click();
      await settle(shell);

      // The selected GID should be the tileset's firstGid (GID 1)
      const tilemap = getMapCanvas(shell).tilemap!;
      const selectedGid = tilemap.tilesets[0].firstGid; // Should be 1

      // Get the canvas element from bs-map-canvas shadow DOM
      const mapCanvas = getMapCanvas(shell);
      const canvas = mapCanvas.shadowRoot!.querySelector('canvas')!;
      const rect = canvas.getBoundingClientRect();

      // Simulate a pointerdown at tile (2,2) — at zoom=1, offset=(0,0):
      // pixel position = col * tileWidth + tileWidth/2, row * tileHeight + tileHeight/2
      const col = 2;
      const row = 2;
      const clientX = rect.left + col * 32 + 16;
      const clientY = rect.top + row * 32 + 16;

      canvas.dispatchEvent(
        new PointerEvent('pointerdown', {
          button: 0,
          clientX,
          clientY,
          pointerId: 1,
          bubbles: true,
        }),
      );
      canvas.dispatchEvent(
        new PointerEvent('pointerup', {
          button: 0,
          clientX,
          clientY,
          pointerId: 1,
          bubbles: true,
        }),
      );
      await settle(shell);

      // Assert: the cell at (2,2) has the selected GID
      expect(tilemap.getCellGid(0, col, row)).toBe(selectedGid);
    });

    it('drag painting fills multiple cells', async () => {
      await setupTilesetDirectly(shell);

      // Wait for tileset panel to render and select a tile
      await new Promise((r) => setTimeout(r, 500));
      await settle(shell, 3);

      const tilesetPanel = getTilesetPanel(shell)!;
      const firstTile = tilesetPanel.shadowRoot!.querySelector('.tile') as HTMLElement;
      firstTile.click();
      await settle(shell);

      const tilemap = getMapCanvas(shell).tilemap!;
      const selectedGid = tilemap.tilesets[0].firstGid;

      const mapCanvas = getMapCanvas(shell);
      const canvas = mapCanvas.shadowRoot!.querySelector('canvas')!;
      const rect = canvas.getBoundingClientRect();

      // Simulate pointerdown at (1,1), then pointermove through (2,1) and (3,1)
      const startX = rect.left + 1 * 32 + 16;
      const startY = rect.top + 1 * 32 + 16;

      canvas.dispatchEvent(
        new PointerEvent('pointerdown', {
          button: 0,
          clientX: startX,
          clientY: startY,
          pointerId: 1,
          bubbles: true,
        }),
      );

      // Move to (2,1)
      canvas.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: rect.left + 2 * 32 + 16,
          clientY: startY,
          pointerId: 1,
          bubbles: true,
        }),
      );

      // Move to (3,1)
      canvas.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: rect.left + 3 * 32 + 16,
          clientY: startY,
          pointerId: 1,
          bubbles: true,
        }),
      );

      canvas.dispatchEvent(
        new PointerEvent('pointerup', {
          button: 0,
          clientX: rect.left + 3 * 32 + 16,
          clientY: startY,
          pointerId: 1,
          bubbles: true,
        }),
      );
      await settle(shell);

      // Assert: cells (1,1), (2,1), (3,1) all have the selected GID
      expect(tilemap.getCellGid(0, 1, 1)).toBe(selectedGid);
      expect(tilemap.getCellGid(0, 2, 1)).toBe(selectedGid);
      expect(tilemap.getCellGid(0, 3, 1)).toBe(selectedGid);
    });

    it('does not paint when no tile is selected', async () => {
      await setupTilesetDirectly(shell);

      // Do NOT select a tile — selectedGid should remain 0

      const tilemap = getMapCanvas(shell).tilemap!;
      const mapCanvas = getMapCanvas(shell);
      const canvas = mapCanvas.shadowRoot!.querySelector('canvas')!;
      const rect = canvas.getBoundingClientRect();

      // Click on canvas at (2,2)
      const clientX = rect.left + 2 * 32 + 16;
      const clientY = rect.top + 2 * 32 + 16;

      canvas.dispatchEvent(
        new PointerEvent('pointerdown', {
          button: 0,
          clientX,
          clientY,
          pointerId: 1,
          bubbles: true,
        }),
      );
      canvas.dispatchEvent(
        new PointerEvent('pointerup', {
          button: 0,
          clientX,
          clientY,
          pointerId: 1,
          bubbles: true,
        }),
      );
      await settle(shell);

      // Assert: cell is still GID 0 (empty)
      expect(tilemap.getCellGid(0, 2, 2)).toBe(0);
    });
  });

  // ── Tool switching ───────────────────────────────────────────────────

  describe('Tool switching', () => {
    it('switches active tool when toolbar button is clicked', async () => {
      // Find toolbar buttons in the shell's shadow DOM
      const toolbar = shell.shadowRoot!.querySelector('bh-toolbar')!;
      const buttons = toolbar.querySelectorAll('bh-button[icon-only]');

      // Identify brush and eraser buttons by their label attribute
      let brushButton: HTMLElement | null = null;
      let eraserButton: HTMLElement | null = null;

      buttons.forEach((btn) => {
        const label = btn.getAttribute('label');
        if (label === 'Brush') brushButton = btn as HTMLElement;
        if (label === 'Eraser') eraserButton = btn as HTMLElement;
      });

      expect(brushButton).toBeTruthy();
      expect(eraserButton).toBeTruthy();

      // Initially, brush should be active (variant="primary")
      expect(brushButton!.getAttribute('variant')).toBe('primary');
      expect(eraserButton!.getAttribute('variant')).toBe('ghost');

      // Click the eraser button
      eraserButton!.click();
      await settle(shell);

      // Assert: eraser is now primary, brush is ghost
      expect(eraserButton!.getAttribute('variant')).toBe('primary');
      expect(brushButton!.getAttribute('variant')).toBe('ghost');
    });
  });

  // ── Multiple tileset import ──────────────────────────────────────────

  describe('Multiple tileset setup', () => {
    it('supports multiple tilesets with correct GID ranges', async () => {
      await setupTilesetDirectly(shell, ['#ff0000', '#00ff00', '#0000ff', '#ffff00']);
      await setupTilesetDirectly(shell, ['#ff00ff', '#00ffff', '#ffff00', '#ffffff']);

      const tilemap = getMapCanvas(shell).tilemap!;
      expect(tilemap.tilesets.length).toBe(2);
      expect(tilemap.tilesets[1].firstGid).toBeGreaterThan(tilemap.tilesets[0].lastGid);
    });
  });
});
