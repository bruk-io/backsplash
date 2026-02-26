import { describe, it, expect } from 'vitest';
import {
  generateCandidates,
  scoreDivisibility,
  scoreGridLines,
  scoreColorTransitions,
  combinedScore,
  rankCandidates,
  COMMON_SIZES,
} from './tile-detector-logic.js';

// ── Test Helpers ──────────────────────────────────────────────────────

/**
 * Create a solid-color image with transparent grid lines at tile boundaries.
 *
 * Tiles are filled with a solid opaque color. The 1px-wide lines between
 * tiles (at x = n*tileWidth and y = n*tileHeight) are fully transparent.
 */
function createGriddedSpritesheet(
  imageWidth: number,
  imageHeight: number,
  tileWidth: number,
  tileHeight: number,
  options?: { spacing?: number; margin?: number },
): Uint8ClampedArray {
  const spacing = options?.spacing ?? 0;
  const margin = options?.margin ?? 0;
  const pixels = new Uint8ClampedArray(imageWidth * imageHeight * 4);

  for (let y = 0; y < imageHeight; y++) {
    for (let x = 0; x < imageWidth; x++) {
      const idx = (y * imageWidth + x) * 4;

      // Check if this pixel lies on a tile boundary line
      const effectiveX = x - margin;
      const effectiveY = y - margin;

      const isInMargin = x < margin || y < margin ||
        x >= imageWidth - margin || y >= imageHeight - margin;

      let isGridLine = false;
      if (!isInMargin && spacing === 0) {
        // No spacing: boundaries are at exact multiples of tile size
        if (
          (effectiveX > 0 && effectiveX % tileWidth === 0) ||
          (effectiveY > 0 && effectiveY % tileHeight === 0)
        ) {
          isGridLine = true;
        }
      }

      if (isGridLine || isInMargin) {
        // Transparent pixel
        pixels[idx] = 0;
        pixels[idx + 1] = 0;
        pixels[idx + 2] = 0;
        pixels[idx + 3] = 0;
      } else {
        // Solid opaque color (medium gray)
        pixels[idx] = 128;
        pixels[idx + 1] = 128;
        pixels[idx + 2] = 128;
        pixels[idx + 3] = 255;
      }
    }
  }

  return pixels;
}

/**
 * Create a spritesheet with distinct colored tiles (no transparent grid lines).
 *
 * Each tile gets a unique solid color. Adjacent tiles have visibly different
 * colors, creating sharp transitions at tile boundaries.
 */
function createColoredTiles(
  imageWidth: number,
  imageHeight: number,
  tileWidth: number,
  tileHeight: number,
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(imageWidth * imageHeight * 4);
  const cols = Math.floor(imageWidth / tileWidth);

  for (let y = 0; y < imageHeight; y++) {
    for (let x = 0; x < imageWidth; x++) {
      const idx = (y * imageWidth + x) * 4;

      const tileCol = Math.floor(x / tileWidth);
      const tileRow = Math.floor(y / tileHeight);
      const tileIndex = tileRow * cols + tileCol;

      // Generate distinct colors using golden-ratio-based hashing
      // This ensures adjacent tiles have very different colors
      const r = ((tileIndex * 97) % 200) + 30;
      const g = ((tileIndex * 53 + 80) % 200) + 30;
      const b = ((tileIndex * 151 + 160) % 200) + 30;

      pixels[idx] = r;
      pixels[idx + 1] = g;
      pixels[idx + 2] = b;
      pixels[idx + 3] = 255;
    }
  }

  return pixels;
}

/**
 * Create a uniform solid-color image (no grid lines, no tile distinctions).
 */
function createUniformImage(
  imageWidth: number,
  imageHeight: number,
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(imageWidth * imageHeight * 4);

  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 100;
    pixels[i + 1] = 100;
    pixels[i + 2] = 100;
    pixels[i + 3] = 255;
  }

  return pixels;
}

// ── generateCandidates ───────────────────────────────────────────────

describe('generateCandidates', () => {
  it('generates candidates for a 128x128 image', () => {
    const candidates = generateCandidates(128, 128);
    expect(candidates.length).toBeGreaterThan(0);

    // All common sizes <= 128 should appear as square candidates
    for (const size of COMMON_SIZES) {
      expect(candidates).toContainEqual({ width: size, height: size });
    }
  });

  it('excludes candidates larger than the image', () => {
    const candidates = generateCandidates(24, 24);
    const tooLarge = candidates.filter((c) => c.width > 24 || c.height > 24);
    expect(tooLarge).toHaveLength(0);
  });

  it('generates non-square candidates', () => {
    const candidates = generateCandidates(128, 64);
    expect(candidates).toContainEqual({ width: 16, height: 32 });
    expect(candidates).toContainEqual({ width: 32, height: 16 });
  });

  it('returns empty array for very small images', () => {
    const candidates = generateCandidates(4, 4);
    expect(candidates).toHaveLength(0);
  });
});

// ── scoreDivisibility ────────────────────────────────────────────────

describe('scoreDivisibility', () => {
  it('returns 1.0 (with possible boost) for exact division of a preferred size', () => {
    // 128 / 32 = 4 exactly on both axes → score should be max
    const score = scoreDivisibility(128, 128, 32, 32);
    expect(score).toBe(1.0);
  });

  it('scores 32x32 higher than 24x24 for a 128x128 image', () => {
    const score32 = scoreDivisibility(128, 128, 32, 32);
    const score24 = scoreDivisibility(128, 128, 24, 24);
    expect(score32).toBeGreaterThan(score24);
  });

  it('returns high score when both dimensions divide evenly', () => {
    // 96 / 32 = 3, 64 / 32 = 2 — exact
    const score = scoreDivisibility(96, 64, 32, 32);
    expect(score).toBe(1.0);
  });

  it('returns lower score when dimensions do not divide evenly', () => {
    // 100 / 32 = 3 remainder 4
    const score = scoreDivisibility(100, 100, 32, 32);
    expect(score).toBeLessThan(1.0);
    expect(score).toBeGreaterThan(0);
  });

  it('handles non-square candidates on non-square images', () => {
    // 128 / 64 = 2, 64 / 32 = 2 — exact
    const score = scoreDivisibility(128, 64, 64, 32);
    expect(score).toBeGreaterThan(0.9);
  });

  it('both 32x32 and 16x16 divide 96x64 exactly', () => {
    const score32 = scoreDivisibility(96, 64, 32, 32);
    const score16 = scoreDivisibility(96, 64, 16, 16);
    // Both divide exactly, but 32 and 16 are both preferred sizes
    expect(score32).toBe(1.0);
    expect(score16).toBe(1.0);
  });
});

// ── scoreGridLines ───────────────────────────────────────────────────

describe('scoreGridLines', () => {
  it('scores high for spritesheet with transparent grid lines at 32px intervals', () => {
    const pixels = createGriddedSpritesheet(128, 128, 32, 32);
    const score = scoreGridLines(pixels, 128, 128, 32, 32);
    expect(score).toBeGreaterThan(0.5);
  });

  it('32x32 is top ranked for 128x128 with 32px grid lines', () => {
    const pixels = createGriddedSpritesheet(128, 128, 32, 32);
    const score32 = scoreGridLines(pixels, 128, 128, 32, 32);
    const score16 = scoreGridLines(pixels, 128, 128, 16, 16);
    // 32px grid means boundaries at 32, 64, 96 — the 16px grid would only
    // find lines at 32, 64, 96 (every other boundary), scoring lower or equal
    expect(score32).toBeGreaterThanOrEqual(score16);
  });

  it('scores high for 16px transparent grid lines', () => {
    const pixels = createGriddedSpritesheet(64, 64, 16, 16);
    const score = scoreGridLines(pixels, 64, 64, 16, 16);
    expect(score).toBeGreaterThan(0.5);
  });

  it('scores near zero for image with NO grid lines', () => {
    const pixels = createUniformImage(128, 128);
    const score = scoreGridLines(pixels, 128, 128, 32, 32);
    expect(score).toBeLessThanOrEqual(0.1);
  });

  it('scores zero for a solid colored image', () => {
    // Colored tiles have no transparent lines
    const pixels = createColoredTiles(128, 128, 32, 32);
    const score = scoreGridLines(pixels, 128, 128, 32, 32);
    expect(score).toBe(0);
  });
});

// ── scoreColorTransitions ────────────────────────────────────────────

describe('scoreColorTransitions', () => {
  it('scores high for distinct colored 32x32 tiles', () => {
    const pixels = createColoredTiles(128, 128, 32, 32);
    const score = scoreColorTransitions(pixels, 128, 128, 32, 32);
    expect(score).toBeGreaterThan(0);
  });

  it('transitions peak at 32px boundaries for 32px colored tiles', () => {
    const pixels = createColoredTiles(128, 128, 32, 32);
    const score32 = scoreColorTransitions(pixels, 128, 128, 32, 32);
    // 16px boundaries cut through tile interiors too, so boundary rate
    // should not be as distinctive
    const score16 = scoreColorTransitions(pixels, 128, 128, 16, 16);
    expect(score32).toBeGreaterThan(score16);
  });

  it('returns low score for uniform color image', () => {
    const pixels = createUniformImage(128, 128);
    const score = scoreColorTransitions(pixels, 128, 128, 32, 32);
    expect(score).toBeLessThanOrEqual(0.1);
  });
});

// ── combinedScore ────────────────────────────────────────────────────

describe('combinedScore', () => {
  it('returns weighted combination of three heuristics', () => {
    const score = combinedScore(1.0, 1.0, 1.0);
    expect(score).toBeCloseTo(1.0, 5);
  });

  it('returns 0 when all heuristics are 0', () => {
    expect(combinedScore(0, 0, 0)).toBe(0);
  });

  it('weights grid lines highest', () => {
    // Only gridLines = 1.0, others 0 → should give 0.40
    const gridOnly = combinedScore(0, 1.0, 0);
    // Only divisibility = 1.0, others 0 → should give 0.35
    const divOnly = combinedScore(1.0, 0, 0);
    // Only transitions = 1.0, others 0 → should give 0.25
    const transOnly = combinedScore(0, 0, 1.0);

    expect(gridOnly).toBeCloseTo(0.40, 5);
    expect(divOnly).toBeCloseTo(0.35, 5);
    expect(transOnly).toBeCloseTo(0.25, 5);
    expect(gridOnly).toBeGreaterThan(divOnly);
    expect(divOnly).toBeGreaterThan(transOnly);
  });
});

// ── rankCandidates (integration) ─────────────────────────────────────

describe('rankCandidates', () => {
  it('returns top candidate 32x32 for 128x128 with 32px transparent grid', () => {
    const pixels = createGriddedSpritesheet(128, 128, 32, 32);
    const candidates = rankCandidates(pixels, 128, 128);

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThanOrEqual(5);
    expect(candidates[0].width).toBe(32);
    expect(candidates[0].height).toBe(32);
  });

  it('returns top candidate 16x16 for 64x64 with 16px transparent grid', () => {
    const pixels = createGriddedSpritesheet(64, 64, 16, 16);
    const candidates = rankCandidates(pixels, 64, 64);

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].width).toBe(16);
    expect(candidates[0].height).toBe(16);
  });

  it('returns 32x32 as top for 128x128 colored tiles with no grid lines', () => {
    const pixels = createColoredTiles(128, 128, 32, 32);
    const candidates = rankCandidates(pixels, 128, 128);

    expect(candidates.length).toBeGreaterThan(0);
    // 32x32 should rank top via divisibility + color transitions + squareness
    expect(candidates[0].width).toBe(32);
    expect(candidates[0].height).toBe(32);
  });

  it('handles non-square image: 128x64 with 32px grid', () => {
    const pixels = createGriddedSpritesheet(128, 64, 32, 32);
    const candidates = rankCandidates(pixels, 128, 64);

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].width).toBe(32);
    expect(candidates[0].height).toBe(32);
  });

  it('handles very small image (32x32)', () => {
    const pixels = createGriddedSpritesheet(32, 32, 16, 16);
    const candidates = rankCandidates(pixels, 32, 32);

    expect(candidates.length).toBeGreaterThan(0);
    // Should detect 16x16 or 8x8 (both fit)
    const topWidth = candidates[0].width;
    const topHeight = candidates[0].height;
    expect(topWidth).toBeLessThanOrEqual(32);
    expect(topHeight).toBeLessThanOrEqual(32);
  });

  it('handles image not divisible by common sizes (100x100)', () => {
    const pixels = createColoredTiles(100, 100, 25, 25);
    const candidates = rankCandidates(pixels, 100, 100);

    // Should still return candidates — best-fit from common sizes
    expect(candidates.length).toBeGreaterThan(0);
    // All candidates should have valid confidence scores
    for (const c of candidates) {
      expect(c.confidence).toBeGreaterThanOrEqual(0);
      expect(c.confidence).toBeLessThanOrEqual(1.0);
    }
  });

  it('returns candidates sorted by confidence descending', () => {
    const pixels = createGriddedSpritesheet(128, 128, 32, 32);
    const candidates = rankCandidates(pixels, 128, 128);

    for (let i = 1; i < candidates.length; i++) {
      expect(candidates[i - 1].confidence).toBeGreaterThanOrEqual(
        candidates[i].confidence,
      );
    }
  });

  it('returns at most 5 candidates', () => {
    const pixels = createGriddedSpritesheet(128, 128, 32, 32);
    const candidates = rankCandidates(pixels, 128, 128);
    expect(candidates.length).toBeLessThanOrEqual(5);
  });

  it('all candidates have confidence between 0 and 1', () => {
    const pixels = createGriddedSpritesheet(128, 128, 32, 32);
    const candidates = rankCandidates(pixels, 128, 128);

    for (const c of candidates) {
      expect(c.confidence).toBeGreaterThanOrEqual(0);
      expect(c.confidence).toBeLessThanOrEqual(1.0);
    }
  });
});
