import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

// ---------------------------------------------------------------------------
// Custom vignette + color-grading shader
// ---------------------------------------------------------------------------
const VignetteColorGradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uVignetteStrength: { value: 0.4 },
    uTintColor: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
    uTintStrength: { value: 0.08 },
    uBass: { value: 0.0 },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignetteStrength;
    uniform vec3 uTintColor;
    uniform float uTintStrength;
    uniform float uBass;

    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);

      // Vignette
      vec2 center = vUv - 0.5;
      float dist = length(center);
      float vignette = 1.0 - smoothstep(0.3, 0.85, dist) * uVignetteStrength;
      color.rgb *= vignette;

      // Color grading / tint
      color.rgb = mix(color.rgb, color.rgb * (1.0 + uTintColor * uTintStrength), 1.0);

      // Bass-driven bloom intensity boost
      color.rgb *= 1.0 + uBass * 0.15;

      gl_FragColor = color;
    }
  `,
};

// ---------------------------------------------------------------------------
// PostProcessingPipeline — cinematic post-processing via EffectComposer
// ---------------------------------------------------------------------------
export class PostProcessingPipeline {
  private composer: EffectComposer;
  private bloomPass: UnrealBloomPass;
  private vignettePass: ShaderPass;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    colors: Record<string, THREE.Color>,
  ) {
    // --- Composer ---
    this.composer = new EffectComposer(renderer);

    // 1. Render pass — base scene render
    const renderPass = new RenderPass(scene, camera);
    this.composer.addPass(renderPass);

    // 2. Unreal Bloom pass — glow effect
    const bloomResolution = new THREE.Vector2(window.innerWidth, window.innerHeight);
    this.bloomPass = new UnrealBloomPass(bloomResolution, 0.8, 0.4, 0.3);
    this.composer.addPass(this.bloomPass);

    // 3. Custom vignette + color grading pass
    this.vignettePass = new ShaderPass(VignetteColorGradeShader);

    // Set tint from scene color c3
    const tint = colors.c3 ?? new THREE.Color(1, 1, 1);
    this.vignettePass.uniforms.uTintColor.value.set(tint.r, tint.g, tint.b);

    this.composer.addPass(this.vignettePass);
  }

  // -------------------------------------------------------------------------
  // render — replaces renderer.render()
  // -------------------------------------------------------------------------
  render(): void {
    this.composer.render();
  }

  // -------------------------------------------------------------------------
  // update — called every frame with audio data
  // -------------------------------------------------------------------------
  update(bass: number, _mid: number, _treble: number, _time: number): void {
    // Bass-driven bloom strength
    this.bloomPass.strength = 0.6 + bass * 0.6;

    // Pass bass to vignette shader
    this.vignettePass.uniforms.uBass.value = bass;
  }

  // -------------------------------------------------------------------------
  // setSize — call on window resize
  // -------------------------------------------------------------------------
  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
    this.bloomPass.resolution.set(width, height);
  }

  // -------------------------------------------------------------------------
  // dispose — clean up GPU resources
  // -------------------------------------------------------------------------
  dispose(): void {
    this.composer.dispose();
  }
}
