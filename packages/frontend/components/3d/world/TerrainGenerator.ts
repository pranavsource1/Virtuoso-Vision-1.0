// =============================================================================
// TerrainGenerator.ts — Noise-driven terrain with vertex coloring & bass pulse
// =============================================================================
// Creates a 400×400 subdivided plane with height displaced by fractal noise.
// Vertex colors blend from scene palette based on elevation. Exports a
// `getHeightAt(x, z)` helper so other systems can query terrain height at any
// world coordinate.
//
// Bass breathing is performed entirely on the GPU via onBeforeCompile vertex
// shader injection — no per-frame CPU vertex loop.
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
  pulseIntensity?: number;
  waveSpeed?: number;
  cloudDensity?: number;
  colors?: { c1?: string; c2?: string; c3?: string; c4?: string; c5?: string };
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
  private params: TerrainParams;
  private colors: Record<string, THREE.Color>;

  // GPU uniforms for bass breathing and cloud shadows
  private breathUniforms: {
    uBreathAmp: { value: number };
    uBreathPhase: { value: number };
    uTime: { value: number };
    uBass: { value: number };
    uCloudDensity: { value: number };
  };

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
      const h = posAttr.getY(i);
      if (h < minH) minH = h;
      if (h > maxH) maxH = h;
    }
    const range = maxH - minH || 1;

    for (let i = 0; i < vertexCount; i++) {
      const h = posAttr.getY(i);
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

    // ------- GPU breathing and shadow uniforms -------
    this.breathUniforms = {
      uBreathAmp: { value: 0.0 },
      uBreathPhase: { value: 0.0 },
      uTime: { value: 0.0 },
      uBass: { value: 0.0 },
      uCloudDensity: { value: params.cloudDensity ?? 0.5 },
    };

    // ------- material (with onBeforeCompile for GPU breathing) -------
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

    // Inject bass breathing into the vertex shader via onBeforeCompile
    const uniforms = this.breathUniforms;
    this.material.onBeforeCompile = (shader) => {
      // Add our custom uniforms
      shader.uniforms.uBreathAmp = uniforms.uBreathAmp;
      shader.uniforms.uBreathPhase = uniforms.uBreathPhase;
      shader.uniforms.uTime = uniforms.uTime;
      shader.uniforms.uBass = uniforms.uBass;
      shader.uniforms.uCloudDensity = uniforms.uCloudDensity;

      // Inject uniform declarations at the top of the vertex shader
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        uniform float uBreathAmp;
        uniform float uBreathPhase;
        varying vec2 vWorldPositionXZ;
        `
      );

      // Inject displacement after the vertex position is computed
      // We displace along the normal direction for organic breathing
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        // Bass breathing: sinusoidal displacement along normal
        // Phase varies spatially for organic wave propagation
        float localPhase = (position.x + position.z) * 0.002;
        float breathe = sin(uBreathPhase + localPhase) * uBreathAmp;
        transformed += normal * breathe;
        
        vWorldPositionXZ = (modelMatrix * vec4(position, 1.0)).xz;
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        uniform float uTime;
        uniform float uBass;
        uniform float uCloudDensity;
        varying vec2 vWorldPositionXZ;

        float hash_t(vec2 p) {
          p = fract(p * vec2(234.34, 435.345));
          p += dot(p, p + 34.23);
          return fract(p.x * p.y);
        }

        float noise_t(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          float a = hash_t(i);
          float b = hash_t(i + vec2(1.0, 0.0));
          float c = hash_t(i + vec2(0.0, 1.0));
          float d = hash_t(i + vec2(1.0, 1.0));
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
        }

        float fbm_t(vec2 p) {
          float value = 0.0;
          float amplitude = 0.5;
          float frequency = 1.0;
          for (int i = 0; i < 5; i++) {
            value += amplitude * noise_t(p * frequency);
            frequency *= 2.0;
            amplitude *= 0.5;
          }
          return value;
        }
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        /* glsl */ `
        #include <color_fragment>
        vec2 cloudUV = vWorldPositionXZ * 0.003 + uTime * (0.01 + uBass * 0.02);
        float cloudNoise = fbm_t(cloudUV);
        float cloudShadow = smoothstep(1.0 - uCloudDensity, 1.2 - uCloudDensity, cloudNoise);
        float shadowStrength = (0.2 + uCloudDensity * 0.3) * cloudShadow;
        diffuseColor.rgb *= 1.0 - (shadowStrength * 0.7); // Darken by up to 70% under clouds
        `
      );
    };

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
  // Per-frame update — GPU-driven bass breathing via uniforms
  // -------------------------------------------------------------------------

  update(bass: number, _mid: number, _treble: number, time: number, params?: TerrainParams): void {
    const liveParams = params ?? this.params;

    // Compute breathing amplitude and phase — just two uniform updates!
    const bassReact = liveParams.bassReactivity ?? this.params.bassReactivity ?? 0.5;
    const pulseIntensity = liveParams.pulseIntensity ?? this.params.pulseIntensity ?? 0.3;
    
    // Breathing amplitude based on bass
    const targetAmp = bass * bassReact * 0.5 * pulseIntensity;
    this.breathUniforms.uBreathAmp.value += (targetAmp - this.breathUniforms.uBreathAmp.value) * 0.1;
    this.breathUniforms.uBreathPhase.value += 0.05 + bass * bassReact * 0.1;

    this.breathUniforms.uTime.value = time;
    this.breathUniforms.uBass.value = bass;
    if (liveParams.cloudDensity !== undefined) {
      this.breathUniforms.uCloudDensity.value = liveParams.cloudDensity;
    }

    // Update material properties
    this.material.metalness = liveParams.metalness ?? this.params.metalness ?? 0.1;
    this.material.roughness = liveParams.roughness ?? this.params.roughness ?? 0.85;
    this.material.emissiveIntensity =
      (liveParams.emissiveStrength ?? this.params.emissiveStrength ?? 0.1) * 0.3;
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
