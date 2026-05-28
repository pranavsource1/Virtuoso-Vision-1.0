// =============================================================================
// noise.ts — Simplex noise implementation (Stefan Gustavson algorithm)
// =============================================================================
// Provides 2D simplex noise, fractal Brownian motion, ridge noise, and a
// seeded PRNG. All noise functions return values in the range [-1, 1].
// =============================================================================

// ---------------------------------------------------------------------------
// Permutation table & gradient vectors
// ---------------------------------------------------------------------------

const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;

const grad3: [number, number, number][] = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];

const perm = new Uint8Array(512);
const permMod12 = new Uint8Array(512);

// Default permutation (Improved Noise reference permutation)
const p: number[] = [
  151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,
  142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,
  203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,
  74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,
  220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,
  132,187,208,89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,
  186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,
  59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,
  70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,
  178,185,112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,
  241,81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,184,84,204,
  176,115,121,50,45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,
  128,195,78,66,215,61,156,180,
];

/**
 * Seed the noise generator with an integer seed value.
 * Shuffles the internal permutation table for deterministic output.
 */
export function seed(s: number): void {
  // Use a simple LCG-style seeded shuffle
  if (s === 0) s = 1; // avoid zero-seed degenerate case
  s = Math.floor(s);

  // Build a shuffled copy of [0..255] using the seed
  const source = new Uint8Array(256);
  for (let i = 0; i < 256; i++) source[i] = p[i];

  // Fisher-Yates shuffle driven by the seed
  let v = s;
  for (let i = 255; i > 0; i--) {
    v = ((v * 16807) % 2147483647) | 0;
    if (v < 0) v += 2147483647;
    const j = v % (i + 1);
    const tmp = source[i];
    source[i] = source[j];
    source[j] = tmp;
  }

  for (let i = 0; i < 256; i++) {
    perm[i] = perm[i + 256] = source[i];
    permMod12[i] = permMod12[i + 256] = source[i] % 12;
  }
}

// Initialize with default permutation
(function initDefault() {
  for (let i = 0; i < 256; i++) {
    perm[i] = perm[i + 256] = p[i];
    permMod12[i] = permMod12[i + 256] = p[i] % 12;
  }
})();

// ---------------------------------------------------------------------------
// 2D Simplex Noise
// ---------------------------------------------------------------------------

function dot2(g: [number, number, number], x: number, y: number): number {
  return g[0] * x + g[1] * y;
}

/**
 * 2D simplex noise. Returns a value in the range [-1, 1].
 */
export function simplex2(xin: number, yin: number): number {
  let n0: number, n1: number, n2: number;

  // Skew the input space to determine which simplex cell we're in
  const s = (xin + yin) * F2;
  const i = Math.floor(xin + s);
  const j = Math.floor(yin + s);

  const t = (i + j) * G2;
  const X0 = i - t; // Unskew the cell origin back to (x,y) space
  const Y0 = j - t;
  const x0 = xin - X0; // The x,y distances from the cell origin
  const y0 = yin - Y0;

  // Determine which simplex we are in
  let i1: number, j1: number;
  if (x0 > y0) {
    i1 = 1; j1 = 0; // lower triangle, XY order: (0,0)->(1,0)->(1,1)
  } else {
    i1 = 0; j1 = 1; // upper triangle, YX order: (0,0)->(0,1)->(1,1)
  }

  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1.0 + 2.0 * G2;
  const y2 = y0 - 1.0 + 2.0 * G2;

  // Work out the hashed gradient indices of the three simplex corners
  const ii = i & 255;
  const jj = j & 255;
  const gi0 = permMod12[ii + perm[jj]];
  const gi1 = permMod12[ii + i1 + perm[jj + j1]];
  const gi2 = permMod12[ii + 1 + perm[jj + 1]];

  // Calculate the contribution from the three corners
  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 < 0) {
    n0 = 0.0;
  } else {
    t0 *= t0;
    n0 = t0 * t0 * dot2(grad3[gi0], x0, y0);
  }

  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 < 0) {
    n1 = 0.0;
  } else {
    t1 *= t1;
    n1 = t1 * t1 * dot2(grad3[gi1], x1, y1);
  }

  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 < 0) {
    n2 = 0.0;
  } else {
    t2 *= t2;
    n2 = t2 * t2 * dot2(grad3[gi2], x2, y2);
  }

  // Add contributions from each corner to get the final noise value.
  // The result is scaled to return values in the range [-1, 1].
  return 70.0 * (n0 + n1 + n2);
}

// ---------------------------------------------------------------------------
// Fractal Brownian Motion (fBm)
// ---------------------------------------------------------------------------

/**
 * Fractal Brownian Motion — sums multiple octaves of simplex noise for
 * natural-looking terrain and cloud patterns.
 *
 * @param x - X coordinate
 * @param y - Y coordinate
 * @param octaves - Number of noise layers (default 6)
 * @param lacunarity - Frequency multiplier per octave (default 2.0)
 * @param gain - Amplitude multiplier per octave (default 0.5)
 * @returns Noise value, roughly in [-1, 1] but may exceed slightly
 */
export function fbm(
  x: number,
  y: number,
  octaves: number = 6,
  lacunarity: number = 2.0,
  gain: number = 0.5,
): number {
  let sum = 0;
  let amplitude = 1.0;
  let frequency = 1.0;
  let maxAmplitude = 0; // For normalization

  for (let i = 0; i < octaves; i++) {
    sum += amplitude * simplex2(x * frequency, y * frequency);
    maxAmplitude += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return sum / maxAmplitude;
}

// ---------------------------------------------------------------------------
// Ridge Noise (for mountains / ridgelines)
// ---------------------------------------------------------------------------

/**
 * Ridge noise — takes the absolute value of simplex noise and inverts it,
 * producing sharp ridgelines suitable for mountain terrain.
 *
 * @param x - X coordinate
 * @param y - Y coordinate
 * @param octaves - Number of noise layers (default 5)
 * @returns Noise value in roughly [0, 1]
 */
export function ridge(
  x: number,
  y: number,
  octaves: number = 5,
): number {
  let sum = 0;
  let amplitude = 1.0;
  let frequency = 1.0;
  let maxAmplitude = 0;
  let prev = 1.0;
  const lacunarity = 2.2;
  const gain = 0.5;
  const offset = 1.0;

  for (let i = 0; i < octaves; i++) {
    const n = simplex2(x * frequency, y * frequency);
    // Ridge transformation: sharp peaks
    let r = offset - Math.abs(n);
    r = r * r;
    // Weight successive octaves by previous octave
    sum += r * amplitude * prev;
    prev = r;
    maxAmplitude += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return sum / maxAmplitude;
}

// ---------------------------------------------------------------------------
// Seeded Random Number Generator
// ---------------------------------------------------------------------------

/**
 * A simple seeded pseudo-random number generator using a linear congruential
 * generator. Useful for deterministic procedural generation.
 */
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed === 0 ? 1 : Math.abs(Math.floor(seed));
  }

  /**
   * Returns the next pseudo-random number in [0, 1).
   */
  next(): number {
    // Park-Miller LCG
    this.state = ((this.state * 16807) % 2147483647) | 0;
    if (this.state < 0) this.state += 2147483647;
    return (this.state - 1) / 2147483646;
  }

  /**
   * Returns a pseudo-random number in [min, max).
   */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /**
   * Returns a pseudo-random integer in [min, max] (inclusive).
   */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
}
