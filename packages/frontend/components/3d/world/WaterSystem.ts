import * as THREE from 'three';

interface SP {
  colors?: { c1?: string; c2?: string; c3?: string; c4?: string; c5?: string };
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
  waterType?: string;
}

/**
 * Generate a procedural water normal map texture on a canvas.
 * Creates a tileable ripple/wave pattern without needing external assets.
 */
function generateWaterNormalMap(size: number = 512): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      // Multiple overlapping sine waves at different frequencies and angles
      // for a natural, organic water surface
      const u = x / size;
      const v = y / size;

      // Layer 1: broad ripples
      const w1 = Math.sin(u * Math.PI * 8 + v * Math.PI * 4) * 0.3;
      // Layer 2: medium detail
      const w2 = Math.sin(u * Math.PI * 16 - v * Math.PI * 12) * 0.2;
      // Layer 3: fine detail at an angle
      const w3 = Math.sin((u + v) * Math.PI * 24) * 0.15;
      // Layer 4: cross-hatch
      const w4 = Math.sin((u - v * 1.5) * Math.PI * 20) * 0.1;
      // Layer 5: very fine noise-like ripples
      const w5 = Math.sin(u * Math.PI * 40 + v * Math.PI * 30) * 0.08;

      // Combine waves for height
      const height = w1 + w2 + w3 + w4 + w5;

      // Compute finite-difference normal from height
      // Approximate dx and dy gradients
      const eps = 1.0 / size;
      const u2 = (x + 1) / size;
      const v2 = (y + 1) / size;

      const hRight = Math.sin(u2 * Math.PI * 8 + v * Math.PI * 4) * 0.3
        + Math.sin(u2 * Math.PI * 16 - v * Math.PI * 12) * 0.2
        + Math.sin((u2 + v) * Math.PI * 24) * 0.15
        + Math.sin((u2 - v * 1.5) * Math.PI * 20) * 0.1
        + Math.sin(u2 * Math.PI * 40 + v * Math.PI * 30) * 0.08;

      const hDown = Math.sin(u * Math.PI * 8 + v2 * Math.PI * 4) * 0.3
        + Math.sin(u * Math.PI * 16 - v2 * Math.PI * 12) * 0.2
        + Math.sin((u + v2) * Math.PI * 24) * 0.15
        + Math.sin((u - v2 * 1.5) * Math.PI * 20) * 0.1
        + Math.sin(u * Math.PI * 40 + v2 * Math.PI * 30) * 0.08;

      const dx = (hRight - height) / eps;
      const dy = (hDown - height) / eps;

      // Normal from height gradient: N = normalize(-dx, 1, -dy)
      // Then encode into [0, 255] range (tangent-space normal map)
      const len = Math.sqrt(dx * dx + 1 + dy * dy);
      const nx = (-dx / len) * 0.5 + 0.5;
      const ny = (1.0 / len) * 0.5 + 0.5;
      const nz = (-dy / len) * 0.5 + 0.5;

      data[idx] = Math.floor(nx * 255);
      data[idx + 1] = Math.floor(ny * 255);
      data[idx + 2] = Math.floor(nz * 255);
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;

  return texture;
}

export class WaterSystem {
  private scene: THREE.Scene;
  private colors: Record<string, THREE.Color>;
  private params: SP;

  private waterMesh: THREE.Mesh;
  private waterMaterial: THREE.MeshPhysicalMaterial;
  private waterGeometry: THREE.PlaneGeometry;

  private fogMesh: THREE.Mesh;
  private fogMaterial: THREE.MeshBasicMaterial;
  private fogGeometry: THREE.PlaneGeometry;

  private normalMap: THREE.CanvasTexture | null = null;

  private baseWaterY: number = -13;
  private baseFogOpacity: number = 0.08;

  constructor(
    scene: THREE.Scene,
    colors: Record<string, THREE.Color>,
    params: SP
  ) {
    this.scene = scene;
    this.colors = colors;
    this.params = params;

    // --- Generate procedural normal map ---
    this.normalMap = generateWaterNormalMap(512);

    // --- Water surface ---
    this.waterGeometry = new THREE.PlaneGeometry(400, 400, 1, 1);

    // Blend scene color c1 with dark blue for a natural water tint
    const waterColor = colors.c1.clone().lerp(new THREE.Color(0x0a1628), 0.65);

    let matConfig: THREE.MeshPhysicalMaterialParameters = {};
    if (this.params.waterType === 'lava') {
      matConfig = {
        color: new THREE.Color(0xff2200),
        metalness: 0.3,
        roughness: 0.6,
        transparent: true,
        opacity: 0.9,
        emissive: new THREE.Color(0xff4400),
        emissiveIntensity: 1.5,
        side: THREE.DoubleSide,
        normalMap: this.normalMap,
        normalScale: new THREE.Vector2(0.8, 0.8),
      };
    } else if (this.params.waterType === 'stormy_ocean') {
      matConfig = {
        color: new THREE.Color(0x1a3a4a),
        metalness: 0.6,
        roughness: 0.4,
        transmission: 0.1,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        normalMap: this.normalMap,
        normalScale: new THREE.Vector2(1.2, 1.2),
      };
    } else if (this.params.waterType === 'digital_grid') {
      matConfig = {
        color: new THREE.Color(0x00ffcc),
        metalness: 1.0,
        roughness: 0.0,
        transparent: true,
        opacity: 0.4,
        wireframe: true,
        emissive: new THREE.Color(0x00ffcc),
        emissiveIntensity: 0.8,
        side: THREE.DoubleSide,
        // No normal map for wireframe/digital mode
      };
    } else if (this.params.waterType === 'none') {
      matConfig = { visible: false };
    } else {
      matConfig = {
        color: waterColor,
        metalness: 0.9,
        roughness: 0.1,
        transmission: 0.4,
        transparent: true,
        opacity: 0.85,
        envMapIntensity: 1.0,
        side: THREE.DoubleSide,
        normalMap: this.normalMap,
        normalScale: new THREE.Vector2(0.6, 0.6),
      };
    }

    this.waterMaterial = new THREE.MeshPhysicalMaterial(matConfig);

    this.waterMesh = new THREE.Mesh(this.waterGeometry, this.waterMaterial);
    this.waterMesh.rotation.x = -Math.PI / 2; // Rotate to horizontal
    this.waterMesh.position.y = this.baseWaterY;
    this.waterMesh.receiveShadow = true;
    if (this.params.waterType !== 'none') {
      this.scene.add(this.waterMesh);
    }

    // --- Fog layer just above the water ---
    this.fogGeometry = new THREE.PlaneGeometry(400, 400, 1, 1);

    const fogColor = colors.c3 ? colors.c3.clone() : new THREE.Color(0xffffff);

    this.fogMaterial = new THREE.MeshBasicMaterial({
      color: fogColor,
      transparent: true,
      opacity: this.baseFogOpacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.fogMesh = new THREE.Mesh(this.fogGeometry, this.fogMaterial);
    this.fogMesh.rotation.x = -Math.PI / 2; // Horizontal
    this.fogMesh.position.y = -12;
    if (this.params.waterType !== 'none') {
      this.scene.add(this.fogMesh);
    }
  }

  update(bass: number, mid: number, treble: number, time: number, params?: SP): void {
    if (this.params.waterType === 'none') return;
    const liveParams = params ?? this.params;
    const bassReact = liveParams.bassReactivity ?? this.params.bassReactivity ?? 0.6;
    const trebleReact = liveParams.trebleReactivity ?? this.params.trebleReactivity ?? 0.4;
    const glowIntensity = liveParams.glowIntensity ?? this.params.glowIntensity ?? 0.5;
    const transparency = liveParams.transparency ?? this.params.transparency ?? 0.1;
    
    let waveAmplitude = 0.15 + mid * 0.35 + bass * bassReact * 0.3;
    let waveSpeed = liveParams.waveSpeed ?? this.params.waveSpeed ?? 1.0;
    
    if (this.params.waterType === 'stormy_ocean') {
      waveAmplitude = 1.0 + bass * bassReact * 2.2;
      waveSpeed *= 1.5;
    } else if (this.params.waterType === 'lava') {
      waveAmplitude = 0.3 + bass * bassReact * 0.6;
      waveSpeed *= 0.5;
    }
    
    this.waterMesh.position.y = this.baseWaterY + Math.sin(time * waveSpeed * 0.5) * waveAmplitude;

    // --- Scroll the normal map for animated ripples ---
    if (this.normalMap && this.params.waterType !== 'digital_grid') {
      // Two-axis scroll for natural look, bass affects speed
      const scrollSpeed = waveSpeed * 0.015 * (1.0 + bass * bassReact * 0.5);
      this.normalMap.offset.x += scrollSpeed * 0.7;
      this.normalMap.offset.y += scrollSpeed * 0.3;

      // Subtle normal intensity modulation with mid frequencies
      if (this.waterMaterial.normalScale) {
        const baseScale = this.params.waterType === 'stormy_ocean' ? 1.2
          : this.params.waterType === 'lava' ? 0.8 : 0.6;
        const dynamicScale = baseScale + mid * 0.3 + bass * bassReact * 0.2;
        this.waterMaterial.normalScale.set(dynamicScale, dynamicScale);
      }
    }

    // Fog opacity pulses slightly with bass
    this.fogMaterial.opacity = this.baseFogOpacity + bass * bassReact * 0.04 + treble * trebleReact * 0.02;
    this.waterMaterial.opacity = THREE.MathUtils.clamp(0.9 - transparency * 0.45, 0.25, 1);
    this.waterMaterial.emissiveIntensity = glowIntensity * (0.2 + bass * bassReact * 0.8);

    // Keep fog layer just above water
    this.fogMesh.position.y = this.waterMesh.position.y + 1.0;
  }

  dispose(): void {
    this.scene.remove(this.waterMesh);
    this.scene.remove(this.fogMesh);

    this.waterGeometry.dispose();
    this.waterMaterial.dispose();
    this.fogGeometry.dispose();
    this.fogMaterial.dispose();
    if (this.normalMap) this.normalMap.dispose();
  }
}
