// =============================================================================
// VegetationSystem.ts — Trees, mushrooms & grass populating the terrain
// =============================================================================
// Procedurally places ~40 trees (3 types), ~30 glowing mushrooms, and ~50
// grass billboard patches on the terrain surface. Audio-reactive: trees sway
// with mid-range, mushrooms glow with treble, grass waves with time.
// =============================================================================

import * as THREE from 'three';
import { SeededRandom } from './noise';

// ---------------------------------------------------------------------------
// SP subset used by this module
// ---------------------------------------------------------------------------
interface VegetationParams {
  particleDensity?: number;
  particleSize?: number;
  glowIntensity?: number;
  emissiveStrength?: number;
  trebleReactivity?: number;
  bassReactivity?: number;
  geometryScale?: number;
  colors?: { c1: string; c2: string; c3: string; c4: string; c5: string };
}

// ---------------------------------------------------------------------------
// Placement constants
// ---------------------------------------------------------------------------
const TREE_COUNT = 40;
const MUSHROOM_COUNT = 30;
const GRASS_COUNT = 50;
const MIN_RADIUS = 40;
const MAX_RADIUS = 180;
const MIN_HEIGHT = -10; // skip water
const MAX_HEIGHT = 15;  // skip peaks

// ---------------------------------------------------------------------------
// Vegetation system class
// ---------------------------------------------------------------------------
export class VegetationSystem {
  private scene: THREE.Scene;
  private colors: Record<string, THREE.Color>;
  private params: VegetationParams;
  private getHeightAt: (x: number, z: number) => number;

  // Containers
  private treeGroup: THREE.Group;
  private mushroomGroup: THREE.Group;
  private grassGroup: THREE.Group;

  // Materials we need to update reactively
  private mushroomCapMaterials: THREE.MeshStandardMaterial[] = [];
  private grassMaterials: THREE.MeshStandardMaterial[] = [];

  // Store base rotations / positions for sway animation
  private treeBaseQuaternions: { mesh: THREE.Object3D; quat: THREE.Quaternion }[] = [];
  private grassBaseData: { mesh: THREE.Object3D; baseY: number }[] = [];

  private rng: SeededRandom;

  constructor(
    scene: THREE.Scene,
    colors: Record<string, THREE.Color>,
    params: VegetationParams,
    getHeightAt: (x: number, z: number) => number,
  ) {
    this.scene = scene;
    this.colors = colors;
    this.params = params;
    this.getHeightAt = getHeightAt;
    this.rng = new SeededRandom(137);

    this.treeGroup = new THREE.Group();
    this.treeGroup.name = 'vegetation_trees';
    this.mushroomGroup = new THREE.Group();
    this.mushroomGroup.name = 'vegetation_mushrooms';
    this.grassGroup = new THREE.Group();
    this.grassGroup.name = 'vegetation_grass';

    this.scene.add(this.treeGroup);
    this.scene.add(this.mushroomGroup);
    this.scene.add(this.grassGroup);

    this.populateTrees();
    this.populateMushrooms();
    this.populateGrass();
  }

  // =========================================================================
  // Placement helper
  // =========================================================================

  private randomPlacement(): THREE.Vector3 | null {
    for (let attempts = 0; attempts < 20; attempts++) {
      const angle = this.rng.range(0, Math.PI * 2);
      const radius = this.rng.range(MIN_RADIUS, MAX_RADIUS);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = this.getHeightAt(x, z);

      if (y >= MIN_HEIGHT && y <= MAX_HEIGHT) {
        return new THREE.Vector3(x, y, z);
      }
    }
    return null;
  }

  // =========================================================================
  // Trees
  // =========================================================================

  private populateTrees(): void {
    const c1 = this.colors.c1 ?? new THREE.Color(0x1a7a3a);
    const c2 = this.colors.c2 ?? new THREE.Color(0x8b6914);
    const c3 = this.colors.c3 ?? new THREE.Color(0x44bb66);
    const c5 = this.colors.c5 ?? new THREE.Color(0xff66aa);

    const trunkColor = new THREE.Color().copy(c2).multiplyScalar(0.6);
    const greenA = new THREE.Color().copy(c1);
    const greenB = new THREE.Color().copy(c3);
    const fantasyGlow = new THREE.Color().copy(c5);

    const scaleFactor = this.params.geometryScale ?? 1.0;

    for (let i = 0; i < TREE_COUNT; i++) {
      const pos = this.randomPlacement();
      if (!pos) continue;

      const scale = this.rng.range(0.6, 1.4) * scaleFactor;
      const type = i % 3; // cycle through 3 types

      let tree: THREE.Group;
      switch (type) {
        case 0:
          tree = this.createPineTree(trunkColor, greenA, greenB);
          break;
        case 1:
          tree = this.createRoundTree(trunkColor, greenA);
          break;
        default:
          tree = this.createFantasyTree(trunkColor, fantasyGlow);
          break;
      }

      tree.position.copy(pos);
      tree.scale.setScalar(scale);
      // Random Y rotation for variety
      tree.rotation.y = this.rng.range(0, Math.PI * 2);

      this.treeGroup.add(tree);
      this.treeBaseQuaternions.push({
        mesh: tree,
        quat: tree.quaternion.clone(),
      });
    }
  }

  /** Pine tree: cylinder trunk + 3 stacked cones */
  private createPineTree(
    trunkCol: THREE.Color,
    leafA: THREE.Color,
    leafB: THREE.Color,
  ): THREE.Group {
    const group = new THREE.Group();

    // Trunk
    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.5, 4, 6);
    const trunkMat = new THREE.MeshStandardMaterial({
      color: trunkCol,
      roughness: 0.9,
      metalness: 0.05,
    });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 2;
    trunk.castShadow = true;
    group.add(trunk);

    // 3 cone layers (bottom to top, shrinking)
    const layerConfigs = [
      { radius: 3.0, height: 4.0, y: 4.5, color: leafA },
      { radius: 2.2, height: 3.5, y: 7.0, color: new THREE.Color().lerpColors(leafA, leafB, 0.5) },
      { radius: 1.4, height: 3.0, y: 9.0, color: leafB },
    ];

    for (const cfg of layerConfigs) {
      const coneGeo = new THREE.ConeGeometry(cfg.radius, cfg.height, 7);
      const coneMat = new THREE.MeshStandardMaterial({
        color: cfg.color,
        roughness: 0.75,
        metalness: 0.05,
        emissive: cfg.color,
        emissiveIntensity: 0.05,
      });
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.y = cfg.y;
      cone.castShadow = true;
      group.add(cone);
    }

    return group;
  }

  /** Round tree: cylinder trunk + sphere canopy */
  private createRoundTree(trunkCol: THREE.Color, canopyCol: THREE.Color): THREE.Group {
    const group = new THREE.Group();

    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 5, 6);
    const trunkMat = new THREE.MeshStandardMaterial({
      color: trunkCol,
      roughness: 0.9,
      metalness: 0.05,
    });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 2.5;
    trunk.castShadow = true;
    group.add(trunk);

    const canopyGeo = new THREE.SphereGeometry(3.5, 10, 8);
    const canopyMat = new THREE.MeshStandardMaterial({
      color: canopyCol,
      roughness: 0.7,
      metalness: 0.05,
      emissive: canopyCol,
      emissiveIntensity: 0.05,
    });
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.position.y = 7;
    canopy.castShadow = true;
    group.add(canopy);

    return group;
  }

  /** Fantasy tree: twisted trunk + emissive sphere cluster canopy */
  private createFantasyTree(trunkCol: THREE.Color, glowCol: THREE.Color): THREE.Group {
    const group = new THREE.Group();

    // Slightly twisted trunk using a tapered cylinder with rotation
    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.6, 6, 8, 4, false);
    // Twist the trunk vertices for a magical look
    const trunkPos = trunkGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < trunkPos.count; i++) {
      const y = trunkPos.getY(i);
      const twist = y * 0.3;
      const x = trunkPos.getX(i);
      const z = trunkPos.getZ(i);
      trunkPos.setX(i, x * Math.cos(twist) - z * Math.sin(twist));
      trunkPos.setZ(i, x * Math.sin(twist) + z * Math.cos(twist));
    }
    trunkPos.needsUpdate = true;
    trunkGeo.computeVertexNormals();

    const trunkMat = new THREE.MeshStandardMaterial({
      color: trunkCol,
      roughness: 0.85,
      metalness: 0.1,
      emissive: glowCol,
      emissiveIntensity: 0.1,
    });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 3;
    trunk.castShadow = true;
    group.add(trunk);

    // Cluster of small glowing spheres as canopy
    const sphereCount = 5 + Math.floor(this.rng.next() * 4);
    const canopyMat = new THREE.MeshStandardMaterial({
      color: glowCol,
      roughness: 0.4,
      metalness: 0.2,
      emissive: glowCol,
      emissiveIntensity: (this.params.glowIntensity ?? 0.5) * 0.6,
      transparent: true,
      opacity: 0.85,
    });

    for (let s = 0; s < sphereCount; s++) {
      const radius = this.rng.range(0.8, 2.0);
      const sphereGeo = new THREE.SphereGeometry(radius, 8, 6);
      const sphere = new THREE.Mesh(sphereGeo, canopyMat);
      sphere.position.set(
        this.rng.range(-2, 2),
        6 + this.rng.range(0, 3),
        this.rng.range(-2, 2),
      );
      sphere.castShadow = true;
      group.add(sphere);
    }

    return group;
  }

  // =========================================================================
  // Mushrooms
  // =========================================================================

  private populateMushrooms(): void {
    const c4 = this.colors.c4 ?? new THREE.Color(0xff4488);
    const c5 = this.colors.c5 ?? new THREE.Color(0xaa44ff);

    const stemColor = new THREE.Color(0xeeddcc);
    const glowIntensity = this.params.glowIntensity ?? 0.5;

    for (let i = 0; i < MUSHROOM_COUNT; i++) {
      const pos = this.randomPlacement();
      if (!pos) continue;

      const scale = this.rng.range(0.3, 0.8);
      const group = new THREE.Group();

      // Stem
      const stemGeo = new THREE.CylinderGeometry(0.15, 0.25, 1.2, 6);
      const stemMat = new THREE.MeshStandardMaterial({
        color: stemColor,
        roughness: 0.8,
        metalness: 0.05,
      });
      const stem = new THREE.Mesh(stemGeo, stemMat);
      stem.position.y = 0.6;
      group.add(stem);

      // Cap (hemisphere using phiLength)
      const capColor = i % 2 === 0 ? c4 : c5;
      const capGeo = new THREE.SphereGeometry(0.6, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
      const capMat = new THREE.MeshStandardMaterial({
        color: capColor,
        roughness: 0.3,
        metalness: 0.15,
        emissive: capColor,
        emissiveIntensity: glowIntensity * 0.8,
        transparent: true,
        opacity: 0.9,
      });
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.y = 1.2;
      group.add(cap);

      this.mushroomCapMaterials.push(capMat);

      group.position.copy(pos);
      group.scale.setScalar(scale);
      group.rotation.y = this.rng.range(0, Math.PI * 2);

      this.mushroomGroup.add(group);
    }
  }

  // =========================================================================
  // Grass patches
  // =========================================================================

  private populateGrass(): void {
    const c1 = this.colors.c1 ?? new THREE.Color(0x2a9a4a);
    const c3 = this.colors.c3 ?? new THREE.Color(0x55cc77);

    for (let i = 0; i < GRASS_COUNT; i++) {
      const pos = this.randomPlacement();
      if (!pos) continue;

      // Grass billboard — thin plane facing upward-ish
      const width = this.rng.range(1.0, 3.0);
      const height = this.rng.range(0.8, 2.0);
      const grassGeo = new THREE.PlaneGeometry(width, height);
      const grassColor = new THREE.Color().lerpColors(c1, c3, this.rng.next());
      const grassMat = new THREE.MeshStandardMaterial({
        color: grassColor,
        roughness: 0.85,
        metalness: 0.0,
        emissive: grassColor,
        emissiveIntensity: 0.05,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        depthWrite: false,
        alphaTest: 0.1,
      });

      const grassMesh = new THREE.Mesh(grassGeo, grassMat);
      grassMesh.position.copy(pos);
      grassMesh.position.y += height * 0.4; // lift so base sits on terrain

      // Random rotation around Y so they face different directions
      grassMesh.rotation.y = this.rng.range(0, Math.PI);
      // Tilt slightly for a natural look
      grassMesh.rotation.x = this.rng.range(-0.15, 0.15);

      this.grassGroup.add(grassMesh);
      this.grassMaterials.push(grassMat);
      this.grassBaseData.push({ mesh: grassMesh, baseY: grassMesh.rotation.x });
    }
  }

  // =========================================================================
  // Per-frame update
  // =========================================================================

  update(bass: number, mid: number, treble: number, time: number): void {
    const trebleReact = this.params.trebleReactivity ?? 0.5;

    // --- Tree sway with mid-range ---
    const swayAmount = mid * 0.03;
    const swayTime = time * 1.2;
    const euler = new THREE.Euler();
    const qSway = new THREE.Quaternion();

    for (let i = 0; i < this.treeBaseQuaternions.length; i++) {
      const { mesh, quat } = this.treeBaseQuaternions[i];
      // Each tree gets a slightly offset phase so they don't all move in sync
      const phase = i * 0.7;
      euler.set(
        Math.sin(swayTime + phase) * swayAmount,
        0,
        Math.cos(swayTime + phase * 0.6) * swayAmount * 0.7,
      );
      qSway.setFromEuler(euler);
      mesh.quaternion.copy(quat).multiply(qSway);
    }

    // --- Mushroom glow with treble ---
    const baseGlow = (this.params.glowIntensity ?? 0.5) * 0.8;
    const trebleBoost = treble * trebleReact * 1.5;
    const pulseGlow = baseGlow + trebleBoost + Math.sin(time * 3) * 0.1;

    for (const mat of this.mushroomCapMaterials) {
      mat.emissiveIntensity = Math.min(pulseGlow, 3.0);
    }

    // --- Grass wave ---
    for (const gd of this.grassBaseData) {
      const idx = this.grassBaseData.indexOf(gd);
      const phase = idx * 0.5;
      gd.mesh.rotation.x = gd.baseY + Math.sin(time * 1.5 + phase) * 0.08;
      // Subtle vertical bob with bass
      gd.mesh.position.y += Math.sin(time * 0.8 + phase) * bass * 0.01;
    }
  }

  // =========================================================================
  // Cleanup
  // =========================================================================

  dispose(): void {
    const disposeObject = (obj: THREE.Object3D) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      }
      obj.children.forEach(disposeObject);
    };

    disposeObject(this.treeGroup);
    disposeObject(this.mushroomGroup);
    disposeObject(this.grassGroup);

    this.scene.remove(this.treeGroup);
    this.scene.remove(this.mushroomGroup);
    this.scene.remove(this.grassGroup);

    this.treeBaseQuaternions = [];
    this.mushroomCapMaterials = [];
    this.grassMaterials = [];
    this.grassBaseData = [];
  }
}
