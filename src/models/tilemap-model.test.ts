import { describe, it, expect } from 'vitest';
import { TilemapModel } from './tilemap-model.js';
import { TilesetModel } from './tileset-model.js';
import { createTileLayer, createObjectLayer } from './layer-model.js';

// ── Helper ───────────────────────────────────────────────────────────

function makeMap(
  overrides: Partial<{ width: number; height: number; tileWidth: number; tileHeight: number }> = {},
): TilemapModel {
  return new TilemapModel({
    width: overrides.width ?? 10,
    height: overrides.height ?? 8,
    tileWidth: overrides.tileWidth ?? 16,
    tileHeight: overrides.tileHeight ?? 16,
  });
}

function makeTileset(
  overrides: Partial<{ name: string; firstGid: number; imageWidth: number; imageHeight: number }> = {},
): TilesetModel {
  return new TilesetModel({
    name: overrides.name ?? 'tileset',
    image: null,
    tileWidth: 16,
    tileHeight: 16,
    imageWidth: overrides.imageWidth ?? 64,
    imageHeight: overrides.imageHeight ?? 64,
    firstGid: overrides.firstGid,
  });
}

// ── Constructor ─────────────────────────────────────────────────────

describe('TilemapModel — constructor', () => {
  it('creates a default "Layer 1" tile layer', () => {
    const map = makeMap();
    expect(map.layers).toHaveLength(1);
    expect(map.layers[0].name).toBe('Layer 1');
    expect(map.layers[0].type).toBe('tile');
  });

  it('stores dimensions correctly', () => {
    const map = makeMap({ width: 20, height: 15, tileWidth: 32, tileHeight: 32 });
    expect(map.width).toBe(20);
    expect(map.height).toBe(15);
    expect(map.tileWidth).toBe(32);
    expect(map.tileHeight).toBe(32);
  });
});

// ── Coordinate conversion ───────────────────────────────────────────

describe('TilemapModel — pixelToTile', () => {
  it('converts pixel at origin to tile (0, 0)', () => {
    const map = makeMap();
    expect(map.pixelToTile(0, 0)).toEqual({ col: 0, row: 0 });
  });

  it('converts pixel in the middle of a tile', () => {
    const map = makeMap({ tileWidth: 16, tileHeight: 16 });
    expect(map.pixelToTile(24, 40)).toEqual({ col: 1, row: 2 });
  });

  it('converts pixel at tile boundary', () => {
    const map = makeMap({ tileWidth: 16, tileHeight: 16 });
    expect(map.pixelToTile(16, 16)).toEqual({ col: 1, row: 1 });
  });

  it('clamps negative pixel coordinates to (0, 0)', () => {
    const map = makeMap();
    expect(map.pixelToTile(-10, -20)).toEqual({ col: 0, row: 0 });
  });

  it('clamps pixel coordinates beyond map bounds to last tile', () => {
    const map = makeMap({ width: 10, height: 8, tileWidth: 16, tileHeight: 16 });
    // 10*16 = 160px wide, 8*16 = 128px tall
    expect(map.pixelToTile(999, 999)).toEqual({ col: 9, row: 7 });
  });

  it('handles exact last pixel before clamping', () => {
    const map = makeMap({ width: 10, height: 8, tileWidth: 16, tileHeight: 16 });
    // pixel 159 → col = floor(159/16) = 9 (last valid col)
    expect(map.pixelToTile(159, 127)).toEqual({ col: 9, row: 7 });
  });
});

describe('TilemapModel — tileToPixel', () => {
  it('converts tile (0, 0) to pixel (0, 0)', () => {
    const map = makeMap();
    expect(map.tileToPixel(0, 0)).toEqual({ x: 0, y: 0 });
  });

  it('converts tile position to top-left pixel', () => {
    const map = makeMap({ tileWidth: 16, tileHeight: 16 });
    expect(map.tileToPixel(3, 5)).toEqual({ x: 48, y: 80 });
  });

  it('works with non-square tiles', () => {
    const map = makeMap({ tileWidth: 32, tileHeight: 16 });
    expect(map.tileToPixel(2, 3)).toEqual({ x: 64, y: 48 });
  });
});

// ── pixelWidth / pixelHeight ────────────────────────────────────────

describe('TilemapModel — pixel dimensions', () => {
  it('computes pixelWidth correctly', () => {
    const map = makeMap({ width: 10, tileWidth: 16 });
    expect(map.pixelWidth).toBe(160);
  });

  it('computes pixelHeight correctly', () => {
    const map = makeMap({ height: 8, tileHeight: 16 });
    expect(map.pixelHeight).toBe(128);
  });

  it('handles non-square tiles', () => {
    const map = makeMap({ width: 5, height: 10, tileWidth: 32, tileHeight: 24 });
    expect(map.pixelWidth).toBe(160);
    expect(map.pixelHeight).toBe(240);
  });
});

// ── Layer stack operations ──────────────────────────────────────────

describe('TilemapModel — layer stack', () => {
  it('addLayer appends to the layer stack', () => {
    const map = makeMap();
    const layer = createTileLayer('Layer 2', 10, 8, 1);
    map.addLayer(layer);
    expect(map.layers).toHaveLength(2);
    expect(map.layers[1].name).toBe('Layer 2');
  });

  it('getLayer returns the layer at a given index', () => {
    const map = makeMap();
    expect(map.getLayer(0)?.name).toBe('Layer 1');
  });

  it('getLayer returns undefined for out-of-range index', () => {
    const map = makeMap();
    expect(map.getLayer(5)).toBeUndefined();
    expect(map.getLayer(-1)).toBeUndefined();
  });

  it('removeLayer removes and returns the layer at the given index', () => {
    const map = makeMap();
    map.addLayer(createTileLayer('Layer 2', 10, 8));
    const removed = map.removeLayer(0);
    expect(removed?.name).toBe('Layer 1');
    expect(map.layers).toHaveLength(1);
    expect(map.layers[0].name).toBe('Layer 2');
  });

  it('removeLayer returns undefined for out-of-range index', () => {
    const map = makeMap();
    expect(map.removeLayer(5)).toBeUndefined();
    expect(map.removeLayer(-1)).toBeUndefined();
  });

  it('moveLayer reorders layers correctly (move up)', () => {
    const map = makeMap();
    map.addLayer(createTileLayer('Layer 2', 10, 8));
    map.addLayer(createTileLayer('Layer 3', 10, 8));
    // Move Layer 1 (index 0) to index 2
    map.moveLayer(0, 2);
    expect(map.layers[0].name).toBe('Layer 2');
    expect(map.layers[1].name).toBe('Layer 3');
    expect(map.layers[2].name).toBe('Layer 1');
  });

  it('moveLayer reorders layers correctly (move down)', () => {
    const map = makeMap();
    map.addLayer(createTileLayer('Layer 2', 10, 8));
    map.addLayer(createTileLayer('Layer 3', 10, 8));
    // Move Layer 3 (index 2) to index 0
    map.moveLayer(2, 0);
    expect(map.layers[0].name).toBe('Layer 3');
    expect(map.layers[1].name).toBe('Layer 1');
    expect(map.layers[2].name).toBe('Layer 2');
  });

  it('moveLayer is a no-op when from === to', () => {
    const map = makeMap();
    map.addLayer(createTileLayer('Layer 2', 10, 8));
    map.moveLayer(0, 0);
    expect(map.layers[0].name).toBe('Layer 1');
    expect(map.layers[1].name).toBe('Layer 2');
  });

  it('moveLayer is a no-op for out-of-range indices', () => {
    const map = makeMap();
    map.moveLayer(-1, 0);
    map.moveLayer(0, 5);
    expect(map.layers).toHaveLength(1);
    expect(map.layers[0].name).toBe('Layer 1');
  });

  it('replaceLayer swaps the layer at the given index', () => {
    const map = makeMap();
    map.addLayer(createTileLayer('Layer 2', 10, 8));
    const replacement = createTileLayer('Replaced', 10, 8);
    map.replaceLayer(0, replacement);
    expect(map.layers[0].name).toBe('Replaced');
    expect(map.layers[1].name).toBe('Layer 2');
    expect(map.layers).toHaveLength(2);
  });

  it('replaceLayer is a no-op for out-of-range index', () => {
    const map = makeMap();
    const replacement = createTileLayer('Nope', 10, 8);
    map.replaceLayer(5, replacement);
    map.replaceLayer(-1, replacement);
    expect(map.layers).toHaveLength(1);
    expect(map.layers[0].name).toBe('Layer 1');
  });

  it('can add object layers to the stack', () => {
    const map = makeMap();
    map.addLayer(createObjectLayer('Objects'));
    expect(map.layers).toHaveLength(2);
    expect(map.layers[1].type).toBe('object');
  });
});

// ── Cell access ─────────────────────────────────────────────────────

describe('TilemapModel — cell access', () => {
  it('setCellGid and getCellGid round-trip a value', () => {
    const map = makeMap();
    map.setCellGid(0, 3, 2, 42);
    expect(map.getCellGid(0, 3, 2)).toBe(42);
  });

  it('getCellGid returns 0 for unset cells', () => {
    const map = makeMap();
    expect(map.getCellGid(0, 0, 0)).toBe(0);
  });

  it('getCellGid returns 0 for invalid layer index', () => {
    const map = makeMap();
    expect(map.getCellGid(5, 0, 0)).toBe(0);
  });

  it('getCellGid returns 0 for object layer', () => {
    const map = makeMap();
    map.addLayer(createObjectLayer('Objects'));
    expect(map.getCellGid(1, 0, 0)).toBe(0);
  });

  it('getCellGid returns 0 for out-of-bounds coordinates', () => {
    const map = makeMap({ width: 10, height: 8 });
    expect(map.getCellGid(0, -1, 0)).toBe(0);
    expect(map.getCellGid(0, 10, 0)).toBe(0);
    expect(map.getCellGid(0, 0, -1)).toBe(0);
    expect(map.getCellGid(0, 0, 8)).toBe(0);
  });

  it('setCellGid is a no-op for invalid layer index', () => {
    const map = makeMap();
    map.setCellGid(5, 0, 0, 42); // should not throw
    expect(map.getCellGid(0, 0, 0)).toBe(0);
  });

  it('setCellGid is a no-op for object layer', () => {
    const map = makeMap();
    map.addLayer(createObjectLayer('Objects'));
    map.setCellGid(1, 0, 0, 42); // should not throw
  });

  it('setCellGid is a no-op for out-of-bounds coordinates', () => {
    const map = makeMap({ width: 10, height: 8 });
    map.setCellGid(0, 10, 0, 42);
    map.setCellGid(0, 0, 8, 42);
    // No crash, cells should remain 0
    expect(map.getCellGid(0, 9, 7)).toBe(0);
  });

  it('cell access works across multiple tile layers', () => {
    const map = makeMap({ width: 4, height: 4 });
    map.addLayer(createTileLayer('Layer 2', 4, 4));
    map.setCellGid(0, 1, 1, 10);
    map.setCellGid(1, 1, 1, 20);
    expect(map.getCellGid(0, 1, 1)).toBe(10);
    expect(map.getCellGid(1, 1, 1)).toBe(20);
  });
});

// ── Tileset management ──────────────────────────────────────────────

describe('TilemapModel — tileset management', () => {
  it('starts with no tilesets', () => {
    const map = makeMap();
    expect(map.tilesets).toHaveLength(0);
  });

  it('addTileset registers a tileset', () => {
    const map = makeMap();
    const ts = makeTileset({ name: 'terrain' });
    map.addTileset(ts);
    expect(map.tilesets).toHaveLength(1);
    expect(map.tilesets[0].name).toBe('terrain');
  });

  it('removeTileset removes a registered tileset', () => {
    const map = makeMap();
    const ts = makeTileset();
    map.addTileset(ts);
    map.removeTileset(ts);
    expect(map.tilesets).toHaveLength(0);
  });

  it('removeTileset is a no-op for unregistered tileset', () => {
    const map = makeMap();
    const ts1 = makeTileset({ name: 'a' });
    const ts2 = makeTileset({ name: 'b' });
    map.addTileset(ts1);
    map.removeTileset(ts2); // not in the map
    expect(map.tilesets).toHaveLength(1);
  });

  it('getTilesetForGid returns correct tileset for single tileset', () => {
    const map = makeMap();
    const ts = makeTileset({ firstGid: 1 }); // GIDs 1-16
    map.addTileset(ts);
    expect(map.getTilesetForGid(1)).toBe(ts);
    expect(map.getTilesetForGid(16)).toBe(ts);
  });

  it('getTilesetForGid returns correct tileset with multiple tilesets', () => {
    const map = makeMap();
    const ts1 = makeTileset({ name: 'terrain', firstGid: 1 }); // GIDs 1-16
    const ts2 = makeTileset({ name: 'objects', firstGid: 17 }); // GIDs 17-32
    map.addTileset(ts1);
    map.addTileset(ts2);

    expect(map.getTilesetForGid(1)).toBe(ts1);
    expect(map.getTilesetForGid(16)).toBe(ts1);
    expect(map.getTilesetForGid(17)).toBe(ts2);
    expect(map.getTilesetForGid(32)).toBe(ts2);
  });

  it('getTilesetForGid returns undefined for GID 0 (empty cell)', () => {
    const map = makeMap();
    map.addTileset(makeTileset({ firstGid: 1 }));
    expect(map.getTilesetForGid(0)).toBeUndefined();
  });

  it('getTilesetForGid returns undefined when no tilesets are registered', () => {
    const map = makeMap();
    expect(map.getTilesetForGid(5)).toBeUndefined();
  });

  it('getTilesetForGid returns undefined for GID below any tileset range', () => {
    const map = makeMap();
    map.addTileset(makeTileset({ firstGid: 10 }));
    expect(map.getTilesetForGid(5)).toBeUndefined();
  });

  it('getTilesetForGid handles GIDs with flip flags', () => {
    const map = makeMap();
    const ts = makeTileset({ firstGid: 1 });
    map.addTileset(ts);
    // GID 5 with horizontal flip flag (bit 31)
    const flaggedGid = 5 | 0x80000000;
    expect(map.getTilesetForGid(flaggedGid)).toBe(ts);
  });
});
