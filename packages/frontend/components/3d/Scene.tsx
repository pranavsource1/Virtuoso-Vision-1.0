'use client';
import React, { useRef, useMemo, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useAudioStore } from '@/lib/audio-store';


// World systems
import { seed as seedNoise } from './world/noise';
import { TerrainGenerator } from './world/TerrainGenerator';
import { VegetationSystem } from './world/VegetationSystem';
import { StructureGenerator } from './world/StructureGenerator';
import { WaterSystem } from './world/WaterSystem';
import { ParticleSystem } from './world/ParticleSystem';
import { SkySystem } from './world/SkySystem';
import { LightingSystem } from './world/LightingSystem';
import { PostProcessingPipeline } from './world/PostProcessingPipeline';

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

// ── Helpers ──────────────────────────────────────────────────────────

function hexToColor(hex: string | undefined, fallback: string): THREE.Color {
  if (!hex) return new THREE.Color(fallback);
  try {
    const c = new THREE.Color(hex);
    const lum = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
    return lum < 0.06 ? new THREE.Color(fallback) : c;
  } catch {
    return new THREE.Color(fallback);
  }
}

/** Simple string → integer hash for deterministic seeding. */
function hashColors(c: Record<string, string | undefined>): number {
  const str = Object.values(c).join('');
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function disposeObject3D(root: THREE.Object3D) {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry?.dispose();
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      materials.forEach((material) => material?.dispose());
    }
  });
}





// ── Scene Component ──────────────────────────────────────────────────

export function Scene({
  sceneParameters: sp,
  enablePointerLock,
  modelUrl,
  splatUrl,
}: {
  enablePointerLock?: boolean;
  sceneParameters?: SP;
  modelUrl?: string | null;
  splatUrl?: string | null;
}) {
  const defaults = useMemo<SP>(() => ({
    colors: { c1: '#06B6D4', c2: '#8B5CF6', c3: '#F97316', c4: '#22C55E', c5: '#EC4899' },
    geometryComplexity: 0.6,
    geometryDistortion: 0.4,
    geometrySharpness: 0.3,
    geometryScale: 1.0,
    symmetry: 0.5,
    terrainHeight: 0.2,
    terrainFrequency: 0.5,
    terrainErosion: 0.2,
    particleDensity: 0.6,
    particleSize: 0.5,
    particleGravity: 0.1,
    particleTurbulence: 0.4,
    particleSpread: 0.6,
    fogDensity: 0.3,
    glowIntensity: 0.7,
    noiseScale: 0.5,
    rotationSpeed: 0.3,
    pulseIntensity: 0.4,
    waveSpeed: 0.4,
    metalness: 0.3,
    roughness: 0.4,
    emissiveStrength: 0.6,
    transparency: 0.1,
    cameraDistance: 0.5,
    cameraHeight: 0.5,
    bassReactivity: 0.6,
    trebleReactivity: 0.4,
  }), []);

  // Serialize sp for stable memo dependencies — prevents new object refs
  // from the parent causing params/colors to recompute on every render.
  const spJson = useMemo(() => JSON.stringify(sp ?? {}), [sp]);

  const params = useMemo<SP>(() => {
    const parsed = JSON.parse(spJson);
    return {
      ...defaults,
      ...parsed,
      colors: {
        ...defaults.colors,
        ...(parsed?.colors || {}),
      } as SP['colors'],
    };
  }, [defaults, spJson]);

  const colors = useMemo(() => {
    const c = (params.colors || {}) as Record<string, string | undefined>;
    return {
      c1: hexToColor(c.c1, '#06B6D4'),
      c2: hexToColor(c.c2, '#8B5CF6'),
      c3: hexToColor(c.c3, '#F97316'),
      c4: hexToColor(c.c4, '#22C55E'),
      c5: hexToColor(c.c5, '#EC4899'),
    };
  }, [params.colors]);

  // Store in refs so the animation loop always reads latest values
  // without requiring the effect to re-run.
  const paramsRef = useRef(params);
  const colorsRef = useRef(colors);
  useEffect(() => { paramsRef.current = params; }, [params]);
  useEffect(() => { colorsRef.current = colors; }, [colors]);

  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const worldRef = useRef<any>(null);
  const [webglError, setWebglError] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    let disposed = false;
    let cleanupScene: (() => void) | undefined;
    let generatedModelRoot: THREE.Object3D | null = null;

    // ── World system refs (set during init, read in cleanup) ──
    let terrain: TerrainGenerator | null = null;
    let vegetation: VegetationSystem | null = null;
    let structures: StructureGenerator | null = null;
    let water: WaterSystem | null = null;
    let particles: ParticleSystem | null = null;
    let sky: SkySystem | null = null;
    let lighting: LightingSystem | null = null;
    let postProcessing: PostProcessingPipeline | null = null;

    const initScene = async () => {
      try {
        // ── 1. Renderer ──
        const renderer = new THREE.WebGLRenderer({
          antialias: true,
          powerPreference: 'high-performance',
          alpha: false,
        });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.2;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        containerRef.current!.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        // ── 2. Scene ──
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0a0a1a);
        sceneRef.current = scene;

        // Fog — driven by params
        const fogFar = 200 + (1 - (params.fogDensity ?? 0.3)) * 300;
        scene.fog = new THREE.FogExp2(0x000a1f, (params.fogDensity ?? 0.3) * 0.006);

        // ── 3. Camera ──
        const camera = new THREE.PerspectiveCamera(
          60,
          window.innerWidth / window.innerHeight,
          0.1,
          2000,
        );
        camera.position.set(0, 18, 50);
        camera.lookAt(0, 2, 0);
        cameraRef.current = camera;

        // ── 4. Seed noise for deterministic world gen ──
        const seedVal = hashColors(
          (params.colors || {}) as Record<string, string | undefined>,
        );
        seedNoise(seedVal);

        // ── 5. World systems (order matters) ──

        // 5a. Sky (background dome)
        sky = new SkySystem(scene, colors, params);

        // 5b. Terrain
        terrain = new TerrainGenerator(scene, colors, params);
        const getHeightAt = terrain.getHeightAt.bind(terrain);

        // 5c. Vegetation (placed on terrain)
        vegetation = new VegetationSystem(scene, colors, params, getHeightAt);

        // 5d. Structures (placed on terrain)
        structures = new StructureGenerator(scene, colors, params, getHeightAt);

        // 5e. Water
        water = new WaterSystem(scene, colors, params);

        // 5f. Lighting (atmospheric lights near structures)
        lighting = new LightingSystem(scene, colors, params);

        // 5g. Particles (fireflies, dust, leaves)
        particles = new ParticleSystem(scene, colors, params);

        // 5h. Post-processing (bloom, vignette, color grading)
        postProcessing = new PostProcessingPipeline(renderer, scene, camera, colors);

        console.log('✅ Virtuoso Vision — Immersive World Loaded');

        if (disposed) {
          // Cleanup if component unmounted during async init
          postProcessing?.dispose();
          terrain?.dispose();
          vegetation?.dispose();
          structures?.dispose();
          water?.dispose();
          particles?.dispose();
          sky?.dispose();
          lighting?.dispose();
          if (generatedModelRoot) {
            scene.remove(generatedModelRoot);
            disposeObject3D(generatedModelRoot);
          }
          renderer.dispose();
          if (renderer.domElement.parentElement) {
            renderer.domElement.parentElement.removeChild(renderer.domElement);
          }
          return;
        }

        // ── 7. FPS Controls ──
        const keysPressed: Record<string, boolean> = {};
        const euler = new THREE.Euler(0, 0, 0, 'YXZ');

        const handleKeyDown = (e: KeyboardEvent) => {
          keysPressed[e.key.toLowerCase()] = true;
        };
        const handleKeyUp = (e: KeyboardEvent) => {
          keysPressed[e.key.toLowerCase()] = false;
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        let pointerLocked = false;

        const handleMouseMove = (e: MouseEvent) => {
          if (!pointerLocked) return;
          euler.setFromQuaternion(camera.quaternion);
          euler.y -= e.movementX * 0.002;
          euler.x -= e.movementY * 0.002;
          euler.x = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, euler.x));
          camera.quaternion.setFromEuler(euler);
        };

        const handleCanvasClick = () => {
          renderer.domElement.requestPointerLock?.();
        };
        const handlePointerLockChange = () => {
          pointerLocked = document.pointerLockElement === renderer.domElement;
        };

        if (enablePointerLock) {
          renderer.domElement.addEventListener('click', handleCanvasClick);
          document.addEventListener('pointerlockchange', handlePointerLockChange);
          document.addEventListener('mousemove', handleMouseMove);
        }

        // ── 8. Animation loop ──
        let accumulatedTime = 0;
        const FIXED_TIMESTEP = 1 / 60;
        let lastTime = performance.now();
        let frameId = 0;

        const animate = () => {
          if (disposed) return;
          frameId = requestAnimationFrame(animate);

          const now = performance.now();
          const deltaTime = Math.min((now - lastTime) / 1000, 0.1);
          lastTime = now;
          const time = now * 0.001; // seconds

          // ── FPS movement ──
          if (pointerLocked && enablePointerLock && cameraRef.current) {
            const speed = 0.4;
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
            const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
            forward.y = 0;
            forward.normalize();
            right.y = 0;
            right.normalize();

            if (keysPressed['w']) camera.position.addScaledVector(forward, speed);
            if (keysPressed['s']) camera.position.addScaledVector(forward, -speed);
            if (keysPressed['d']) camera.position.addScaledVector(right, speed);
            if (keysPressed['a']) camera.position.addScaledVector(right, -speed);
            if (keysPressed[' ']) camera.position.y += speed * 0.6;
            if (keysPressed['shift']) camera.position.y -= speed * 0.6;
          } else {
            // Idle drift
            const drift = Math.sin(now * 0.00015) * 6;
            const driftZ = Math.cos(now * 0.0001) * 4;
            camera.position.x += (drift - camera.position.x) * 0.008;
            camera.position.z += (50 + driftZ - camera.position.z) * 0.005;
            camera.lookAt(0, 2, 0);
          }

          // ── Audio extraction ──
          const { frequencies, isPlaying } =
            useAudioStore.getState?.() || { frequencies: null, isPlaying: false };
          let bass = 0, mid = 0, treble = 0;

          if (frequencies && isPlaying && frequencies.length > 0) {
            const l = frequencies.length;
            const bEnd = Math.max(1, Math.floor(l * 0.15));
            const mEnd = Math.max(bEnd + 1, Math.floor(l * 0.5));

            for (let i = 0; i < bEnd; i++) bass += frequencies[i];
            for (let i = bEnd; i < mEnd; i++) mid += frequencies[i];
            for (let i = mEnd; i < l; i++) treble += frequencies[i];

            bass = bass / (bEnd * 255);
            mid = mid / ((mEnd - bEnd) * 255);
            treble = treble / (Math.max(l - mEnd, 1) * 255);
          }

          // ── Update all world systems ──
          terrain?.update(bass, mid, treble, time);
          vegetation?.update(bass, mid, treble, time);
          structures?.update(bass, mid, treble, time);
          water?.update(bass, mid, treble, time);
          particles?.update(bass, mid, treble, time);
          sky?.update(bass, mid, treble, time);
          lighting?.update(bass, mid, treble, time);
          postProcessing?.update(bass, mid, treble, time);

          // ── Render via post-processing composer ──
          if (postProcessing) {
            postProcessing.render();
          } else {
            renderer.render(scene, camera);
          }
        };

        animate();

        // ── 9. Resize handler ──
        const handleResize = () => {
          const w = window.innerWidth;
          const h = window.innerHeight;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
          postProcessing?.setSize(w, h);
        };
        window.addEventListener('resize', handleResize);

        // ── Cleanup closure ──
        cleanupScene = () => {
          if (frameId) cancelAnimationFrame(frameId);

          window.removeEventListener('keydown', handleKeyDown);
          window.removeEventListener('keyup', handleKeyUp);
          window.removeEventListener('resize', handleResize);
          renderer.domElement.removeEventListener('click', handleCanvasClick);
          document.removeEventListener('pointerlockchange', handlePointerLockChange);
          document.removeEventListener('mousemove', handleMouseMove);

          // Dispose world systems
          postProcessing?.dispose();
          terrain?.dispose();
          vegetation?.dispose();
          structures?.dispose();
          water?.dispose();
          particles?.dispose();
          sky?.dispose();
          lighting?.dispose();

          if (generatedModelRoot) {
            scene.remove(generatedModelRoot);
            disposeObject3D(generatedModelRoot);
          }

          renderer.dispose();
          if (renderer.domElement.parentElement) {
            renderer.domElement.parentElement.removeChild(renderer.domElement);
          }

          if (worldRef.current) {
            try {
              worldRef.current.free();
            } catch {
              // Ignore free errors on unmount
            }
          }

          rendererRef.current = null;
          sceneRef.current = null;
          cameraRef.current = null;
          worldRef.current = null;
        };
      } catch (err) {
        console.error('Scene initialization error:', err);
        if (!disposed) setWebglError(true);
      }
    };

    initScene();

    return () => {
      disposed = true;
      cleanupScene?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enablePointerLock, modelUrl, splatUrl]);

  return (
    <div className="absolute inset-0 w-full h-full z-0">
      <div ref={containerRef} className="w-full h-full" />
      {webglError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur">
          <div className="text-center">
            <p className="text-red-400 text-lg mb-2">WebGL Error</p>
            <p className="text-white/60 text-sm">Enable hardware acceleration in browser</p>
          </div>
        </div>
      )}
    </div>
  );
}
