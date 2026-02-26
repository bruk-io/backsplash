/**
 * Tile Size Detector — Web Worker entry point.
 *
 * Receives an ImageBitmap via postMessage, draws it to an OffscreenCanvas
 * to extract pixel data, runs detection heuristics, and posts back ranked
 * tile size candidates. Runs off the main thread to avoid blocking the UI.
 */

import { rankCandidates } from './tile-detector-logic.js';
import type { TileSizeCandidate } from './tile-detector-logic.js';

/** Message sent from the main thread to the worker. */
export interface DetectRequest {
  type: 'detect';
  image: ImageBitmap;
}

/** Message sent from the worker back to the main thread. */
export interface DetectResponse {
  type: 'result';
  candidates: TileSizeCandidate[];
}

/**
 * Detect tile sizes from an ImageBitmap using OffscreenCanvas.
 *
 * Draws the image to extract raw pixel data, then delegates to
 * pure heuristic functions for analysis.
 */
async function detectTileSize(image: ImageBitmap): Promise<TileSizeCandidate[]> {
  const canvas = new OffscreenCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0);
  const imageData = ctx.getImageData(0, 0, image.width, image.height);

  return rankCandidates(imageData.data, image.width, image.height);
}

self.onmessage = async (e: MessageEvent<DetectRequest>) => {
  if (e.data.type === 'detect') {
    const candidates = await detectTileSize(e.data.image);
    self.postMessage({ type: 'result', candidates } satisfies DetectResponse);
    e.data.image.close(); // Release ImageBitmap memory
  }
};
