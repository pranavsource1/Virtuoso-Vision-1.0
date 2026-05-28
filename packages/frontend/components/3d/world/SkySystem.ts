import * as THREE from 'three';

interface SP {
  colors?: { c1: string; c2: string; c3: string; c4: string; c5: string };
  geometryComplexity?: number; geometryDistortion?: number; geometrySharpness?: number;
  geometryScale?: number; symmetry?: number;
  terrainHeight?: number; terrainFrequency?: number; terrainErosion?: number;
  particleDensity?: number; particleSize?: number; particleGravity?: number;
  particleTurbulence?: number; particleSpread?: number;
  fogDensity?: number; glowIntensity?: number; noiseScale?: number;
  rotationSpeed?: number; pulseIntensity?: number; waveSpeed?: number;
  metalness?: number; roughness?: number; emissiveStrength?: number; transparency?: number;
  cameraDistance?: number; cameraHeight?: number;
  bassReactivity?: number; trebleReactivity?: number;
  skyAtmosphere?: string;
}

// ---------------------------------------------------------------------------
// Vertex shader — pass world-space position to fragment
// ---------------------------------------------------------------------------
const skyVertexShader = /* glsl */ `
  varying vec3 vWorldPosition;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// ---------------------------------------------------------------------------
// Fragment shader — gradient sky, stars, FBM clouds, horizon glow
// ---------------------------------------------------------------------------
const skyFragmentShader = /* glsl */ `
  uniform vec3 uTopColor;
  uniform vec3 uBottomColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uStarColor;
  uniform float uTime;
  uniform float uBass;

  varying vec3 vWorldPosition;

  // ---- Hash function for pseudo-random stars ----
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  // ---- Simple 2D noise for FBM ----
  float noise2D(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f); // smoothstep

    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  // ---- Fractal Brownian Motion ----
  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;

    for (int i = 0; i < 5; i++) {
      value += amplitude * noise2D(p * frequency);
      frequency *= 2.0;
      amplitude *= 0.5;
    }

    return value;
  }

  void main() {
    // Normalized height in [-1, 1] range
    float height = normalize(vWorldPosition).y;

    // ------------------------------------------------------------------
    // 1. Sky gradient: bottom → horizon → top
    // ------------------------------------------------------------------
    vec3 skyColor;
    if (height < 0.0) {
      // Below horizon — blend bottom to horizon
      float t = smoothstep(-0.5, 0.0, height);
      skyColor = mix(uBottomColor, uHorizonColor, t);
    } else {
      // Above horizon — blend horizon to top
      float t = smoothstep(0.0, 0.7, height);
      skyColor = mix(uHorizonColor, uTopColor, t);
    }

    // ------------------------------------------------------------------
    // 2. Stars — sparse bright dots in upper hemisphere
    // ------------------------------------------------------------------
    if (height > 0.05) {
      vec2 starUV = floor(vWorldPosition.xz * 0.8);
      float starHash = hash(starUV);

      if (starHash > 0.985) {
        // Twinkle — bass makes twinkle more intense
        float twinkle = sin(uTime * 2.0 + starHash * 100.0) * 0.5 + 0.5;
        twinkle = mix(twinkle, 1.0, uBass * 0.5);

        float starBrightness = twinkle * smoothstep(0.05, 0.3, height);
        skyColor += uStarColor * starBrightness * 0.8;
      }
    }

    // ------------------------------------------------------------------
    // 3. Clouds — FBM noise on xz plane
    // ------------------------------------------------------------------
    vec2 cloudUV = vWorldPosition.xz * 0.003 + uTime * 0.01;
    float cloudNoise = fbm(cloudUV);
    float cloudMask = smoothstep(0.45, 0.65, cloudNoise);

    // Clouds only in upper portion, fade near horizon
    float cloudHeightMask = smoothstep(0.05, 0.25, height) * smoothstep(0.9, 0.5, height);
    cloudMask *= cloudHeightMask * 0.25;

    vec3 cloudColor = mix(uHorizonColor, vec3(1.0), 0.3);
    skyColor = mix(skyColor, cloudColor, cloudMask);

    // ------------------------------------------------------------------
    // 4. Horizon glow — bright band near y = 0
    // ------------------------------------------------------------------
    float horizonGlow = exp(-abs(height) * 8.0);
    float glowStrength = 0.35 + uBass * 0.4; // bass makes glow brighter
    skyColor += uHorizonColor * horizonGlow * glowStrength;

    gl_FragColor = vec4(skyColor, 1.0);
  }
`;

// ---------------------------------------------------------------------------
// SkySystem — dynamic gradient sky dome
// ---------------------------------------------------------------------------
export class SkySystem {
  private scene: THREE.Scene;
  private mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private geometry: THREE.SphereGeometry;

  constructor(
    scene: THREE.Scene,
    colors: Record<string, THREE.Color>,
    params: SP,
  ) {
    this.scene = scene;

    // Derive sky palette from scene colors
    let topColor = colors.c2.clone().multiplyScalar(0.3);
    let bottomColor = new THREE.Color(0x020205).lerp(colors.c4.clone(), 0.08);
    let horizonColor = colors.c3.clone().multiplyScalar(0.4);
    let starColor = colors.c5.clone();

    if (params.skyAtmosphere === 'sunset') {
      topColor = new THREE.Color(0x2a1a4a);
      bottomColor = new THREE.Color(0x8a2a00);
      horizonColor = new THREE.Color(0xff6a00);
    } else if (params.skyAtmosphere === 'dark_abyss') {
      topColor = new THREE.Color(0x000000);
      bottomColor = new THREE.Color(0x000000);
      horizonColor = new THREE.Color(0x050505);
      starColor = new THREE.Color(0x222222);
    } else if (params.skyAtmosphere === 'aurora') {
      topColor = new THREE.Color(0x0a1a2a);
      bottomColor = new THREE.Color(0x003311);
      horizonColor = new THREE.Color(0x00ff88);
    }

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTopColor: { value: new THREE.Vector3(topColor.r, topColor.g, topColor.b) },
        uBottomColor: { value: new THREE.Vector3(bottomColor.r, bottomColor.g, bottomColor.b) },
        uHorizonColor: { value: new THREE.Vector3(horizonColor.r, horizonColor.g, horizonColor.b) },
        uStarColor: { value: new THREE.Vector3(starColor.r, starColor.g, starColor.b) },
        uTime: { value: 0.0 },
        uBass: { value: 0.0 },
      },
      vertexShader: skyVertexShader,
      fragmentShader: skyFragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
    });

    this.geometry = new THREE.SphereGeometry(800, 32, 32);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.scene.add(this.mesh);
  }

  // -------------------------------------------------------------------------
  // update — called every frame
  // -------------------------------------------------------------------------
  update(bass: number, _mid: number, _treble: number, time: number): void {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uBass.value = bass;
  }

  // -------------------------------------------------------------------------
  // dispose — clean up GPU resources
  // -------------------------------------------------------------------------
  dispose(): void {
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}
