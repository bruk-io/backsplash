/**
 * TileDetectorWrapper — main-thread convenience API for the tile detector worker.
 *
 * Spawns the Web Worker and exposes a Promise-based detect() method.
 */

import type { TileSizeCandidate } from './tile-detector-logic.js';
import type { DetectResponse } from './tile-detector.js';

export type { TileSizeCandidate };

export class TileDetectorWrapper {
  private _worker: Worker;

  constructor() {
    this._worker = new Worker(
      new URL('./tile-detector.ts', import.meta.url),
      { type: 'module' },
    );
  }

  /**
   * Detect tile size candidates from an ImageBitmap.
   *
   * Transfers the ImageBitmap to the worker (zero-copy) and returns
   * ranked candidates. The ImageBitmap is consumed and cannot be
   * reused after calling this method.
   */
  detect(image: ImageBitmap): Promise<TileSizeCandidate[]> {
    return new Promise((resolve) => {
      this._worker.onmessage = (e: MessageEvent<DetectResponse>) => {
        if (e.data.type === 'result') {
          resolve(e.data.candidates);
        }
      };
      this._worker.postMessage({ type: 'detect', image }, [image]);
    });
  }

  /** Terminate the worker and free resources. */
  dispose(): void {
    this._worker.terminate();
  }
}
