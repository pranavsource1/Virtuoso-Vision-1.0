// =============================================================================
// TerrainGenerator.ts — Noise-driven terrain with vertex coloring & bass pulse
// =============================================================================
// Creates a 400×400 subdivided plane with height displaced by fractal noise.
// Vertex colors blend from scene palette based on elevation. Exports a
// `getHeightAt(x, z)` helper so other systems can query terrain height at any
// world coordinate.
// =============================================================================

import * as THREE from 'three';
import { seed as seedNoise, fbm, ridge } from './noise';

// ---------------------------------------------------------------------------
// SP subset used by this module
// ---------------------------------------------------------------------------
interface TerrainParams {
  terrainHeight?: number;
  terrainFrequency?: number;
  terrainErosion?: number;
  metalness?: number;
  roughness?: number;
  emissiveStrength?: number;
  bassReactivity?: number;
  colors?: { c1: string; c2: string; c3: string; c4: string; c5: string };
  terrainStyle?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PLANE_SIZE = 400;
const SEGMENTS = 128;
const DEFAULT_HEIGHT = 0.2;
const DEFAULT_FREQUENCY = 0.5;
const DEFAULT_EROSION = 0.5;
const HEIGHT_MULTIPLIER = 40; // scales normalised param into visible hills
const Y_OFFSET = -15;

// ---------------------------------------------------------------------------
// Terrain generator class
// ---------------------------------------------------------------------------
export class TerrainGenerator {
  private scene: THREE.Scene;
  private mesh: THREE.Mesh;
  private geometry: THREE.PlaneGeometry;
  private material: THREE.MeshStandardMaterial;
  private originalY: Float32Array; // stored for bass pulse overlay
  private params: TerrainParams;
  private colors: Record<string, THREE.Color>;

  // Noise parameters baked at construction time so getHeightAt stays in sync
  private freq: number;
  private heightScale: number;
  private erosionOctaves: number;

  constructor(
    scene: THREE.Scene,
    colors: Record<string, THREE.Color>,
    params: TerrainParams,
  ) {
    this.scene = scene;
    this.colors = colors;
    this.params = params;

    // Seed the noise so terrain is deterministic per session
    seedNoise(42);

    // ------- resolve parameters -------
    const heightParam = params.terrainHeight ?? DEFAULT_HEIGHT;
    this.heightScale = heightParam * HEIGHT_MULTIPLIER;

    const freqParam = params.terrainFrequency ?? DEFAULT_FREQUENCY;
    // Map [0-1] to a usable noise frequency range [0.01 - 0.05]
    this.freq = 0.01 + freqParam * 0.04;

    const erosionParam = params.terrainErosion ?? DEFAULT_EROSION;
    // More erosion → more octaves of detail (3-8)
    this.erosionOctaves = Math.floor(3 + erosionParam * 5);

    // ------- geometry -------
    this.geometry = new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE, SEGMENTS, SEGMENTS);
    this.geometry.rotateX(-Math.PI / 2); // make horizontal

    const posAttr = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    const vertexCount = posAttr.count;

    // Displace vertices along Y using noise
    for (let i = 0; i < vertexCount; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      posAttr.setY(i, this.sampleHeight(x, z));
    }
    posAttr.needsUpdate = true;
    this.geometry.computeVertexNormals();

    // Store original Y for bass pulsing
    this.originalY = new Float32Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) {
      this.originalY[i] = posAttr.getY(i);
    }

    // ------- vertex colors based on height -------
    const colorAttr = new Float32Array(vertexCount * 3);
    const c1 = colors.c1 ?? new THREE.Color(0x1a7a3a); // deep green fallback
    const c2 = colors.c2 ?? new THREE.Color(0x8b6914); // brown
    const c3 = colors.c3 ?? new THREE.Color(0x888888); // gray
    const c4 = colors.c4 ?? new THREE.Color(0xcccccc); // snow
    const tmpColor = new THREE.Color();

    // Determine height range for normalization
    let minH = Infinity, maxH = -Infinity;
    for (let i = 0; i < vertexCount; i++) {
      const h = this.originalY[i];
      if (h < minH) minH = h;
      if (h > maxH) maxH = h;
    }
    const range = maxH - minH || 1;

    for (let i = 0; i < vertexCount; i++) {
      const h = this.originalY[i];
      const t = (h - minH) / range; // 0..1

      if (t < 0.3) {
        // Deep green zone
        tmpColor.copy(c1).lerp(c2, t / 0.3);
      } else if (t < 0.55) {
        // Brown mid-zone
        tmpColor.copy(c2).lerp(c3, (t - 0.3) / 0.25);
      } else if (t < 0.8) {
        // Gray high zone
        tmpColor.copy(c3).lerp(c4, (t - 0.55) / 0.25);
      } else {
        // Snow-capped peaks
        tmpColor.copy(c4);
      }

      colorAttr[i * 3] = tmpColor.r;
      colorAttr[i * 3 + 1] = tmpColor.g;
      colorAttr[i * 3 + 2] = tmpColor.b;
    }
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colorAttr, 3));

    // ------- material -------
    const emissiveColor = colors.c5 ?? new THREE.Color(0x112211);
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: params.metalness ?? 0.1,
      roughness: params.roughness ?? 0.85,
      emissive: emissiveColor,
      emissiveIntensity: (params.emissiveStrength ?? 0.1) * 0.3,
      flatShading: false,
      side: THREE.FrontSide,
    });

    // ------- mesh -------
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.position.y = Y_OFFSET;
    this.mesh.receiveShadow = true;
    this.scene.add(this.mesh);
  }

  // -------------------------------------------------------------------------
  // Height sampling — consistent with the vertex displacement
  // -------------------------------------------------------------------------

  /**
   * Internal noise sampling that mirrors the vertex displacement logic.
   */
  private sampleHeight(x: number, z: number): number {
    const nx = x * this.freq;
    const nz = z * this.freq;

    // Primary shape via fBm
    let h = fbm(nx, nz, this.erosionOctaves, 2.0, 0.5);

    if (this.params.terrainStyle === 'canyons') {
      // Canyon effect: sharp ridges with deep valleys
      h = Math.abs(h) * 1.5 - 0.5;
    } else if (this.params.terrainStyle === 'floating_islands') {
      // Floating islands: plateaus and gaps
      let h2 = ridge(nx * 0.8, nz * 0.8, Math.max(3, this.erosionOctaves - 1)) * 0.3;
      let total = h + h2;
      if (total < 0) return (total * 0.3 - 5) * this.heightScale; // drop below ground
      return (total + 3) * this.heightScale; // lift islands up
    } else if (this.params.terrainStyle === 'flatlands') {
      h *= 0.2; // much flatter
    } else {
      // Default mountains: Add ridge detail for mountainous feel (blended at 30%)
      h += ridge(nx * 0.8, nz * 0.8, Math.max(3, this.erosionOctaves - 1)) * 0.3;
    }

    return h * this.heightScale;
  }

  /**
   * Returns the terrain height at world position (x, z).
   * Accounts for the mesh's Y offset so callers get the true world-space Y.
   */
  public getHeightAt(x: number, z: number): number {
    return this.sampleHeight(x, z) + Y_OFFSET;
  }

  // -------------------------------------------------------------------------
  // Per-frame update — subtle bass breathing
  // -------------------------------------------------------------------------

  update(bass: number, _mid: number, _treble: number, time: number): void {
    const posAttr = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    const vertexCount = posAttr.count;

    // Very subtle breathing: amplitude proportional to bass
    const reactivity = this.params.bassReactivity ?? 0.5;
    const breathAmp = bass * reactivity * 0.4; // keep it gentle
    const breathPhase = time * 0.5;

    for (let i = 0; i < vertexCount; i++) {
      const baseY = this.originalY[i];
      // Breathing varies slightly across the surface for organic feel
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      const localPhase = (x + z) * 0.002;
      const pulse = Math.sin(breathPhase + localPhase) * breathAmp;
      posAttr.setY(i, baseY + pulse);
    }
    posAttr.needsUpdate = true;

    // Recompute normals for correct lighting after displacement
    this.geometry.computeVertexNormals();
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  dispose(): void {
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}
