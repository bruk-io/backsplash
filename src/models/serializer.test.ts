import { describe, it, expect } from 'vitest';
import { TilemapModel } from './tilemap-model.js';
import { TilesetModel } from './tileset-model.js';
import { createTileLayer, createObjectLayer } from './layer-model.js';
import {
  serializeProject,
  saveToJson,
  loadFromJson,
  loadFromSchema,
  exportToTiledJson,
  exportToRawArrays,
  SCHEMA_VERSION,
  type ProjectSchema,
} from './serializer.js';

// ── Helpers ───────────────────────────────────────────────────────────

function makeMap(
  overrides: Partial<{ width: number; height: number; tileWidth: number; tileHeight: number }> = {},
): TilemapModel {
  return new TilemapModel({
    width: overrides.width ?? 4,
    height: overrides.height ?? 3,
    tileWidth: overrides.tileWidth ?? 16,
    tileHeight: overrides.tileHeight ?? 16,
  });
}

function makeTileset(
  overrides: Partial<{ name: string; firstGid: number }> = {},
): TilesetModel {
  return new TilesetModel({
    name: overrides.name ?? 'terrain',
    image: null,
    tileWidth: 16,
    tileHeight: 16,
    imageWidth: 64,
    imageHeight: 48,
    firstGid: overrides.firstGid ?? 1,
  });
}

// ── serializeProject ──────────────────────────────────────────────────

describe('serializeProject', () => {
  it('serializes map dimensions and version', () => {
    const map = makeMap();
    const schema = serializeProject(map);

    expect(schema.version).toBe(SCHEMA_VERSION);
    expect(schema.map).toEqual({ width: 4, height: 3, tileWidth: 16, tileHeight: 16 });
  });

  it('serializes the default layer', () => {
    const map = makeMap();
    const schema = serializeProject(map);

    expect(schema.layers).toHaveLength(1);
    expect(schema.layers[0].type).toBe('tile');
    expect(schema.layers[0].name).toBe('Layer 1');
    expect(schema.layers[0].visible).toBe(true);
    expect(schema.layers[0].opacity).toBe(1);
  });

  it('serializes tile layer data as plain array', () => {
    const map = makeMap({ width: 2, height: 2 });
    map.setCellGid(0, 0, 0, 5);
    map.setCellGid(0, 1, 1, 10);

    const schema = serializeProject(map);
    const layer = schema.layers[0] as { type: 'tile'; data: number[] };

    expect(layer.data).toEqual([5, 0, 0, 10]);
  });

  it('serializes tileset metadata', () => {
    const map = makeMap();
    map.addTileset(makeTileset({ name: 'grass', firstGid: 1 }));

    const schema = serializeProject(map);

    expect(schema.tilesets).toHaveLength(1);
    expect(schema.tilesets[0].name).toBe('grass');
    expect(schema.tilesets[0].firstGid).toBe(1);
    expect(schema.tilesets[0].tileWidth).toBe(16);
  });

  it('serializes multiple layers with different properties', () => {
    const map = makeMap();
    const layer2 = createTileLayer('Background', map.width, map.height, 1);
    map.addLayer({ ...layer2, visible: false, opacity: 0.5, locked: true });

    const schema = serializeProject(map);

    expect(schema.layers).toHaveLength(2);
    expect(schema.layers[1].name).toBe('Background');
    expect(schema.layers[1].visible).toBe(false);
    expect(schema.layers[1].opacity).toBe(0.5);
    expect(schema.layers[1].locked).toBe(true);
  });

  it('serializes object layers', () => {
    const map = makeMap();
    const objLayer = createObjectLayer('Objects', 1);
    map.addLayer({
      ...objLayer,
      objects: [
        { id: 1, name: 'spawn', type: 'point', x: 10, y: 20, width: 0, height: 0, properties: {} },
      ],
    });

    const schema = serializeProject(map);
    const layer = schema.layers[1] as { type: 'object'; objects: unknown[] };

    expect(layer.type).toBe('object');
    expect(layer.objects).toHaveLength(1);
  });
});

// ── saveToJson / loadFromJson ─────────────────────────────────────────

describe('saveToJson', () => {
  it('produces valid JSON', () => {
    const map = makeMap();
    const json = saveToJson(map);

    expect(() => JSON.parse(json)).not.toThrow();
  });
});

// ── loadFromSchema ────────────────────────────────────────────────────

describe('loadFromSchema', () => {
  it('restores map dimensions', () => {
    const schema: ProjectSchema = {
      version: 1,
      map: { width: 5, height: 4, tileWidth: 32, tileHeight: 32 },
      tilesets: [],
      layers: [
        { type: 'tile', name: 'Ground', visible: true, opacity: 1, locked: false, zOrder: 0, data: new Array(20).fill(0) },
      ],
    };

    const map = loadFromSchema(schema);

    expect(map.width).toBe(5);
    expect(map.height).toBe(4);
    expect(map.tileWidth).toBe(32);
    expect(map.tileHeight).toBe(32);
  });

  it('restores layers with cell data', () => {
    const data = new Array(12).fill(0);
    data[0] = 5;
    data[5] = 10;

    const schema: ProjectSchema = {
      version: 1,
      map: { width: 4, height: 3, tileWidth: 16, tileHeight: 16 },
      tilesets: [],
      layers: [
        { type: 'tile', name: 'Ground', visible: true, opacity: 0.8, locked: true, zOrder: 0, data },
      ],
    };

    const map = loadFromSchema(schema);

    expect(map.layers).toHaveLength(1);
    expect(map.layers[0].name).toBe('Ground');
    expect(map.layers[0].opacity).toBe(0.8);
    expect(map.layers[0].locked).toBe(true);
    expect(map.getCellGid(0, 0, 0)).toBe(5);
    expect(map.getCellGid(0, 1, 1)).toBe(10);
  });

  it('restores tileset metadata without images', () => {
    const schema: ProjectSchema = {
      version: 1,
      map: { width: 4, height: 3, tileWidth: 16, tileHeight: 16 },
      tilesets: [
        { name: 'terrain', tileWidth: 16, tileHeight: 16, imageWidth: 64, imageHeight: 48, margin: 0, spacing: 0, firstGid: 1, imageFilename: 'terrain.png' },
      ],
      layers: [
        { type: 'tile', name: 'Layer 1', visible: true, opacity: 1, locked: false, zOrder: 0, data: new Array(12).fill(0) },
      ],
    };

    const map = loadFromSchema(schema);

    expect(map.tilesets).toHaveLength(1);
    expect(map.tilesets[0].name).toBe('terrain');
    expect(map.tilesets[0].firstGid).toBe(1);
    expect(map.tilesets[0].image).toBeNull();
  });

  it('throws on unsupported schema version', () => {
    const schema: ProjectSchema = {
      version: 999,
      map: { width: 1, height: 1, tileWidth: 16, tileHeight: 16 },
      tilesets: [],
      layers: [],
    };

    expect(() => loadFromSchema(schema)).toThrow('Unsupported schema version');
  });

  it('restores object layers', () => {
    const schema: ProjectSchema = {
      version: 1,
      map: { width: 4, height: 3, tileWidth: 16, tileHeight: 16 },
      tilesets: [],
      layers: [
        {
          type: 'object', name: 'Objects', visible: true, opacity: 1, locked: false, zOrder: 1,
          objects: [
            { id: 1, name: 'spawn', type: 'point', x: 10, y: 20, width: 0, height: 0, properties: {} },
          ],
        },
      ],
    };

    const map = loadFromSchema(schema);

    expect(map.layers).toHaveLength(1);
    expect(map.layers[0].type).toBe('object');
    if (map.layers[0].type === 'object') {
      expect(map.layers[0].objects).toHaveLength(1);
      expect(map.layers[0].objects[0].name).toBe('spawn');
    }
  });
});

// ── Round-trip test (#65) ─────────────────────────────────────────────

describe('save → load round-trip', () => {
  it('preserves map dimensions, layers, and tileset metadata', () => {
    const original = makeMap({ width: 8, height: 6 });

    // Add a tileset
    original.addTileset(makeTileset({ name: 'terrain', firstGid: 1 }));

    // Paint some cells
    original.setCellGid(0, 0, 0, 1);
    original.setCellGid(0, 3, 2, 7);
    original.setCellGid(0, 7, 5, 12);

    // Add a second layer with different properties
    const layer2 = createTileLayer('Foreground', 8, 6, 1);
    original.addLayer({ ...layer2, visible: false, opacity: 0.6, locked: true });
    original.setCellGid(1, 1, 1, 3);

    // Serialize
    const json = saveToJson(original);

    // Deserialize
    const loaded = loadFromJson(json);

    // Verify map dimensions
    expect(loaded.width).toBe(original.width);
    expect(loaded.height).toBe(original.height);
    expect(loaded.tileWidth).toBe(original.tileWidth);
    expect(loaded.tileHeight).toBe(original.tileHeight);

    // Verify layers
    expect(loaded.layers).toHaveLength(2);
    expect(loaded.layers[0].name).toBe('Layer 1');
    expect(loaded.layers[0].visible).toBe(true);
    expect(loaded.layers[0].opacity).toBe(1);
    expect(loaded.layers[1].name).toBe('Foreground');
    expect(loaded.layers[1].visible).toBe(false);
    expect(loaded.layers[1].opacity).toBe(0.6);
    expect(loaded.layers[1].locked).toBe(true);

    // Verify cell data
    expect(loaded.getCellGid(0, 0, 0)).toBe(1);
    expect(loaded.getCellGid(0, 3, 2)).toBe(7);
    expect(loaded.getCellGid(0, 7, 5)).toBe(12);
    expect(loaded.getCellGid(1, 1, 1)).toBe(3);

    // Verify tileset metadata
    expect(loaded.tilesets).toHaveLength(1);
    expect(loaded.tilesets[0].name).toBe('terrain');
    expect(loaded.tilesets[0].firstGid).toBe(1);
    expect(loaded.tilesets[0].tileWidth).toBe(16);
  });

  it('preserves all GIDs byte-for-byte through round-trip', () => {
    const original = makeMap({ width: 4, height: 3 });

    // Fill every cell with a unique GID
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        original.setCellGid(0, c, r, r * 4 + c + 1);
      }
    }

    const json = saveToJson(original);
    const loaded = loadFromJson(json);

    // Verify every cell
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        expect(loaded.getCellGid(0, c, r)).toBe(r * 4 + c + 1);
      }
    }
  });
});

// ── Tiled JSON Export ─────────────────────────────────────────────────

describe('exportToTiledJson', () => {
  it('produces valid JSON with required Tiled fields', () => {
    const map = makeMap();
    map.addTileset(makeTileset());

    const json = exportToTiledJson(map);
    const parsed = JSON.parse(json);

    expect(parsed.version).toBe('1.10');
    expect(parsed.type).toBe('map');
    expect(parsed.orientation).toBe('orthogonal');
    expect(parsed.renderorder).toBe('right-down');
    expect(parsed.width).toBe(4);
    expect(parsed.height).toBe(3);
    expect(parsed.tilewidth).toBe(16);
    expect(parsed.tileheight).toBe(16);
    expect(parsed.infinite).toBe(false);
  });

  it('includes tileset with firstgid and tile dimensions', () => {
    const map = makeMap();
    map.addTileset(makeTileset({ name: 'grass', firstGid: 1 }));

    const parsed = JSON.parse(exportToTiledJson(map));

    expect(parsed.tilesets).toHaveLength(1);
    expect(parsed.tilesets[0].firstgid).toBe(1);
    expect(parsed.tilesets[0].name).toBe('grass');
    expect(parsed.tilesets[0].tilewidth).toBe(16);
  });

  it('exports tile layers with data array', () => {
    const map = makeMap({ width: 2, height: 2 });
    map.setCellGid(0, 0, 0, 5);
    map.setCellGid(0, 1, 1, 10);

    const parsed = JSON.parse(exportToTiledJson(map));

    expect(parsed.layers).toHaveLength(1);
    expect(parsed.layers[0].type).toBe('tilelayer');
    expect(parsed.layers[0].data).toEqual([5, 0, 0, 10]);
  });

  it('exports object layers with objects', () => {
    const map = makeMap();
    const objLayer = createObjectLayer('Triggers', 1);
    map.addLayer({
      ...objLayer,
      objects: [
        { id: 1, name: 'exit', type: 'rect', x: 32, y: 48, width: 16, height: 16, properties: {} },
      ],
    });

    const parsed = JSON.parse(exportToTiledJson(map));

    const objLayerExport = parsed.layers.find((l: { type: string }) => l.type === 'objectgroup');
    expect(objLayerExport).toBeDefined();
    expect(objLayerExport.objects).toHaveLength(1);
    expect(objLayerExport.objects[0].name).toBe('exit');
  });
});

// ── Raw 2D Array Export ──────────────────────────────────────────────

describe('exportToRawArrays', () => {
  it('exports tile layers as 2D arrays', () => {
    const map = makeMap({ width: 3, height: 2 });
    map.setCellGid(0, 0, 0, 1);
    map.setCellGid(0, 2, 1, 5);

    const parsed = JSON.parse(exportToRawArrays(map));

    expect(parsed.layers).toHaveLength(1);
    expect(parsed.layers[0].name).toBe('Layer 1');
    expect(parsed.layers[0].data).toEqual([
      [1, 0, 0],
      [0, 0, 5],
    ]);
  });

  it('skips object layers', () => {
    const map = makeMap();
    map.addLayer(createObjectLayer('Objects', 1));

    const parsed = JSON.parse(exportToRawArrays(map));

    expect(parsed.layers).toHaveLength(1); // Only the tile layer
  });

  it('handles empty map', () => {
    const map = makeMap({ width: 2, height: 2 });

    const parsed = JSON.parse(exportToRawArrays(map));

    expect(parsed.layers[0].data).toEqual([
      [0, 0],
      [0, 0],
    ]);
  });
});
