// =============================================================================
// VegetationSystem.ts — Trees, mushrooms & grass populating the terrain
// =============================================================================
// Procedurally places ~40 trees (3 types), ~30 glowing mushrooms, and ~50
// grass billboard patches on the terrain surface. Audio-reactive: trees sway
// with mid-range, mushrooms glow with treble, grass waves with time.
//
// Mushrooms and grass use InstancedMesh to minimize draw calls.
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
  colors?: { c1?: string; c2?: string; c3?: string; c4?: string; c5?: string };
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

  // Instanced meshes for mushrooms
  private mushroomStemInstanced: THREE.InstancedMesh | null = null;
  private mushroomCapInstanced1: THREE.InstancedMesh | null = null; // color c4
  private mushroomCapInstanced2: THREE.InstancedMesh | null = null; // color c5
  private mushroomCapMaterial1: THREE.MeshStandardMaterial | null = null;
  private mushroomCapMaterial2: THREE.MeshStandardMaterial | null = null;

  // Instanced mesh for grass
  private grassInstanced: THREE.InstancedMesh | null = null;
  private grassMaterial: THREE.MeshStandardMaterial | null = null;
  private grassBaseData: { baseRotationX: number; basePositionY: number; index: number }[] = [];
  private grassMatrices: THREE.Matrix4[] = [];

  // Store base rotations / positions for sway animation
  private treeBaseQuaternions: { mesh: THREE.Object3D; quat: THREE.Quaternion }[] = [];

  private rng: SeededRandom;

  // Temp objects reused per frame to avoid allocation
  private _tmpMatrix = new THREE.Matrix4();
  private _tmpPosition = new THREE.Vector3();
  private _tmpQuaternion = new THREE.Quaternion();
  private _tmpScale = new THREE.Vector3();
  private _tmpEuler = new THREE.Euler();

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
    this.scene.add(this.treeGroup);

    this.populateTrees();
    this.populateMushroomsInstanced();
    this.populateGrassInstanced();
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
  // Trees (kept as Groups since they have complex multi-part geometry)
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
      const type = i % 3;

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

    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.6, 6, 8, 4, false);
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
  // Mushrooms — InstancedMesh (2 draw calls: stems + caps)
  // =========================================================================

  private populateMushroomsInstanced(): void {
    const c4 = this.colors.c4 ?? new THREE.Color(0xff4488);
    const c5 = this.colors.c5 ?? new THREE.Color(0xaa44ff);
    const stemColor = new THREE.Color(0xeeddcc);
    const glowIntensity = this.params.glowIntensity ?? 0.5;

    // Shared geometries
    const stemGeo = new THREE.CylinderGeometry(0.15, 0.25, 1.2, 6);
    const capGeo = new THREE.SphereGeometry(0.6, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);

    // Stem material (shared)
    const stemMat = new THREE.MeshStandardMaterial({
      color: stemColor,
      roughness: 0.8,
      metalness: 0.05,
    });

    // Two cap materials for alternating colors
    this.mushroomCapMaterial1 = new THREE.MeshStandardMaterial({
      color: c4,
      roughness: 0.3,
      metalness: 0.15,
      emissive: c4,
      emissiveIntensity: glowIntensity * 0.8,
      transparent: true,
      opacity: 0.9,
    });

    this.mushroomCapMaterial2 = new THREE.MeshStandardMaterial({
      color: c5,
      roughness: 0.3,
      metalness: 0.15,
      emissive: c5,
      emissiveIntensity: glowIntensity * 0.8,
      transparent: true,
      opacity: 0.9,
    });

    // Collect placement data
    const placements: { pos: THREE.Vector3; scale: number; rotY: number }[] = [];
    for (let i = 0; i < MUSHROOM_COUNT; i++) {
      const pos = this.randomPlacement();
      if (!pos) continue;
      placements.push({
        pos,
        scale: this.rng.range(0.3, 0.8),
        rotY: this.rng.range(0, Math.PI * 2),
      });
    }

    const count = placements.length;
    if (count === 0) return;

    // Split into two groups: even indices use c4, odd use c5
    const group1Indices: number[] = [];
    const group2Indices: number[] = [];
    for (let i = 0; i < count; i++) {
      if (i % 2 === 0) group1Indices.push(i);
      else group2Indices.push(i);
    }

    // Create stem instances (all mushrooms share one instanced mesh)
    this.mushroomStemInstanced = new THREE.InstancedMesh(stemGeo, stemMat, count);
    for (let i = 0; i < count; i++) {
      const { pos, scale, rotY } = placements[i];
      this._tmpMatrix.compose(
        this._tmpPosition.set(pos.x, pos.y + 0.6 * scale, pos.z),
        this._tmpQuaternion.setFromEuler(this._tmpEuler.set(0, rotY, 0)),
        this._tmpScale.set(scale, scale, scale),
      );
      this.mushroomStemInstanced.setMatrixAt(i, this._tmpMatrix);
    }
    this.mushroomStemInstanced.instanceMatrix.needsUpdate = true;
    this.scene.add(this.mushroomStemInstanced);

    // Create cap instances for group 1 (c4 color)
    if (group1Indices.length > 0) {
      this.mushroomCapInstanced1 = new THREE.InstancedMesh(capGeo, this.mushroomCapMaterial1, group1Indices.length);
      for (let j = 0; j < group1Indices.length; j++) {
        const i = group1Indices[j];
        const { pos, scale, rotY } = placements[i];
        this._tmpMatrix.compose(
          this._tmpPosition.set(pos.x, pos.y + 1.2 * scale, pos.z),
          this._tmpQuaternion.setFromEuler(this._tmpEuler.set(0, rotY, 0)),
          this._tmpScale.set(scale, scale, scale),
        );
        this.mushroomCapInstanced1.setMatrixAt(j, this._tmpMatrix);
      }
      this.mushroomCapInstanced1.instanceMatrix.needsUpdate = true;
      this.scene.add(this.mushroomCapInstanced1);
    }

    // Create cap instances for group 2 (c5 color)
    if (group2Indices.length > 0) {
      this.mushroomCapInstanced2 = new THREE.InstancedMesh(capGeo, this.mushroomCapMaterial2, group2Indices.length);
      for (let j = 0; j < group2Indices.length; j++) {
        const i = group2Indices[j];
        const { pos, scale, rotY } = placements[i];
        this._tmpMatrix.compose(
          this._tmpPosition.set(pos.x, pos.y + 1.2 * scale, pos.z),
          this._tmpQuaternion.setFromEuler(this._tmpEuler.set(0, rotY, 0)),
          this._tmpScale.set(scale, scale, scale),
        );
        this.mushroomCapInstanced2.setMatrixAt(j, this._tmpMatrix);
      }
      this.mushroomCapInstanced2.instanceMatrix.needsUpdate = true;
      this.scene.add(this.mushroomCapInstanced2);
    }
  }

  // =========================================================================
  // Grass patches — InstancedMesh (1 draw call)
  // =========================================================================

  private populateGrassInstanced(): void {
    const c1 = this.colors.c1 ?? new THREE.Color(0x2a9a4a);
    const c3 = this.colors.c3 ?? new THREE.Color(0x55cc77);
    const grassColor = new THREE.Color().lerpColors(c1, c3, 0.5);

    // Use a single average-sized plane geometry for all grass instances
    const grassGeo = new THREE.PlaneGeometry(2.0, 1.4);

    this.grassMaterial = new THREE.MeshStandardMaterial({
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

    // Collect valid placements first
    const placements: { pos: THREE.Vector3; rotY: number; rotX: number; scaleX: number; scaleY: number }[] = [];
    for (let i = 0; i < GRASS_COUNT; i++) {
      const pos = this.randomPlacement();
      if (!pos) continue;
      const height = this.rng.range(0.8, 2.0);
      pos.y += height * 0.4; // lift so base sits on terrain
      placements.push({
        pos,
        rotY: this.rng.range(0, Math.PI),
        rotX: this.rng.range(-0.15, 0.15),
        scaleX: this.rng.range(0.5, 1.5),
        scaleY: this.rng.range(0.6, 1.4),
      });
    }

    const count = placements.length;
    if (count === 0) return;

    this.grassInstanced = new THREE.InstancedMesh(grassGeo, this.grassMaterial, count);

    for (let i = 0; i < count; i++) {
      const p = placements[i];
      this._tmpMatrix.compose(
        p.pos,
        this._tmpQuaternion.setFromEuler(this._tmpEuler.set(p.rotX, p.rotY, 0)),
        this._tmpScale.set(p.scaleX, p.scaleY, 1),
      );
      this.grassInstanced.setMatrixAt(i, this._tmpMatrix);

      // Store the base matrix for animation
      this.grassMatrices.push(this._tmpMatrix.clone());
      this.grassBaseData.push({
        baseRotationX: p.rotX,
        basePositionY: p.pos.y,
        index: i,
      });
    }

    this.grassInstanced.instanceMatrix.needsUpdate = true;
    this.scene.add(this.grassInstanced);
  }

  // =========================================================================
  // Per-frame update
  // =========================================================================

  update(bass: number, mid: number, treble: number, time: number, params?: VegetationParams): void {
    const liveParams = params ?? this.params;
    const trebleReact = liveParams.trebleReactivity ?? this.params.trebleReactivity ?? 0.5;
    const bassReact = liveParams.bassReactivity ?? this.params.bassReactivity ?? 0.5;
    const glowIntensity = liveParams.glowIntensity ?? this.params.glowIntensity ?? 0.5;

    // --- Tree sway with mid-range ---
    const swayAmount = mid * (0.01 + bassReact * 0.04);
    const swayTime = time * 1.2;
    const euler = new THREE.Euler();
    const qSway = new THREE.Quaternion();

    for (let i = 0; i < this.treeBaseQuaternions.length; i++) {
      const { mesh, quat } = this.treeBaseQuaternions[i];
      const phase = i * 0.7;
      euler.set(
        Math.sin(swayTime + phase) * swayAmount,
        0,
        Math.cos(swayTime + phase * 0.6) * swayAmount * 0.7,
      );
      qSway.setFromEuler(euler);
      mesh.quaternion.copy(quat).multiply(qSway);
    }

    // --- Mushroom glow with treble (just update material, no per-instance work) ---
    const baseGlow = glowIntensity * 0.5;
    const trebleBoost = treble * trebleReact * 0.8;
    const pulseGlow = Math.min(baseGlow + trebleBoost + Math.sin(time * 3) * 0.1, 1.5);

    if (this.mushroomCapMaterial1) {
      this.mushroomCapMaterial1.emissiveIntensity = pulseGlow;
    }
    if (this.mushroomCapMaterial2) {
      this.mushroomCapMaterial2.emissiveIntensity = pulseGlow;
    }

    // --- Grass wave (update instance matrices) ---
    // Fixed: uses direct index instead of O(n²) indexOf
    if (this.grassInstanced && this.grassBaseData.length > 0) {
      for (let i = 0; i < this.grassBaseData.length; i++) {
        const gd = this.grassBaseData[i];
        const phase = i * 0.5;
        const newRotX = gd.baseRotationX + Math.sin(time * 1.5 + phase) * 0.08;
        const newPosY = gd.basePositionY + Math.sin(time * 0.8 + phase) * bass * bassReact * 0.25;

        // Decompose original matrix, update, recompose
        const baseMatrix = this.grassMatrices[i];
        baseMatrix.decompose(this._tmpPosition, this._tmpQuaternion, this._tmpScale);

        // Update position Y and rotation X
        this._tmpPosition.y = newPosY;
        this._tmpEuler.setFromQuaternion(this._tmpQuaternion);
        this._tmpEuler.x = newRotX;
        this._tmpQuaternion.setFromEuler(this._tmpEuler);

        this._tmpMatrix.compose(this._tmpPosition, this._tmpQuaternion, this._tmpScale);
        this.grassInstanced.setMatrixAt(gd.index, this._tmpMatrix);
      }
      this.grassInstanced.instanceMatrix.needsUpdate = true;
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

    // Trees (still group-based)
    disposeObject(this.treeGroup);
    this.scene.remove(this.treeGroup);

    // Instanced mushrooms
    if (this.mushroomStemInstanced) {
      this.scene.remove(this.mushroomStemInstanced);
      this.mushroomStemInstanced.geometry.dispose();
      (this.mushroomStemInstanced.material as THREE.Material).dispose();
    }
    if (this.mushroomCapInstanced1) {
      this.scene.remove(this.mushroomCapInstanced1);
      this.mushroomCapInstanced1.geometry.dispose();
    }
    if (this.mushroomCapInstanced2) {
      this.scene.remove(this.mushroomCapInstanced2);
      this.mushroomCapInstanced2.geometry.dispose();
    }
    this.mushroomCapMaterial1?.dispose();
    this.mushroomCapMaterial2?.dispose();

    // Instanced grass
    if (this.grassInstanced) {
      this.scene.remove(this.grassInstanced);
      this.grassInstanced.geometry.dispose();
    }
    this.grassMaterial?.dispose();

    this.treeBaseQuaternions = [];
    this.grassBaseData = [];
    this.grassMatrices = [];
  }
}
