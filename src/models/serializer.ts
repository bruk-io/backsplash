/**
 * Serializer — save/load/export tilemap projects.
 *
 * Defines the .backsplash JSON schema and provides pure functions
 * for serializing and deserializing TilemapModel, LayerModel, and
 * TilesetModel. Also supports Tiled JSON and raw 2D array export.
 */

import { TilemapModel } from './tilemap-model.js';
import { TilesetModel } from './tileset-model.js';
import type { Layer, TileLayer, ObjectLayer, MapObject } from './layer-model.js';

// ── .backsplash JSON Schema Types ────────────────────────────────────

/** Schema version for forward compatibility. */
export const SCHEMA_VERSION = 1;

/** Serialized tileset reference (no image data — just metadata). */
export interface TilesetSchema {
  name: string;
  tileWidth: number;
  tileHeight: number;
  imageWidth: number;
  imageHeight: number;
  margin: number;
  spacing: number;
  firstGid: number;
  /** Original image filename for re-linking on load. */
  imageFilename: string;
}

/** Serialized tile layer. Cell data stored as plain number array. */
export interface TileLayerSchema {
  type: 'tile';
  name: string;
  visible: boolean;
  opacity: number;
  locked: boolean;
  zOrder: number;
  /** Flat GID array in row-major order (width * height). */
  data: number[];
}

/** Serialized object layer. */
export interface ObjectLayerSchema {
  type: 'object';
  name: string;
  visible: boolean;
  opacity: number;
  locked: boolean;
  zOrder: number;
  objects: MapObject[];
}

export type LayerSchema = TileLayerSchema | ObjectLayerSchema;

/** Top-level .backsplash project file schema. */
export interface ProjectSchema {
  version: number;
  map: {
    width: number;
    height: number;
    tileWidth: number;
    tileHeight: number;
  };
  tilesets: TilesetSchema[];
  layers: LayerSchema[];
}

// ── Serialize (Save) ─────────────────────────────────────────────────

/** Serialize a TilemapModel to a ProjectSchema object. */
export function serializeProject(tilemap: TilemapModel): ProjectSchema {
  return {
    version: SCHEMA_VERSION,
    map: {
      width: tilemap.width,
      height: tilemap.height,
      tileWidth: tilemap.tileWidth,
      tileHeight: tilemap.tileHeight,
    },
    tilesets: tilemap.tilesets.map(serializeTileset),
    layers: tilemap.layers.map(serializeLayer),
  };
}

/** Serialize a TilemapModel to a JSON string. */
export function saveToJson(tilemap: TilemapModel): string {
  return JSON.stringify(serializeProject(tilemap), null, 2);
}

function serializeTileset(ts: TilesetModel): TilesetSchema {
  return {
    name: ts.name,
    tileWidth: ts.tileWidth,
    tileHeight: ts.tileHeight,
    imageWidth: ts.columns * (ts.tileWidth + ts.spacing) - ts.spacing + ts.margin * 2,
    imageHeight: ts.rows * (ts.tileHeight + ts.spacing) - ts.spacing + ts.margin * 2,
    margin: ts.margin,
    spacing: ts.spacing,
    firstGid: ts.firstGid,
    imageFilename: ts.name,
  };
}

function serializeLayer(layer: Layer): LayerSchema {
  if (layer.type === 'tile') {
    return {
      type: 'tile',
      name: layer.name,
      visible: layer.visible,
      opacity: layer.opacity,
      locked: layer.locked,
      zOrder: layer.zOrder,
      data: Array.from(layer.data),
    };
  }
  return {
    type: 'object',
    name: layer.name,
    visible: layer.visible,
    opacity: layer.opacity,
    locked: layer.locked,
    zOrder: layer.zOrder,
    objects: [...layer.objects],
  };
}

// ── Deserialize (Load) ───────────────────────────────────────────────

/**
 * Deserialize a ProjectSchema into a TilemapModel.
 *
 * Returns the tilemap with layers and tileset metadata restored.
 * Tileset images must be re-linked separately (via IndexedDB handles
 * or user re-import) since the JSON contains no pixel data.
 */
export function loadFromSchema(schema: ProjectSchema): TilemapModel {
  if (schema.version > SCHEMA_VERSION) {
    throw new Error(
      `Unsupported schema version ${schema.version} (max supported: ${SCHEMA_VERSION})`,
    );
  }

  const tilemap = new TilemapModel(schema.map);

  // Remove the default layer created by the constructor
  tilemap.removeLayer(0);

  // Restore layers
  for (const layerSchema of schema.layers) {
    tilemap.addLayer(deserializeLayer(layerSchema, schema.map.width, schema.map.height));
  }

  // Restore tileset metadata (without images)
  for (const tsSchema of schema.tilesets) {
    tilemap.addTileset(deserializeTileset(tsSchema));
  }

  return tilemap;
}

/** Parse a JSON string and load into a TilemapModel. */
export function loadFromJson(json: string): TilemapModel {
  const schema = JSON.parse(json) as ProjectSchema;
  return loadFromSchema(schema);
}

function deserializeLayer(
  schema: LayerSchema,
  mapWidth: number,
  mapHeight: number,
): Layer {
  if (schema.type === 'tile') {
    const data = new Uint32Array(mapWidth * mapHeight);
    for (let i = 0; i < Math.min(schema.data.length, data.length); i++) {
      data[i] = schema.data[i];
    }
    return {
      type: 'tile',
      name: schema.name,
      visible: schema.visible,
      opacity: schema.opacity,
      locked: schema.locked,
      zOrder: schema.zOrder,
      data,
    } satisfies TileLayer;
  }

  return {
    type: 'object',
    name: schema.name,
    visible: schema.visible,
    opacity: schema.opacity,
    locked: schema.locked,
    zOrder: schema.zOrder,
    objects: schema.objects ?? [],
  } satisfies ObjectLayer;
}

function deserializeTileset(schema: TilesetSchema): TilesetModel {
  return new TilesetModel({
    name: schema.name,
    image: null, // Image must be re-linked separately
    tileWidth: schema.tileWidth,
    tileHeight: schema.tileHeight,
    imageWidth: schema.imageWidth,
    imageHeight: schema.imageHeight,
    margin: schema.margin,
    spacing: schema.spacing,
    firstGid: schema.firstGid,
  });
}

// ── Tiled JSON Export ────────────────────────────────────────────────

/** Tiled-compatible JSON export. */
export interface TiledMapJson {
  version: '1.10';
  tiledversion: string;
  type: 'map';
  orientation: 'orthogonal';
  renderorder: 'right-down';
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  infinite: false;
  tilesets: TiledTilesetJson[];
  layers: TiledLayerJson[];
  nextlayerid: number;
  nextobjectid: number;
}

interface TiledTilesetJson {
  firstgid: number;
  name: string;
  tilewidth: number;
  tileheight: number;
  tilecount: number;
  columns: number;
  image: string;
  imagewidth: number;
  imageheight: number;
  margin: number;
  spacing: number;
}

interface TiledLayerJson {
  id: number;
  name: string;
  type: 'tilelayer' | 'objectgroup';
  visible: boolean;
  opacity: number;
  x: number;
  y: number;
  width?: number;
  height?: number;
  data?: number[];
  objects?: TiledObjectJson[];
}

interface TiledObjectJson {
  id: number;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
}

/** Export a TilemapModel to Tiled-compatible JSON string. */
export function exportToTiledJson(tilemap: TilemapModel): string {
  let nextObjectId = 1;

  const tilesets: TiledTilesetJson[] = tilemap.tilesets.map((ts) => ({
    firstgid: ts.firstGid,
    name: ts.name,
    tilewidth: ts.tileWidth,
    tileheight: ts.tileHeight,
    tilecount: ts.tileCount,
    columns: ts.columns,
    image: ts.name, // Filename placeholder
    imagewidth: ts.columns * (ts.tileWidth + ts.spacing) - ts.spacing + ts.margin * 2,
    imageheight: ts.rows * (ts.tileHeight + ts.spacing) - ts.spacing + ts.margin * 2,
    margin: ts.margin,
    spacing: ts.spacing,
  }));

  const layers: TiledLayerJson[] = tilemap.layers.map((layer, i) => {
    if (layer.type === 'tile') {
      return {
        id: i + 1,
        name: layer.name,
        type: 'tilelayer',
        visible: layer.visible,
        opacity: layer.opacity,
        x: 0,
        y: 0,
        width: tilemap.width,
        height: tilemap.height,
        data: Array.from(layer.data),
      };
    }
    const objects: TiledObjectJson[] = layer.objects.map((obj) => {
      const tiledObj: TiledObjectJson = {
        id: nextObjectId++,
        name: obj.name,
        type: obj.type,
        x: obj.x,
        y: obj.y,
        width: obj.width,
        height: obj.height,
        visible: true,
      };
      return tiledObj;
    });
    return {
      id: i + 1,
      name: layer.name,
      type: 'objectgroup',
      visible: layer.visible,
      opacity: layer.opacity,
      x: 0,
      y: 0,
      objects,
    };
  });

  const map: TiledMapJson = {
    version: '1.10',
    tiledversion: '1.11.0',
    type: 'map',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    width: tilemap.width,
    height: tilemap.height,
    tilewidth: tilemap.tileWidth,
    tileheight: tilemap.tileHeight,
    infinite: false,
    tilesets,
    layers,
    nextlayerid: layers.length + 1,
    nextobjectid: nextObjectId,
  };

  return JSON.stringify(map, null, 2);
}

// ── Raw 2D Array Export ──────────────────────────────────────────────

/** Simple 2D array export format for custom engines. */
export interface RawExport {
  layers: Array<{
    name: string;
    data: number[][];
  }>;
}

/** Export tile layers as plain 2D arrays of GIDs. */
export function exportToRawArrays(tilemap: TilemapModel): string {
  const result: RawExport = {
    layers: [],
  };

  for (const layer of tilemap.layers) {
    if (layer.type !== 'tile') continue;

    const rows: number[][] = [];
    for (let r = 0; r < tilemap.height; r++) {
      const row: number[] = [];
      for (let c = 0; c < tilemap.width; c++) {
        row.push(layer.data[r * tilemap.width + c]);
      }
      rows.push(row);
    }

    result.layers.push({ name: layer.name, data: rows });
  }

  return JSON.stringify(result, null, 2);
}
