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
}

// ---------------------------------------------------------------------------
// Vertex shader for firefly orbs
// ---------------------------------------------------------------------------
const fireflyVertexShader = /* glsl */ `
  attribute vec3 velocity;
  attribute vec3 aColor;
  attribute float aAudioReactivity;

  uniform float uTime;
  uniform float uGlowIntensity;
  uniform float uBass;

  varying vec3 vColor;
  varying float vGlow;

  void main() {
    vColor = aColor;
    vGlow = uGlowIntensity;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

    // Size attenuation — particles shrink with distance
    float size = 3.0 + uGlowIntensity * 2.0 + (uBass * 10.0 * aAudioReactivity);
    gl_PointSize = size * (300.0 / -mvPosition.z);

    gl_Position = projectionMatrix * mvPosition;
  }
`;

// ---------------------------------------------------------------------------
// Fragment shader for firefly orbs — soft glowing circle
// ---------------------------------------------------------------------------
const fireflyFragmentShader = /* glsl */ `
  uniform float uGlowIntensity;

  varying vec3 vColor;
  varying float vGlow;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    float alpha = smoothstep(0.5, 0.0, d);

    // Outer glow halo
    float glow = exp(-d * 3.0) * 0.6 * vGlow;

    vec3 finalColor = vColor * (alpha + glow);
    float finalAlpha = alpha * 0.85 + glow * 0.4;

    gl_FragColor = vec4(finalColor * uGlowIntensity, finalAlpha);
  }
`;

// ---------------------------------------------------------------------------
// ParticleSystem — atmospheric fireflies + dust motes
// ---------------------------------------------------------------------------
export class ParticleSystem {
  private scene: THREE.Scene;
  private params: SP;

  // Fireflies
  private fireflyGeometry: THREE.BufferGeometry;
  private fireflyMaterial: THREE.ShaderMaterial;
  private fireflyPoints: THREE.Points;
  private fireflyCount = 200;
  private fireflyPositions: Float32Array;
  private fireflyVelocities: Float32Array;
  private fireflyColors: Float32Array;
  private fireflyAudioReactivity: Float32Array;

  // Dust motes
  private dustGeometry: THREE.BufferGeometry;
  private dustMaterial: THREE.PointsMaterial;
  private dustPoints: THREE.Points;
  private dustCount = 400;
  private dustPositions: Float32Array;
  private dustVelocities: Float32Array;

  constructor(
    scene: THREE.Scene,
    colors: Record<string, THREE.Color>,
    params: SP,
  ) {
    this.scene = scene;
    this.params = params;

    // -----------------------------------------------------------------------
    // Fireflies / Orbs
    // -----------------------------------------------------------------------
    this.fireflyCount = Math.round(400 * (params.particleDensity ?? 1));
    this.fireflyPositions = new Float32Array(this.fireflyCount * 3);
    this.fireflyVelocities = new Float32Array(this.fireflyCount * 3);
    this.fireflyColors = new Float32Array(this.fireflyCount * 3);
    this.fireflyAudioReactivity = new Float32Array(this.fireflyCount);

    const colorPalette = [colors.c1, colors.c2, colors.c3, colors.c4, colors.c5];
    const spread = params.particleSpread ?? 1;

    for (let i = 0; i < this.fireflyCount; i++) {
      const i3 = i * 3;
      // Random positions within a box
      this.fireflyPositions[i3]     = (Math.random() - 0.5) * 300 * spread;
      this.fireflyPositions[i3 + 1] = Math.random() * 60;
      this.fireflyPositions[i3 + 2] = (Math.random() - 0.5) * 300 * spread;

      // Random drift velocities
      this.fireflyVelocities[i3]     = (Math.random() - 0.5) * 0.3;
      this.fireflyVelocities[i3 + 1] = (Math.random() - 0.5) * 0.15;
      this.fireflyVelocities[i3 + 2] = (Math.random() - 0.5) * 0.3;

      // Sample color from palette
      const c = colorPalette[i % colorPalette.length];
      this.fireflyColors[i3]     = c.r;
      this.fireflyColors[i3 + 1] = c.g;
      this.fireflyColors[i3 + 2] = c.b;

      // Only ~30% of fireflies are audio-reactive
      this.fireflyAudioReactivity[i] = Math.random() > 0.7 ? 1.0 : 0.0;
    }

    this.fireflyGeometry = new THREE.BufferGeometry();
    this.fireflyGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.fireflyPositions, 3),
    );
    this.fireflyGeometry.setAttribute(
      'velocity',
      new THREE.BufferAttribute(this.fireflyVelocities, 3),
    );
    this.fireflyGeometry.setAttribute(
      'aColor',
      new THREE.BufferAttribute(this.fireflyColors, 3),
    );
    this.fireflyGeometry.setAttribute(
      'aAudioReactivity',
      new THREE.BufferAttribute(this.fireflyAudioReactivity, 1),
    );

    this.fireflyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0.0 },
        uGlowIntensity: { value: params.glowIntensity ?? 1.0 },
        uBass: { value: 0.0 },
      },
      vertexShader: fireflyVertexShader,
      fragmentShader: fireflyFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.fireflyPoints = new THREE.Points(this.fireflyGeometry, this.fireflyMaterial);
    this.scene.add(this.fireflyPoints);

    // -----------------------------------------------------------------------
    // Dust motes
    // -----------------------------------------------------------------------
    this.dustCount = Math.round(2000 * (params.particleDensity ?? 1));
    this.dustPositions = new Float32Array(this.dustCount * 3);
    this.dustVelocities = new Float32Array(this.dustCount * 3);

    for (let i = 0; i < this.dustCount; i++) {
      const i3 = i * 3;
      this.dustPositions[i3]     = (Math.random() - 0.5) * 300 * spread;
      this.dustPositions[i3 + 1] = Math.random() * 80;
      this.dustPositions[i3 + 2] = (Math.random() - 0.5) * 300 * spread;

      this.dustVelocities[i3]     = (Math.random() - 0.5) * 0.05;
      this.dustVelocities[i3 + 1] = 0.02 + Math.random() * 0.04; // slow upward drift
      this.dustVelocities[i3 + 2] = (Math.random() - 0.5) * 0.05;
    }

    this.dustGeometry = new THREE.BufferGeometry();
    this.dustGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.dustPositions, 3),
    );

    this.dustMaterial = new THREE.PointsMaterial({
      color: 0xdddddd,
      size: (params.particleSize ?? 1) * 0.3,
      transparent: true,
      opacity: 0.3,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.dustPoints = new THREE.Points(this.dustGeometry, this.dustMaterial);
    this.scene.add(this.dustPoints);
  }

  // -------------------------------------------------------------------------
  // update — called every frame
  // -------------------------------------------------------------------------
  update(bass: number, mid: number, treble: number, time: number): void {
    const spread = this.params.particleSpread ?? 1;
    const halfBox = 150 * spread;

    // --- Fireflies ---
    this.fireflyMaterial.uniforms.uGlowIntensity.value = 0.5 + bass * 1.5;
    this.fireflyMaterial.uniforms.uBass.value = bass;
    this.fireflyMaterial.uniforms.uTime.value = time;

    const positions = this.fireflyPositions;
    const velocities = this.fireflyVelocities;
    const reactivities = this.fireflyAudioReactivity;

    for (let i = 0; i < this.fireflyCount; i++) {
      const i3 = i * 3;
      const reactivity = reactivities[i];
      const pSpeed = 1.0 + (mid * 3.0 + bass * 2.0) * reactivity;

      // Drift with sin/cos patterns
      positions[i3]     += (velocities[i3] + Math.sin(time * 0.5 + i) * 0.05) * pSpeed;
      positions[i3 + 1] += (velocities[i3 + 1] + Math.cos(time * 0.3 + i * 0.7) * 0.03) * pSpeed;
      positions[i3 + 2] += (velocities[i3 + 2] + Math.cos(time * 0.4 + i * 1.3) * 0.05) * pSpeed;

      // Wrap around boundaries
      if (positions[i3] > halfBox) positions[i3] = -halfBox;
      if (positions[i3] < -halfBox) positions[i3] = halfBox;
      if (positions[i3 + 1] > 60) positions[i3 + 1] = 0;
      if (positions[i3 + 1] < 0) positions[i3 + 1] = 60;
      if (positions[i3 + 2] > halfBox) positions[i3 + 2] = -halfBox;
      if (positions[i3 + 2] < -halfBox) positions[i3 + 2] = halfBox;
    }

    this.fireflyGeometry.attributes.position.needsUpdate = true;

    // --- Dust motes ---
    // Dust is now just ambient background, no audio reactivity
    this.dustMaterial.opacity = 0.3;
    this.dustMaterial.size = (this.params.particleSize ?? 1) * 0.3;

    const dustPos = this.dustPositions;
    const dustVel = this.dustVelocities;

    for (let i = 0; i < this.dustCount; i++) {
      const i3 = i * 3;

      dustPos[i3]     += dustVel[i3];
      dustPos[i3 + 1] += dustVel[i3 + 1];
      dustPos[i3 + 2] += dustVel[i3 + 2];

      // Wrap boundaries
      if (dustPos[i3] > halfBox) dustPos[i3] = -halfBox;
      if (dustPos[i3] < -halfBox) dustPos[i3] = halfBox;
      if (dustPos[i3 + 1] > 80) dustPos[i3 + 1] = 0;
      if (dustPos[i3 + 1] < 0) dustPos[i3 + 1] = 80;
      if (dustPos[i3 + 2] > halfBox) dustPos[i3 + 2] = -halfBox;
      if (dustPos[i3 + 2] < -halfBox) dustPos[i3 + 2] = halfBox;
    }

    this.dustGeometry.attributes.position.needsUpdate = true;
  }

  // -------------------------------------------------------------------------
  // dispose — clean up GPU resources
  // -------------------------------------------------------------------------
  dispose(): void {
    this.scene.remove(this.fireflyPoints);
    this.fireflyGeometry.dispose();
    this.fireflyMaterial.dispose();

    this.scene.remove(this.dustPoints);
    this.dustGeometry.dispose();
    this.dustMaterial.dispose();
  }
}
