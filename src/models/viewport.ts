/** Viewport state. */
export interface Viewport {
  offsetX: number;
  offsetY: number;
  zoom: number;
}

/** Visible tile range for viewport culling. */
export interface TileRange {
  startCol: number;
  startRow: number;
  endCol: number; // exclusive
  endRow: number; // exclusive
}

/**
 * Calculate visible tile range given viewport state and canvas dimensions.
 * Used for viewport culling — only tiles in this range need rendering.
 */
export function getVisibleTileRange(
  viewport: Viewport,
  canvasWidth: number,
  canvasHeight: number,
  mapWidth: number,
  mapHeight: number,
  tileWidth: number,
  tileHeight: number,
): TileRange {
  const { offsetX, offsetY, zoom } = viewport;
  const scaledTW = tileWidth * zoom;
  const scaledTH = tileHeight * zoom;

  const startCol = Math.max(0, Math.floor(-offsetX / scaledTW));
  const startRow = Math.max(0, Math.floor(-offsetY / scaledTH));
  const endCol = Math.min(mapWidth, Math.ceil((canvasWidth - offsetX) / scaledTW));
  const endRow = Math.min(mapHeight, Math.ceil((canvasHeight - offsetY) / scaledTH));

  return { startCol, startRow, endCol, endRow };
}

/**
 * Convert screen (canvas) coordinates to map pixel coordinates.
 */
export function screenToMap(
  screenX: number,
  screenY: number,
  viewport: Viewport,
): { x: number; y: number } {
  return {
    x: (screenX - viewport.offsetX) / viewport.zoom,
    y: (screenY - viewport.offsetY) / viewport.zoom,
  };
}

/**
 * Convert screen coordinates to tile col/row.
 * Return null if outside map bounds.
 */
export function screenToTile(
  screenX: number,
  screenY: number,
  viewport: Viewport,
  mapWidth: number,
  mapHeight: number,
  tileWidth: number,
  tileHeight: number,
): { col: number; row: number } | null {
  const { x, y } = screenToMap(screenX, screenY, viewport);
  const col = Math.floor(x / tileWidth);
  const row = Math.floor(y / tileHeight);

  if (col < 0 || col >= mapWidth || row < 0 || row >= mapHeight) {
    return null;
  }

  return { col, row };
}

/**
 * Calculate new viewport after zooming centered on a screen point.
 * The map point under (cursorX, cursorY) stays fixed after zoom.
 */
export function zoomAtPoint(
  viewport: Viewport,
  cursorX: number,
  cursorY: number,
  zoomDelta: number,
  minZoom = 0.25,
  maxZoom = 4,
): Viewport {
  const oldZoom = viewport.zoom;
  const newZoom = Math.max(minZoom, Math.min(maxZoom, oldZoom * (1 + zoomDelta)));

  // Map point under cursor before zoom
  const mapX = (cursorX - viewport.offsetX) / oldZoom;
  const mapY = (cursorY - viewport.offsetY) / oldZoom;

  // Adjust offset so the same map point stays under the cursor
  return {
    offsetX: cursorX - mapX * newZoom,
    offsetY: cursorY - mapY * newZoom,
    zoom: newZoom,
  };
}

/**
 * Calculate new viewport after panning by (dx, dy) screen pixels.
 */
export function pan(
  viewport: Viewport,
  dx: number,
  dy: number,
): Viewport {
  return {
    offsetX: viewport.offsetX + dx,
    offsetY: viewport.offsetY + dy,
    zoom: viewport.zoom,
  };
}

/**
 * Calculate the destination rectangle for a tile on the canvas.
 */
export function tileToScreen(
  col: number,
  row: number,
  viewport: Viewport,
  tileWidth: number,
  tileHeight: number,
): { x: number; y: number; width: number; height: number } {
  const { offsetX, offsetY, zoom } = viewport;
  return {
    x: offsetX + col * tileWidth * zoom,
    y: offsetY + row * tileHeight * zoom,
    width: tileWidth * zoom,
    height: tileHeight * zoom,
  };
}
