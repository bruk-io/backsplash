import { describe, it, expect } from 'vitest';
import {
  getVisibleTileRange,
  screenToMap,
  screenToTile,
  zoomAtPoint,
  pan,
  tileToScreen,
  type Viewport,
} from './viewport.js';

// ── Helpers ──────────────────────────────────────────────────────────

/** Default viewport: no offset, zoom 1. */
const DEFAULT_VP: Viewport = { offsetX: 0, offsetY: 0, zoom: 1 };

// ── getVisibleTileRange ──────────────────────────────────────────────

describe('getVisibleTileRange', () => {
  it('default viewport — range covers tiles that fit in canvas', () => {
    // 800x600 canvas, 16px tiles, 50x40 map
    const range = getVisibleTileRange(DEFAULT_VP, 800, 600, 50, 40, 16, 16);
    expect(range.startCol).toBe(0);
    expect(range.startRow).toBe(0);
    expect(range.endCol).toBe(50); // ceil(800/16)=50, clamped to 50
    expect(range.endRow).toBe(38); // ceil(600/16)=38, clamped to 40 → 38
  });

  it('panned right/down — startCol/startRow shift', () => {
    const vp: Viewport = { offsetX: -160, offsetY: -96, zoom: 1 };
    // 800x600 canvas, 16px tiles, 50x40 map
    const range = getVisibleTileRange(vp, 800, 600, 50, 40, 16, 16);
    expect(range.startCol).toBe(10); // floor(160/16)=10
    expect(range.startRow).toBe(6); // floor(96/16)=6
    expect(range.endCol).toBe(50); // ceil((800+160)/16)=60 → clamped 50
    expect(range.endRow).toBe(40); // ceil((600+96)/16)=44 → clamped 40
  });

  it('zoomed in (zoom 2) — fewer tiles visible', () => {
    const vp: Viewport = { offsetX: 0, offsetY: 0, zoom: 2 };
    const range = getVisibleTileRange(vp, 800, 600, 50, 40, 16, 16);
    expect(range.startCol).toBe(0);
    expect(range.startRow).toBe(0);
    // ceil(800/(16*2))=25
    expect(range.endCol).toBe(25);
    // ceil(600/(16*2))=19
    expect(range.endRow).toBe(19);
  });

  it('zoomed out (zoom 0.5) — more tiles visible', () => {
    const vp: Viewport = { offsetX: 0, offsetY: 0, zoom: 0.5 };
    const range = getVisibleTileRange(vp, 800, 600, 200, 200, 16, 16);
    // ceil(800/(16*0.5))=100
    expect(range.endCol).toBe(100);
    // ceil(600/(16*0.5))=75
    expect(range.endRow).toBe(75);
  });

  it('clamped to map bounds — never negative or beyond map', () => {
    // Panned so map is mostly off-screen to the right/bottom
    const vp: Viewport = { offsetX: 700, offsetY: 500, zoom: 1 };
    const range = getVisibleTileRange(vp, 800, 600, 10, 10, 16, 16);
    expect(range.startCol).toBe(0); // floor(-700/16)=-44 → clamped 0
    expect(range.startRow).toBe(0);
    expect(range.endCol).toBe(7); // ceil((800-700)/16)=7 → clamped to 10 → 7
    expect(range.endRow).toBe(7);
  });

  it('very large map zoomed out — range is bounded by map size', () => {
    const vp: Viewport = { offsetX: 0, offsetY: 0, zoom: 0.1 };
    const range = getVisibleTileRange(vp, 800, 600, 1000, 1000, 16, 16);
    // ceil(800/(16*0.1))=500
    expect(range.endCol).toBe(500);
    // ceil(600/(16*0.1))=375
    expect(range.endRow).toBe(375);
  });

  it('canvas exactly fits the map', () => {
    // 10 tiles * 16px = 160px canvas
    const range = getVisibleTileRange(DEFAULT_VP, 160, 128, 10, 8, 16, 16);
    expect(range.startCol).toBe(0);
    expect(range.startRow).toBe(0);
    expect(range.endCol).toBe(10);
    expect(range.endRow).toBe(8);
  });

  it('canvas larger than the map at zoom 1', () => {
    const range = getVisibleTileRange(DEFAULT_VP, 1000, 1000, 5, 5, 16, 16);
    expect(range.startCol).toBe(0);
    expect(range.startRow).toBe(0);
    expect(range.endCol).toBe(5); // clamped to mapWidth
    expect(range.endRow).toBe(5); // clamped to mapHeight
  });
});

// ── screenToTile ─────────────────────────────────────────────────────

describe('screenToTile', () => {
  it('origin (0,0) with default viewport returns (0, 0)', () => {
    const result = screenToTile(0, 0, DEFAULT_VP, 10, 10, 16, 16);
    expect(result).toEqual({ col: 0, row: 0 });
  });

  it('middle of map returns correct tile', () => {
    // pixel (80, 48) → tile (5, 3) with 16px tiles
    const result = screenToTile(80, 48, DEFAULT_VP, 10, 10, 16, 16);
    expect(result).toEqual({ col: 5, row: 3 });
  });

  it('bottom-right corner returns last tile', () => {
    // Just inside the last tile: (159, 159) for a 10x10 map with 16px tiles
    const result = screenToTile(159, 159, DEFAULT_VP, 10, 10, 16, 16);
    expect(result).toEqual({ col: 9, row: 9 });
  });

  it('outside map bounds (negative) returns null', () => {
    const result = screenToTile(-1, -1, DEFAULT_VP, 10, 10, 16, 16);
    expect(result).toBeNull();
  });

  it('outside map bounds (beyond map) returns null', () => {
    // 10 tiles * 16px = 160, pixel 160 is col 10 which is out of bounds
    const result = screenToTile(160, 160, DEFAULT_VP, 10, 10, 16, 16);
    expect(result).toBeNull();
  });

  it('with pan offset — accounts for offset', () => {
    const vp: Viewport = { offsetX: -32, offsetY: -16, zoom: 1 };
    // screen (32, 16) → map (64, 32) → tile (4, 2)
    const result = screenToTile(32, 16, vp, 10, 10, 16, 16);
    expect(result).toEqual({ col: 4, row: 2 });
  });

  it('with zoom — accounts for zoom', () => {
    const vp: Viewport = { offsetX: 0, offsetY: 0, zoom: 2 };
    // screen (64, 64) → map (32, 32) → tile (2, 2) with 16px tiles
    const result = screenToTile(64, 64, vp, 10, 10, 16, 16);
    expect(result).toEqual({ col: 2, row: 2 });
  });

  it('zoomed in + panned — both applied correctly', () => {
    const vp: Viewport = { offsetX: -64, offsetY: -32, zoom: 2 };
    // screen (64, 32) → map ((64+64)/2, (32+32)/2) = (64, 32) → tile (4, 2)
    const result = screenToTile(64, 32, vp, 10, 10, 16, 16);
    expect(result).toEqual({ col: 4, row: 2 });
  });
});

// ── zoomAtPoint ──────────────────────────────────────────────────────

describe('zoomAtPoint', () => {
  it('zoom in at center — offset adjusts to keep center fixed', () => {
    const result = zoomAtPoint(DEFAULT_VP, 400, 300, 0.5);
    // Map point under (400,300) at zoom=1 is (400,300).
    // New zoom = 1 * 1.5 = 1.5
    // newOffsetX = 400 - 400*1.5 = -200
    expect(result.zoom).toBeCloseTo(1.5);
    expect(result.offsetX).toBeCloseTo(-200);
    expect(result.offsetY).toBeCloseTo(-150);
  });

  it('zoom in at top-left corner (0,0) — offset stays at 0,0', () => {
    const result = zoomAtPoint(DEFAULT_VP, 0, 0, 0.5);
    expect(result.zoom).toBeCloseTo(1.5);
    expect(result.offsetX).toBeCloseTo(0);
    expect(result.offsetY).toBeCloseTo(0);
  });

  it('zoom in at arbitrary point — map point under cursor preserved', () => {
    const vp: Viewport = { offsetX: -50, offsetY: -30, zoom: 1 };
    const cursorX = 200;
    const cursorY = 150;

    // Map point under cursor before zoom
    const mapXBefore = (cursorX - vp.offsetX) / vp.zoom; // (200+50)/1 = 250
    const mapYBefore = (cursorY - vp.offsetY) / vp.zoom; // (150+30)/1 = 180

    const result = zoomAtPoint(vp, cursorX, cursorY, 0.5);

    // Map point under cursor after zoom should be the same
    const mapXAfter = (cursorX - result.offsetX) / result.zoom;
    const mapYAfter = (cursorY - result.offsetY) / result.zoom;

    expect(mapXAfter).toBeCloseTo(mapXBefore);
    expect(mapYAfter).toBeCloseTo(mapYBefore);
  });

  it('clamp to min zoom — does not go below 0.25', () => {
    const vp: Viewport = { offsetX: 0, offsetY: 0, zoom: 0.3 };
    // Delta of -0.5: 0.3 * 0.5 = 0.15, should clamp to 0.25
    const result = zoomAtPoint(vp, 100, 100, -0.5);
    expect(result.zoom).toBeCloseTo(0.25);
  });

  it('clamp to max zoom — does not go above 4', () => {
    const vp: Viewport = { offsetX: 0, offsetY: 0, zoom: 3.5 };
    // Delta of 0.5: 3.5 * 1.5 = 5.25, should clamp to 4
    const result = zoomAtPoint(vp, 100, 100, 0.5);
    expect(result.zoom).toBeCloseTo(4);
  });

  it('already at min, zoom out more — stays at min', () => {
    const vp: Viewport = { offsetX: 0, offsetY: 0, zoom: 0.25 };
    const result = zoomAtPoint(vp, 100, 100, -0.5);
    expect(result.zoom).toBeCloseTo(0.25);
  });

  it('zoom at edge of canvas — no NaN or Infinity', () => {
    const result = zoomAtPoint(DEFAULT_VP, 0, 0, 0.1);
    expect(Number.isFinite(result.offsetX)).toBe(true);
    expect(Number.isFinite(result.offsetY)).toBe(true);
    expect(Number.isFinite(result.zoom)).toBe(true);
  });

  it('custom min/max zoom', () => {
    const result = zoomAtPoint(DEFAULT_VP, 100, 100, -10, 0.5, 2);
    expect(result.zoom).toBeCloseTo(0.5);

    const result2 = zoomAtPoint(DEFAULT_VP, 100, 100, 10, 0.5, 2);
    expect(result2.zoom).toBeCloseTo(2);
  });
});

// ── pan ──────────────────────────────────────────────────────────────

describe('pan', () => {
  it('pan right — offsetX increases', () => {
    const result = pan(DEFAULT_VP, 10, 0);
    expect(result.offsetX).toBe(10);
    expect(result.offsetY).toBe(0);
    expect(result.zoom).toBe(1);
  });

  it('pan down — offsetY increases', () => {
    const result = pan(DEFAULT_VP, 0, 15);
    expect(result.offsetX).toBe(0);
    expect(result.offsetY).toBe(15);
  });

  it('pan negative — works correctly', () => {
    const result = pan(DEFAULT_VP, -20, -30);
    expect(result.offsetX).toBe(-20);
    expect(result.offsetY).toBe(-30);
  });

  it('zero pan — no change', () => {
    const vp: Viewport = { offsetX: 50, offsetY: 60, zoom: 2 };
    const result = pan(vp, 0, 0);
    expect(result).toEqual(vp);
  });

  it('preserves zoom', () => {
    const vp: Viewport = { offsetX: 10, offsetY: 20, zoom: 1.5 };
    const result = pan(vp, 5, 10);
    expect(result.zoom).toBe(1.5);
    expect(result.offsetX).toBe(15);
    expect(result.offsetY).toBe(30);
  });
});

// ── screenToMap ──────────────────────────────────────────────────────

describe('screenToMap', () => {
  it('default viewport — screen coords equal map coords', () => {
    const result = screenToMap(100, 200, DEFAULT_VP);
    expect(result.x).toBe(100);
    expect(result.y).toBe(200);
  });

  it('with offset — subtracts offset', () => {
    const vp: Viewport = { offsetX: -50, offsetY: -30, zoom: 1 };
    const result = screenToMap(100, 100, vp);
    expect(result.x).toBe(150);
    expect(result.y).toBe(130);
  });

  it('with zoom — divides by zoom', () => {
    const vp: Viewport = { offsetX: 0, offsetY: 0, zoom: 2 };
    const result = screenToMap(100, 200, vp);
    expect(result.x).toBe(50);
    expect(result.y).toBe(100);
  });

  it('both offset and zoom', () => {
    const vp: Viewport = { offsetX: -20, offsetY: -10, zoom: 2 };
    const result = screenToMap(100, 100, vp);
    // (100 + 20) / 2 = 60
    expect(result.x).toBe(60);
    // (100 + 10) / 2 = 55
    expect(result.y).toBe(55);
  });
});

// ── tileToScreen ─────────────────────────────────────────────────────

describe('tileToScreen', () => {
  it('default viewport — pixel position equals col * tileWidth', () => {
    const result = tileToScreen(3, 5, DEFAULT_VP, 16, 16);
    expect(result.x).toBe(48); // 3 * 16
    expect(result.y).toBe(80); // 5 * 16
    expect(result.width).toBe(16);
    expect(result.height).toBe(16);
  });

  it('with zoom — scales correctly', () => {
    const vp: Viewport = { offsetX: 0, offsetY: 0, zoom: 2 };
    const result = tileToScreen(3, 5, vp, 16, 16);
    expect(result.x).toBe(96); // 3 * 16 * 2
    expect(result.y).toBe(160); // 5 * 16 * 2
    expect(result.width).toBe(32); // 16 * 2
    expect(result.height).toBe(32);
  });

  it('with offset — adds offset', () => {
    const vp: Viewport = { offsetX: 10, offsetY: 20, zoom: 1 };
    const result = tileToScreen(3, 5, vp, 16, 16);
    expect(result.x).toBe(58); // 10 + 3*16
    expect(result.y).toBe(100); // 20 + 5*16
  });

  it('with offset and zoom combined', () => {
    const vp: Viewport = { offsetX: 10, offsetY: 20, zoom: 0.5 };
    const result = tileToScreen(4, 6, vp, 16, 16);
    expect(result.x).toBe(42); // 10 + 4*16*0.5
    expect(result.y).toBe(68); // 20 + 6*16*0.5
    expect(result.width).toBe(8); // 16 * 0.5
    expect(result.height).toBe(8);
  });

  it('non-square tiles', () => {
    const result = tileToScreen(2, 3, DEFAULT_VP, 32, 16);
    expect(result.x).toBe(64); // 2 * 32
    expect(result.y).toBe(48); // 3 * 16
    expect(result.width).toBe(32);
    expect(result.height).toBe(16);
  });
});
