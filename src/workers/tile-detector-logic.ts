/**
 * Tile Size Detector — pure detection heuristics.
 *
 * All functions are pure: they take pixel data and dimensions, return scores.
 * No DOM, no Worker, no OffscreenCanvas — fully testable in Node.
 */

/** A ranked tile size candidate with confidence score. */
export interface TileSizeCandidate {
  width: number;
  height: number;
  confidence: number; // 0.0 to 1.0
}

/** Common tile sizes used in 2D game spritesheets. */
export const COMMON_SIZES = [8, 16, 24, 32, 48, 64];

/**
 * Generate candidate tile sizes to evaluate.
 *
 * Produces all (width, height) pairs from COMMON_SIZES where both dimensions
 * divide into the image (allowing remainder). Filters out candidates larger
 * than the image or that would yield fewer than 2 tiles on either axis.
 */
export function generateCandidates(
  imageWidth: number,
  imageHeight: number,
): Array<{ width: number; height: number }> {
  const candidates: Array<{ width: number; height: number }> = [];

  for (const w of COMMON_SIZES) {
    for (const h of COMMON_SIZES) {
      if (w > imageWidth || h > imageHeight) continue;
      // Need at least 2 tiles on at least one axis to be meaningful,
      // but allow single-row or single-column spritesheets.
      const cols = Math.floor(imageWidth / w);
      const rows = Math.floor(imageHeight / h);
      if (cols < 1 || rows < 1) continue;
      candidates.push({ width: w, height: h });
    }
  }

  return candidates;
}

/**
 * Score a candidate by how evenly it divides the image dimensions.
 *
 * Exact division on both axes = 1.0. Remainder penalizes proportionally.
 * Common game sizes (16, 32) get a small boost.
 */
export function scoreDivisibility(
  imageWidth: number,
  imageHeight: number,
  tileWidth: number,
  tileHeight: number,
): number {
  const remainderX = imageWidth % tileWidth;
  const remainderY = imageHeight % tileHeight;

  // Score each axis: 1.0 for exact, linearly decreasing with remainder fraction
  const scoreX = 1.0 - remainderX / tileWidth;
  const scoreY = 1.0 - remainderY / tileHeight;

  let score = scoreX * scoreY;

  // Boost common game tile sizes slightly
  const preferredSizes = [16, 32, 64];
  if (preferredSizes.includes(tileWidth) && preferredSizes.includes(tileHeight)) {
    score = Math.min(1.0, score * 1.1);
  }

  return score;
}

/**
 * Score a candidate by scanning for transparent grid lines at tile boundaries.
 *
 * For each tile boundary (vertical and horizontal), checks if the row/column
 * of pixels at that boundary is predominantly transparent (alpha < 10).
 * Only counts transparency — not low variance — to avoid false positives
 * on uniformly-colored images.
 *
 * Compares boundary transparency rate against non-boundary transparency rate
 * to ensure boundaries are distinctly more transparent than the rest of the image.
 */
export function scoreGridLines(
  pixels: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  tileWidth: number,
  tileHeight: number,
): number {
  let boundaryTransparentPixels = 0;
  let boundaryTotalPixels = 0;
  let nonBoundaryTransparentPixels = 0;
  let nonBoundaryTotalPixels = 0;

  // Scan all pixels, classify as boundary or non-boundary
  for (let y = 0; y < imageHeight; y++) {
    for (let x = 0; x < imageWidth; x++) {
      const idx = (y * imageWidth + x) * 4;
      const a = pixels[idx + 3];
      const isTransparent = a < 10;

      const isVerticalBoundary = x > 0 && x % tileWidth === 0;
      const isHorizontalBoundary = y > 0 && y % tileHeight === 0;
      const isBoundary = isVerticalBoundary || isHorizontalBoundary;

      if (isBoundary) {
        boundaryTotalPixels++;
        if (isTransparent) boundaryTransparentPixels++;
      } else {
        nonBoundaryTotalPixels++;
        if (isTransparent) nonBoundaryTransparentPixels++;
      }
    }
  }

  if (boundaryTotalPixels === 0) return 0;

  const boundaryRate = boundaryTransparentPixels / boundaryTotalPixels;
  const nonBoundaryRate = nonBoundaryTotalPixels > 0
    ? nonBoundaryTransparentPixels / nonBoundaryTotalPixels
    : 0;

  // Boundaries must be significantly more transparent than non-boundaries
  // If the entire image is transparent (or uniform), this difference is ~0
  const difference = boundaryRate - nonBoundaryRate;

  // Score: require boundary transparency rate to be meaningfully higher
  // A spritesheet with clear grid lines has boundaryRate ~1.0 and nonBoundaryRate ~0.0
  return Math.max(0, Math.min(1.0, difference));
}

/**
 * Score a candidate by measuring color transition frequency at tile
 * boundaries vs tile interiors.
 *
 * Tile boundaries should have more sharp color transitions than points
 * within tiles. A high ratio means the candidate aligns with actual
 * tile edges. Uses a continuous scoring function so that candidates
 * whose boundaries perfectly align with real tile edges score higher
 * than sub-multiples that only partially align.
 */
export function scoreColorTransitions(
  pixels: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  tileWidth: number,
  tileHeight: number,
): number {
  let boundaryTransitions = 0;
  let boundaryPixels = 0;
  let interiorTransitions = 0;
  let interiorPixels = 0;

  // Scan horizontal transitions (compare pixel at x with pixel at x-1)
  // Sample rows to keep performance reasonable
  const rowStep = Math.max(1, Math.floor(imageHeight / 64));

  for (let y = 0; y < imageHeight; y += rowStep) {
    for (let x = 1; x < imageWidth; x++) {
      const idx1 = (y * imageWidth + (x - 1)) * 4;
      const idx2 = (y * imageWidth + x) * 4;

      const diff =
        Math.abs(pixels[idx1] - pixels[idx2]) +
        Math.abs(pixels[idx1 + 1] - pixels[idx2 + 1]) +
        Math.abs(pixels[idx1 + 2] - pixels[idx2 + 2]);

      const isTransition = diff > 30;

      if (x % tileWidth === 0) {
        // This is a tile boundary
        boundaryPixels++;
        if (isTransition) boundaryTransitions++;
      } else {
        interiorPixels++;
        if (isTransition) interiorTransitions++;
      }
    }
  }

  // Scan vertical transitions similarly
  const colStep = Math.max(1, Math.floor(imageWidth / 64));

  for (let x = 0; x < imageWidth; x += colStep) {
    for (let y = 1; y < imageHeight; y++) {
      const idx1 = ((y - 1) * imageWidth + x) * 4;
      const idx2 = (y * imageWidth + x) * 4;

      const diff =
        Math.abs(pixels[idx1] - pixels[idx2]) +
        Math.abs(pixels[idx1 + 1] - pixels[idx2 + 1]) +
        Math.abs(pixels[idx1 + 2] - pixels[idx2 + 2]);

      const isTransition = diff > 30;

      if (y % tileHeight === 0) {
        boundaryPixels++;
        if (isTransition) boundaryTransitions++;
      } else {
        interiorPixels++;
        if (isTransition) interiorTransitions++;
      }
    }
  }

  if (boundaryPixels === 0 || interiorPixels === 0) return 0;

  const boundaryRate = boundaryTransitions / boundaryPixels;
  const interiorRate = interiorTransitions / interiorPixels;

  // If no transitions anywhere, the image is uniform
  if (boundaryRate === 0 && interiorRate === 0) return 0;

  // The score combines two signals:
  //
  // 1. Absolute boundary rate: what fraction of boundary pixels show transitions.
  //    A perfect candidate has transitions at ALL its boundaries (rate = 1.0).
  //    A sub-multiple (e.g., 16px when real tiles are 32px) only has transitions
  //    at every other boundary (rate ~ 0.5), since mid-tile boundaries have
  //    no color change.
  //
  // 2. Selectivity: boundary rate should exceed interior rate.
  //    If interiorRate is also high, the candidate doesn't align with real
  //    tile edges.
  //
  // 3. Boundary density: candidates with more boundary lines (= more tiles)
  //    are preferred over candidates with very few. A 64x64 candidate on a
  //    128x128 image has only 2 boundary lines total, while 32x32 has 6.
  //    More boundaries means more statistical evidence and is more typical
  //    of real spritesheets (many tiles, not just a few).

  // Count unique boundary lines
  const verticalLines = Math.max(0, Math.floor(imageWidth / tileWidth) - 1);
  const horizontalLines = Math.max(0, Math.floor(imageHeight / tileHeight) - 1);
  const totalBoundaryLines = verticalLines + horizontalLines;

  // Density factor: ramp from ~0.3 at 2 lines to 1.0 at 6+ lines
  const densityFactor = Math.min(1.0, 0.3 + 0.7 * Math.min(1.0, totalBoundaryLines / 6));

  let rawScore: number;
  if (interiorRate === 0) {
    rawScore = boundaryRate;
  } else {
    const selectivity = Math.max(0, boundaryRate - interiorRate);
    rawScore = boundaryRate * 0.6 + selectivity * 0.4;
  }

  return Math.min(1.0, Math.max(0, rawScore * densityFactor));
}

/**
 * Combine heuristic scores into a final confidence value.
 *
 * Weights: divisibility 0.35, gridLines 0.40, transitions 0.25
 */
export function combinedScore(
  divisibility: number,
  gridLines: number,
  transitions: number,
): number {
  return divisibility * 0.35 + gridLines * 0.40 + transitions * 0.25;
}

/**
 * Run all heuristics and return the top 5 ranked candidates.
 *
 * Generates candidates from common tile sizes, scores each with all
 * heuristics, combines scores, and returns sorted by confidence descending.
 */
export function rankCandidates(
  pixels: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
): TileSizeCandidate[] {
  const candidates = generateCandidates(imageWidth, imageHeight);

  const scored: TileSizeCandidate[] = candidates.map((c) => {
    const div = scoreDivisibility(imageWidth, imageHeight, c.width, c.height);
    const grid = scoreGridLines(pixels, imageWidth, imageHeight, c.width, c.height);
    const trans = scoreColorTransitions(pixels, imageWidth, imageHeight, c.width, c.height);

    let confidence = combinedScore(div, grid, trans);

    // Square tile bonus: square tiles are far more common in game spritesheets.
    // Apply a small multiplicative boost to square candidates to break ties.
    if (c.width === c.height) {
      confidence = Math.min(1.0, confidence * 1.05);
    }

    return {
      width: c.width,
      height: c.height,
      confidence,
    };
  });

  // Sort descending by confidence
  scored.sort((a, b) => b.confidence - a.confidence);

  // Return top 5
  return scored.slice(0, 5);
}
