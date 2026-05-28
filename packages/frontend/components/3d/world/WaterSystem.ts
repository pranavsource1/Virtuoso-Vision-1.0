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
  waterType?: string;
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

  update(bass: number, mid: number, treble: number, time: number): void {
    if (this.params.waterType === 'none') return;
    
    let waveAmplitude = 0.15 + mid * 0.35;
    let waveSpeed = this.params.waveSpeed ?? 1.0;
    
    if (this.params.waterType === 'stormy_ocean') {
      waveAmplitude = 1.0 + bass * 2.0;
      waveSpeed *= 1.5;
    } else if (this.params.waterType === 'lava') {
      waveAmplitude = 0.3 + bass * 0.5;
      waveSpeed *= 0.5;
    }
    
    this.waterMesh.position.y = this.baseWaterY + Math.sin(time * waveSpeed * 0.5) * waveAmplitude;

    // Fog opacity pulses slightly with bass
    this.fogMaterial.opacity = this.baseFogOpacity + bass * 0.04;

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
  }
}
