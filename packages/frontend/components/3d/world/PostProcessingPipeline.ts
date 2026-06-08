import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

// ---------------------------------------------------------------------------
// Custom vignette + color-grading + film grain + chromatic aberration shader
// ---------------------------------------------------------------------------
const VignetteColorGradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uVignetteStrength: { value: 0.4 },
    uTintColor: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
    uTintStrength: { value: 0.08 },
    uBass: { value: 0.0 },
    uTime: { value: 0.0 },
    uGrainIntensity: { value: 0.04 },
    uChromaticAberration: { value: 0.0 },
    uResolution: { value: new THREE.Vector2(1920, 1080) },
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
    uniform float uTime;
    uniform float uGrainIntensity;
    uniform float uChromaticAberration;
    uniform vec2 uResolution;

    varying vec2 vUv;

    // Fast pseudo-random hash for film grain
    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      // --- Chromatic Aberration ---
      // Offset R and B channels radially from center, proportional to bass
      vec2 center = vUv - 0.5;
      float dist = length(center);
      vec2 dir = normalize(center + 0.0001); // avoid division by zero
      float aberrationAmount = uChromaticAberration * dist * 0.5;
      vec2 rOffset = dir * aberrationAmount;
      vec2 bOffset = -dir * aberrationAmount;

      float r = texture2D(tDiffuse, vUv + rOffset).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv + bOffset).b;
      float a = texture2D(tDiffuse, vUv).a;
      vec4 color = vec4(r, g, b, a);

      // --- Vignette ---
      float vignette = 1.0 - smoothstep(0.3, 0.85, dist) * uVignetteStrength;
      color.rgb *= vignette;

      // --- Color grading / tint ---
      color.rgb *= 1.0 + uTintColor * uTintStrength;

      // --- Bass-driven brightness boost ---
      color.rgb *= 1.0 + uBass * 0.15;

      // --- Film Grain ---
      // Animated grain using time and screen-space coordinates
      float grain = hash(vUv * uResolution + fract(uTime * 7.13)) * 2.0 - 1.0;
      color.rgb += grain * uGrainIntensity;

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
    this.bloomPass = new UnrealBloomPass(bloomResolution, 0.5, 0.4, 0.6);
    this.composer.addPass(this.bloomPass);

    // 3. Custom vignette + color grading + film grain + chromatic aberration pass
    this.vignettePass = new ShaderPass(VignetteColorGradeShader);

    // Set tint from scene color c3
    const tint = colors.c3 ?? new THREE.Color(1, 1, 1);
    this.vignettePass.uniforms.uTintColor.value.set(tint.r, tint.g, tint.b);
    this.vignettePass.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);

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
  update(bass: number, _mid: number, treble: number, time: number, params?: {
    glowIntensity?: number;
    fogDensity?: number;
    bassReactivity?: number;
    trebleReactivity?: number;
  }): void {
    const glowIntensity = params?.glowIntensity ?? 0.7;
    const fogDensity = params?.fogDensity ?? 0.3;
    const bassReact = params?.bassReactivity ?? 0.6;
    const trebleReact = params?.trebleReactivity ?? 0.4;

    // Bass-driven bloom strength
    this.bloomPass.strength =
      0.15 + glowIntensity * 0.4 + bass * bassReact * 0.3 + treble * trebleReact * 0.15;

    // Pass bass to vignette shader
    this.vignettePass.uniforms.uBass.value = bass * bassReact;
    this.vignettePass.uniforms.uVignetteStrength.value = 0.25 + fogDensity * 0.45;

    // Film grain: animated via time
    this.vignettePass.uniforms.uTime.value = time;

    // Chromatic aberration: subtle base + amplified on bass hits
    // Range: 0.001 base + up to 0.006 on strong bass
    this.vignettePass.uniforms.uChromaticAberration.value =
      0.001 + bass * bassReact * 0.006;
  }

  // -------------------------------------------------------------------------
  // setSize — call on window resize
  // -------------------------------------------------------------------------
  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
    this.bloomPass.resolution.set(width, height);
    this.vignettePass.uniforms.uResolution.value.set(width, height);
  }

  // -------------------------------------------------------------------------
  // dispose — clean up GPU resources
  // -------------------------------------------------------------------------
  dispose(): void {
    this.composer.dispose();
  }
}
