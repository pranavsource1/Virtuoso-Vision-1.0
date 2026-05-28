import * as THREE from 'three';

interface SP {
  colors?: { c1: string; c2: string; c3: string; c4: string; c5: string };
  geometryComplexity?: number;
  geometryDistortion?: number;
  geometrySharpness?: number;
  geometryScale?: number;
  symmetry?: number;
  terrainHeight?: number;
  terrainFrequency?: number;
  terrainErosion?: number;
  particleDensity?: number;
  particleSize?: number;
  particleGravity?: number;
  particleTurbulence?: number;
  particleSpread?: number;
  fogDensity?: number;
  glowIntensity?: number;
  noiseScale?: number;
  rotationSpeed?: number;
  pulseIntensity?: number;
  waveSpeed?: number;
  metalness?: number;
  roughness?: number;
  emissiveStrength?: number;
  transparency?: number;
  cameraDistance?: number;
  cameraHeight?: number;
  bassReactivity?: number;
  trebleReactivity?: number;
}

export class LightingSystem {
  private scene: THREE.Scene;
  private colors: Record<string, THREE.Color>;
  private params: SP;

  private hemisphereLight: THREE.HemisphereLight;
  private directionalLight: THREE.DirectionalLight;
  private ambientLight: THREE.AmbientLight;
  private rimLight: THREE.DirectionalLight;

  // Store original colors for interpolation
  private originalSkyColor: THREE.Color;
  private originalDirectionalIntensity: number;
  private trebleShiftColor: THREE.Color;

  constructor(
    scene: THREE.Scene,
    colors: Record<string, THREE.Color>,
    params: SP
  ) {
    this.scene = scene;
    this.colors = colors;
    this.params = params;

    // --- Hemisphere light ---
    const skyColor = colors.c2.clone().lerp(new THREE.Color(0xffffff), 0.3); // Lightened
    const groundColor = colors.c4.clone().lerp(new THREE.Color(0x000000), 0.4); // Darkened
    this.originalSkyColor = skyColor.clone();

    this.hemisphereLight = new THREE.HemisphereLight(skyColor, groundColor, 0.8);
    this.scene.add(this.hemisphereLight);

    // Treble shift target — a brighter/different hue for sky color modulation
    this.trebleShiftColor = colors.c5.clone().lerp(new THREE.Color(0xffffff), 0.5);

    // --- Main directional light ---
    this.directionalLight = new THREE.DirectionalLight(0xfff4e6, 0.5);
    this.directionalLight.position.set(50, 80, -50);
    this.directionalLight.castShadow = true;
    this.directionalLight.shadow.mapSize.width = 2048;
    this.directionalLight.shadow.mapSize.height = 2048;
    this.directionalLight.shadow.camera.left = -150;
    this.directionalLight.shadow.camera.right = 150;
    this.directionalLight.shadow.camera.top = 150;
    this.directionalLight.shadow.camera.bottom = -150;
    this.directionalLight.shadow.camera.near = 0.5;
    this.directionalLight.shadow.camera.far = 300;
    this.originalDirectionalIntensity = 0.5;
    this.scene.add(this.directionalLight);

    // --- Ambient light ---
    const ambientColor = colors.c1.clone();
    this.ambientLight = new THREE.AmbientLight(ambientColor, 0.15);
    this.scene.add(this.ambientLight);

    // --- Rim light (back-lighting from opposite side) ---
    const rimColor = colors.c5.clone();
    this.rimLight = new THREE.DirectionalLight(rimColor, 0.3);
    this.rimLight.position.set(-50, 40, 50);
    this.scene.add(this.rimLight);

    // --- Fog ---
    const fogDensityParam = params.fogDensity ?? 0.3;
    const fogDensity = fogDensityParam * 0.008;
    // Blend c4 darkened significantly toward near-black
    const fogColor = colors.c4.clone().lerp(new THREE.Color(0x050508), 0.75);
    this.scene.fog = new THREE.FogExp2(fogColor, fogDensity);
  }

  update(bass: number, mid: number, treble: number, time: number): void {
    // Directional light intensity pulses gently with bass
    this.directionalLight.intensity = 0.4 + bass * 0.3;

    // Hemisphere light sky color shifts slightly with treble
    const skyLerp = THREE.MathUtils.clamp(treble * 0.3, 0, 1);
    this.hemisphereLight.color.copy(this.originalSkyColor).lerp(this.trebleShiftColor, skyLerp);
  }

  dispose(): void {
    this.scene.remove(this.hemisphereLight);
    this.scene.remove(this.directionalLight);
    this.scene.remove(this.ambientLight);
    this.scene.remove(this.rimLight);

    // Clear fog
    this.scene.fog = null;
  }
}
