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
  structureType?: string;
}

export class StructureGenerator {
  private scene: THREE.Scene;
  private colors: Record<string, THREE.Color>;
  private params: SP;
  private getHeightAt: (x: number, z: number) => number;

  private groups: THREE.Group[] = [];
  private emissiveMaterials: THREE.MeshStandardMaterial[] = [];
  private pointLights: THREE.PointLight[] = [];
  private disposables: { geometry?: THREE.BufferGeometry; material?: THREE.Material }[] = [];

  constructor(
    scene: THREE.Scene,
    colors: Record<string, THREE.Color>,
    params: SP,
    getHeightAt: (x: number, z: number) => number
  ) {
    this.scene = scene;
    this.colors = colors;
    this.params = params;
    this.getHeightAt = getHeightAt;

    this.createStructures();
  }

  private createStructures(): void {
    const type = this.params.structureType || 'monoliths';

    if (type === 'none') return;

    if (type === 'ruins') {
      for (let i = 0; i < 15; i++) this.createRuins(i);
    } else if (type === 'neon_pillars') {
      for (let i = 0; i < 20; i++) this.createLanternPost(i);
    } else if (type === 'crystals') {
      for (let i = 0; i < 15; i++) this.createHouse(i); // We'll make houses look like crystals
    } else {
      // monoliths / default
      for (let i = 0; i < 8; i++) this.createTower(i);
      for (let i = 0; i < 8; i++) this.createHouse(i);
    }
  }

  /**
   * Find a valid placement position within a radius range, avoiding water (height < -10).
   */
  private findPlacement(minRadius: number, maxRadius: number, index: number, total: number): THREE.Vector3 | null {
    const angleStep = (Math.PI * 2) / total;
    const baseAngle = angleStep * index + (Math.random() - 0.5) * angleStep * 0.6;
    const radius = minRadius + Math.random() * (maxRadius - minRadius);

    const x = Math.cos(baseAngle) * radius;
    const z = Math.sin(baseAngle) * radius;
    const y = this.getHeightAt(x, z);

    if (y < -10) {
      // Try a few alternative positions before giving up
      for (let attempt = 0; attempt < 5; attempt++) {
        const altAngle = baseAngle + (Math.random() - 0.5) * 1.0;
        const altRadius = minRadius + Math.random() * (maxRadius - minRadius);
        const ax = Math.cos(altAngle) * altRadius;
        const az = Math.sin(altAngle) * altRadius;
        const ay = this.getHeightAt(ax, az);
        if (ay >= -10) {
          return new THREE.Vector3(ax, ay, az);
        }
      }
      return null;
    }

    return new THREE.Vector3(x, y, z);
  }

  private trackDisposable(geometry: THREE.BufferGeometry, material: THREE.Material): void {
    this.disposables.push({ geometry, material });
  }

  private createTower(index: number): void {
    const pos = this.findPlacement(50, 120, index, 5);
    if (!pos) return;

    const group = new THREE.Group();
    group.position.copy(pos);
    group.rotation.y = Math.random() * Math.PI * 2;

    const metalness = this.params.metalness ?? 0.3;
    const roughness = this.params.roughness ?? 0.6;

    // Tower body
    const bodyGeo = new THREE.CylinderGeometry(2, 2.5, 12, 8);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: this.colors.c1.clone().lerp(new THREE.Color(0x8b7355), 0.4),
      metalness,
      roughness,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 6;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    this.trackDisposable(bodyGeo, bodyMat);

    // Roof
    const roofGeo = new THREE.ConeGeometry(3, 4, 8);
    const roofMat = new THREE.MeshStandardMaterial({
      color: this.colors.c2.clone().lerp(new THREE.Color(0x6b3a2a), 0.5),
      metalness: metalness * 0.5,
      roughness: roughness * 1.2,
    });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = 14;
    roof.castShadow = true;
    group.add(roof);
    this.trackDisposable(roofGeo, roofMat);

    // Windows (2-3 per tower)
    const windowCount = 2 + Math.floor(Math.random() * 2);
    for (let w = 0; w < windowCount; w++) {
      const winGeo = new THREE.BoxGeometry(0.5, 0.7, 0.1);
      const winMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0xffd699),
        emissive: new THREE.Color(0xffaa33),
        emissiveIntensity: 0.8,
      });
      const win = new THREE.Mesh(winGeo, winMat);
      const winAngle = (w / windowCount) * Math.PI * 2;
      win.position.set(
        Math.cos(winAngle) * 2.05,
        4 + w * 3,
        Math.sin(winAngle) * 2.05
      );
      win.lookAt(
        Math.cos(winAngle) * 4 + group.position.x,
        win.position.y + group.position.y,
        Math.sin(winAngle) * 4 + group.position.z
      );
      // Reset lookAt to local
      win.lookAt(new THREE.Vector3(
        Math.cos(winAngle) * 4,
        win.position.y,
        Math.sin(winAngle) * 4
      ));
      group.add(win);
      this.trackDisposable(winGeo, winMat);
      this.emissiveMaterials.push(winMat);
    }

    // Point light for the tower
    const light = new THREE.PointLight(
      new THREE.Color(0xffcc77),
      1.5,
      30
    );
    light.position.y = 8;
    group.add(light);
    this.pointLights.push(light);

    this.scene.add(group);
    this.groups.push(group);
  }

  private createHouse(index: number): void {
    const pos = this.findPlacement(50, 120, index, 5);
    if (!pos) return;

    const group = new THREE.Group();
    group.position.copy(pos);
    group.rotation.y = Math.random() * Math.PI * 2;

    const metalness = this.params.metalness ?? 0.3;
    const roughness = this.params.roughness ?? 0.6;

    // House/Crystal base
    const baseGeo = new THREE.BoxGeometry(6, 4, 5);
    const isCrystal = this.params.structureType === 'crystals';
    const baseMat = new THREE.MeshStandardMaterial({
      color: isCrystal ? this.colors.c2 : this.colors.c3.clone().lerp(new THREE.Color(0xd4b896), 0.4),
      metalness: isCrystal ? 0.9 : metalness,
      roughness: isCrystal ? 0.1 : roughness,
      transparent: isCrystal,
      opacity: isCrystal ? 0.8 : 1.0,
      emissive: isCrystal ? this.colors.c2 : new THREE.Color(0x000000),
      emissiveIntensity: isCrystal ? 0.5 : 0.0,
    });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 2;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);
    this.trackDisposable(baseGeo, baseMat);

    // Pyramid roof (using ConeGeometry with 4 sides for a pyramid look)
    const roofGeo = new THREE.ConeGeometry(5, 3, 4);
    const roofMat = new THREE.MeshStandardMaterial({
      color: this.colors.c4.clone().lerp(new THREE.Color(0x8b4513), 0.5),
      metalness: metalness * 0.5,
      roughness: roughness * 1.3,
    });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = 5.5;
    roof.rotation.y = Math.PI / 4; // Align pyramid corners with box edges
    roof.castShadow = true;
    group.add(roof);
    this.trackDisposable(roofGeo, roofMat);

    // Door
    const doorGeo = new THREE.BoxGeometry(1.0, 2.0, 0.15);
    const doorMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x5c3a1e),
      emissive: new THREE.Color(0xffaa33),
      emissiveIntensity: 0.3,
    });
    const door = new THREE.Mesh(doorGeo, doorMat);
    door.position.set(0, 1, 2.55);
    group.add(door);
    this.trackDisposable(doorGeo, doorMat);
    this.emissiveMaterials.push(doorMat);

    // Windows (2 on front face)
    for (let w = 0; w < 2; w++) {
      const winGeo = new THREE.BoxGeometry(0.7, 0.7, 0.12);
      const winMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0xffd699),
        emissive: new THREE.Color(0xffcc55),
        emissiveIntensity: 0.8,
      });
      const win = new THREE.Mesh(winGeo, winMat);
      win.position.set(w === 0 ? -1.8 : 1.8, 2.8, 2.55);
      group.add(win);
      this.trackDisposable(winGeo, winMat);
      this.emissiveMaterials.push(winMat);
    }

    // Side window
    const sideWinGeo = new THREE.BoxGeometry(0.12, 0.7, 0.7);
    const sideWinMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xffd699),
      emissive: new THREE.Color(0xffcc55),
      emissiveIntensity: 0.8,
    });
    const sideWin = new THREE.Mesh(sideWinGeo, sideWinMat);
    sideWin.position.set(3.05, 2.8, 0);
    group.add(sideWin);
    this.trackDisposable(sideWinGeo, sideWinMat);
    this.emissiveMaterials.push(sideWinMat);

    this.scene.add(group);
    this.groups.push(group);
  }

  private createLanternPost(index: number): void {
    const pos = this.findPlacement(20, 100, index, 9);
    if (!pos) return;

    const group = new THREE.Group();
    group.position.copy(pos);

    const metalness = this.params.metalness ?? 0.3;
    const roughness = this.params.roughness ?? 0.6;

    // Post (Neon Pillar if requested)
    const isNeon = this.params.structureType === 'neon_pillars';
    const postGeo = new THREE.CylinderGeometry(isNeon ? 1.0 : 0.15, isNeon ? 1.0 : 0.15, isNeon ? 25 : 5, 6);
    const postMat = new THREE.MeshStandardMaterial({
      color: isNeon ? this.colors.c4 : new THREE.Color(0x3a3a3a),
      metalness: 0.7,
      roughness: 0.4,
      emissive: isNeon ? this.colors.c4 : new THREE.Color(0x000000),
      emissiveIntensity: isNeon ? 1.0 : 0.0,
    });
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.y = isNeon ? 12.5 : 2.5;
    post.castShadow = true;
    group.add(post);
    this.trackDisposable(postGeo, postMat);

    // Small decorative arm at top
    const armGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.2, 4);
    const armMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x3a3a3a),
      metalness: 0.7,
      roughness: 0.4,
    });
    const arm = new THREE.Mesh(armGeo, armMat);
    arm.position.set(0.5, 4.8, 0);
    arm.rotation.z = Math.PI / 2;
    group.add(arm);
    this.trackDisposable(armGeo, armMat);

    // Glowing orb
    const orbGeo = new THREE.SphereGeometry(0.5, 12, 12);
    const orbColor = this.colors.c2.clone().lerp(this.colors.c5, 0.3);
    const orbMat = new THREE.MeshStandardMaterial({
      color: orbColor,
      emissive: orbColor,
      emissiveIntensity: 1.0,
      transparent: true,
      opacity: 0.9,
    });
    const orb = new THREE.Mesh(orbGeo, orbMat);
    orb.position.set(0.5, 5.3, 0);
    group.add(orb);
    this.trackDisposable(orbGeo, orbMat);
    this.emissiveMaterials.push(orbMat);

    // Point light from the lantern
    const light = new THREE.PointLight(
      orbColor.clone(),
      1.2,
      20
    );
    light.position.set(0.5, 5.3, 0);
    group.add(light);
    this.pointLights.push(light);

    this.scene.add(group);
    this.groups.push(group);
  }

  private createRuins(index: number): void {
    const pos = this.findPlacement(60, 150, index, 4);
    if (!pos) return;

    const group = new THREE.Group();
    group.position.copy(pos);
    group.rotation.y = Math.random() * Math.PI * 2;

    // Create 3-5 columns of varying heights
    const columnCount = 3 + Math.floor(Math.random() * 3);
    for (let c = 0; c < columnCount; c++) {
      const height = 3 + Math.random() * 7;
      const radius = 0.5 + Math.random() * 0.5;
      const colGeo = new THREE.CylinderGeometry(radius, radius * 1.1, height, 8);
      const colMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0x8a8a7a).lerp(new THREE.Color(0x6b6b60), Math.random()),
        metalness: 0.1,
        roughness: 0.95,
      });
      const col = new THREE.Mesh(colGeo, colMat);

      // Spread columns around
      const cx = (Math.random() - 0.5) * 8;
      const cz = (Math.random() - 0.5) * 8;
      col.position.set(cx, height / 2, cz);

      // Some columns are tilted (ruined)
      if (Math.random() > 0.5) {
        col.rotation.x = (Math.random() - 0.5) * 0.3;
        col.rotation.z = (Math.random() - 0.5) * 0.3;
      }

      col.castShadow = true;
      col.receiveShadow = true;
      group.add(col);
      this.trackDisposable(colGeo, colMat);
    }

    // Optional broken platform/base
    const platformGeo = new THREE.CylinderGeometry(4, 4.5, 0.5, 8);
    const platformMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x777766),
      metalness: 0.1,
      roughness: 0.95,
    });
    const platform = new THREE.Mesh(platformGeo, platformMat);
    platform.position.y = 0.25;
    platform.receiveShadow = true;
    group.add(platform);
    this.trackDisposable(platformGeo, platformMat);

    this.scene.add(group);
    this.groups.push(group);
  }

  update(bass: number, mid: number, treble: number, time: number): void {
    // Pulse emissive materials with bass
    const emissiveIntensity = 0.5 + bass * 1.0;
    for (const mat of this.emissiveMaterials) {
      mat.emissiveIntensity = emissiveIntensity;
    }

    // Pulse point light intensities with bass
    for (const light of this.pointLights) {
      light.intensity = 1.0 + bass * 0.8;
    }
  }

  dispose(): void {
    // Remove all groups from scene
    for (const group of this.groups) {
      this.scene.remove(group);
    }

    // Dispose all geometries and materials
    for (const item of this.disposables) {
      if (item.geometry) item.geometry.dispose();
      if (item.material) {
        (item.material as THREE.MeshStandardMaterial).dispose();
      }
    }

    // Remove point lights (already removed with groups, but clear refs)
    this.groups = [];
    this.emissiveMaterials = [];
    this.pointLights = [];
    this.disposables = [];
  }
}
