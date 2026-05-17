'use client';
import React, { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useAudioStore } from '@/lib/audio-store';

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

const VERT = `
void main() {
  gl_Position = vec4(position, 1.0);
}
`;

const FRAG = `
precision highp float;
uniform float u_time;
uniform vec2 u_res;
uniform float u_bass, u_mid, u_treble;
uniform vec3 u_c1, u_c2, u_c3, u_c4, u_c5;
uniform float u_complexity, u_distortion, u_sharpness, u_scale, u_symmetry;
uniform float u_terrH, u_terrF, u_erosion;
uniform float u_pDens, u_pSize, u_pGrav, u_pTurb;
uniform float u_fog, u_glow, u_noise;
uniform float u_rotSpd, u_pulse, u_waveSpd;
uniform float u_metal, u_emissive;
uniform float u_bassR, u_trebR;

// --- Noise ---
vec3 mod289(vec3 x){return x-floor(x/289.0)*289.0;}
vec2 mod289(vec2 x){return x-floor(x/289.0)*289.0;}
vec3 permute(vec3 x){return mod289((x*34.0+1.0)*x);}
float snoise(vec2 v){
  const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
  vec2 i=floor(v+dot(v,C.yy)),x0=v-i+dot(i,C.xx),i1=x0.x>x0.y?vec2(1,0):vec2(0,1);
  vec4 x12=x0.xyxy+C.xxzz;x12.xy-=i1;i=mod289(i);
  vec3 p=permute(permute(i.y+vec3(0,i1.y,1))+i.x+vec3(0,i1.x,1));
  vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);m=m*m;m=m*m;
  vec3 x=2.0*fract(p*C.www)-1.0,h=abs(x)-0.5,a0=x-floor(x+0.5);
  m*=1.79284-0.85373*(a0*a0+h*h);
  vec3 g;g.x=a0.x*x0.x+h.x*x0.y;g.yz=a0.yz*x12.xz+h.yz*x12.yw;
  return 130.0*dot(m,g);
}
float fbm(vec2 p,float c){float v=0.0,a=0.5;for(int i=0;i<7;i++){if(float(i)>=c*7.0)break;v+=a*snoise(p);p*=2.1;a*=0.5;}return v;}

// --- Domain warp ---
vec2 warp(vec2 p,float amt){
  return p+amt*vec2(snoise(p+vec2(1.7,9.2)),snoise(p+vec2(8.3,2.8)));
}

// --- Simplified Voronoi (organic cells) ---
float voronoi(vec2 p){
  vec2 n=floor(p),f=fract(p);float md=8.0;
  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
    vec2 g=vec2(float(i),float(j));
    vec2 o=vec2(snoise(n+g)*0.5+0.5,snoise(n+g+vec2(33.0))*0.5+0.5);
    vec2 r=g+o-f;md=min(md,dot(r,r));
  }
  return sqrt(md);
}

// --- Kaleidoscope ---
vec2 kaleid(vec2 p, float segments){
  float a=atan(p.y,p.x);float r=length(p);
  a=mod(a,3.14159/segments);a=abs(a-3.14159/segments/2.0);
  return vec2(cos(a),sin(a))*r;
}

void main(){
  vec2 res=u_res;
  if(res.x<1.0) res=vec2(1920.0,1080.0);
  vec2 uv=(gl_FragCoord.xy-0.5*res)/min(res.x,res.y);
  float t=u_time+0.001;
  float bass=u_bass*u_bassR;
  float treb=u_treble*u_trebR;

  // --- Layer 1: Background flow (aurora/nebula) ---
  vec2 bg_uv=uv*1.5+t*u_waveSpd*0.05;
  bg_uv=warp(bg_uv, u_distortion*0.8+bass*0.3);
  float bg_n=fbm(bg_uv, 0.3+u_fog*0.5);
  vec3 bg=mix(u_c4*0.3, u_c5*0.5, bg_n*0.5+0.5);
  bg+=u_c1*0.15*smoothstep(0.0,0.3,bg_n);
  bg+=vec3(0.02,0.01,0.04);
  bg*=0.8;

  // --- Layer 2: Primary pattern (changes with params) ---
  vec2 p_uv=uv*(1.0+u_scale);

  // Apply symmetry (kaleidoscope when high)
  if(u_symmetry>0.3){
    float segs=2.0+floor(u_symmetry*8.0);
    p_uv=kaleid(p_uv,segs);
  }

  // Rotate
  float angle=t*u_rotSpd*0.3+bass*0.5;
  p_uv=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*p_uv;

  // Domain warp
  p_uv=warp(p_uv*(2.0+u_noise*4.0), u_distortion*1.5+bass*0.5);

  // The primary effect: blend between patterns based on params
  float pattern=0.0;

  // Fractal noise pattern (organic, flowing)
  float organic_weight=1.0-u_sharpness;
  float fractal=fbm(p_uv+t*0.1*u_waveSpd, u_complexity);
  pattern+=fractal*organic_weight;

  // Voronoi pattern (cellular, crystalline)
  float crystal_weight=u_sharpness;
  float vor=voronoi(p_uv*3.0+t*0.1);
  float sharp_vor=u_sharpness>0.6 ? abs(sin(vor*12.0)) : vor;
  pattern+=sharp_vor*crystal_weight;

  // Terrain horizon (when terrainHeight is high)
  if(u_terrH>0.2){
    float terrain_y=uv.y+0.3;
    float terrain_n=fbm(vec2(uv.x*u_terrF*3.0+t*u_waveSpd*0.2,0.0),0.5+u_erosion*0.5);
    float terrain=smoothstep(terrain_n*u_terrH*0.8,terrain_n*u_terrH*0.8+0.02,terrain_y);
    float terrain_detail=fbm(vec2(uv.x*u_terrF*8.0,uv.y*4.0)+t*0.05,u_complexity*0.7);
    vec3 terrain_col=mix(u_c2,u_c3,terrain_detail*0.5+0.5);
    terrain_col+=u_c1*terrain_detail*u_emissive*0.3;
    bg=mix(terrain_col*(0.3+bass*0.3), bg, terrain);
  }

  // Color the pattern using palette
  float cmix=pattern*0.5+0.5;
  vec3 pat_col=mix(u_c1,u_c2,smoothstep(0.2,0.5,cmix));
  pat_col=mix(pat_col,u_c3,smoothstep(0.5,0.8,cmix));

  // Emission glow
  pat_col*=(1.0+u_emissive*2.0+bass*2.5);

  // Blend pattern onto background
  float pat_alpha=smoothstep(0.0,0.3,abs(pattern))*0.8;
  vec3 col=mix(bg,pat_col,pat_alpha)+bg*0.15;

  // --- Layer 3: Particles (drawn in shader) ---
  if(u_pDens>0.1){
    float particles=0.0;
    for(int i=0;i<12;i++){
      float fi=float(i);
      float seed=fi*127.1;
      vec2 pp=vec2(sin(seed)*0.8,cos(seed*1.3)*0.8);
      pp.y+=t*u_pGrav*0.1+sin(t*0.5+fi)*u_pTurb*0.1;
      pp.x+=sin(t*0.3+fi*2.0)*u_pTurb*0.15;
      pp=mod(pp+1.0,2.0)-1.0;
      float d=length(uv-pp);
      float size=0.003+u_pSize*0.008+bass*0.005;
      particles+=smoothstep(size,size*0.3,d);
    }
    col+=u_c5*particles*(0.5+treb*2.0)*u_pDens;
  }

  // --- Layer 4: Flowing light rays ---
  if(u_glow>0.3){
    float rays=0.0;
    for(int i=0;i<5;i++){
      float fi=float(i);
      float ray_angle=fi*1.256+t*u_rotSpd*0.2;
      vec2 ray_dir=vec2(cos(ray_angle),sin(ray_angle));
      float ray=abs(dot(uv,ray_dir));
      ray=smoothstep(0.02+bass*0.03,0.0,ray)*u_glow;
      rays+=ray;
    }
    col+=mix(u_c1,u_c4,0.5)*rays*0.3;
  }

  // --- Audio reactive pulse ---
  float dist_center=length(uv);
  float pulse_ring=abs(sin(dist_center*10.0-t*3.0*u_pulse))*bass*u_pulse;
  col+=u_c1*pulse_ring*0.15;

  // Ensure minimum brightness
  col *= 1.2;
  col = max(col, vec3(0.05));

  // Tone map
  col=col/(col+1.0);
  col=pow(col,vec3(0.9));

  // Vignette
  col*=1.0-dot(uv,uv)*0.2;
  col = max(col, vec3(0.02));

  gl_FragColor=vec4(col,1.0);
}
`;

function ShaderPlane({ sp }: { sp?: SP }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const { size, gl } = useThree();
  const { frequencies, isPlaying } = useAudioStore();

  function sc(hex: string|undefined, fb: string): THREE.Color {
    if (!hex) return new THREE.Color(fb);
    try { const c = new THREE.Color(hex); return (0.299*c.r+0.587*c.g+0.114*c.b)<0.06 ? new THREE.Color(fb) : c; }
    catch { return new THREE.Color(fb); }
  }

  const uniforms = useMemo(() => ({
    u_time: { value: 0 }, u_res: { value: new THREE.Vector2(size.width, size.height) },
    u_bass: { value: 0 }, u_mid: { value: 0 }, u_treble: { value: 0 },
    u_c1: { value: sc(sp?.colors?.c1,'#06B6D4') }, u_c2: { value: sc(sp?.colors?.c2,'#8B5CF6') },
    u_c3: { value: sc(sp?.colors?.c3,'#F97316') }, u_c4: { value: sc(sp?.colors?.c4,'#22C55E') },
    u_c5: { value: sc(sp?.colors?.c5,'#EC4899') },
    u_complexity: { value: sp?.geometryComplexity??0.5 }, u_distortion: { value: sp?.geometryDistortion??0.3 },
    u_sharpness: { value: sp?.geometrySharpness??0.5 }, u_scale: { value: sp?.geometryScale??1.0 },
    u_symmetry: { value: sp?.symmetry??0.5 },
    u_terrH: { value: sp?.terrainHeight??0.4 }, u_terrF: { value: sp?.terrainFrequency??0.5 },
    u_erosion: { value: sp?.terrainErosion??0.3 },
    u_pDens: { value: sp?.particleDensity??0.5 }, u_pSize: { value: sp?.particleSize??0.4 },
    u_pGrav: { value: sp?.particleGravity??0.0 }, u_pTurb: { value: sp?.particleTurbulence??0.3 },
    u_fog: { value: sp?.fogDensity??0.3 }, u_glow: { value: sp?.glowIntensity??0.5 },
    u_noise: { value: sp?.noiseScale??0.5 },
    u_rotSpd: { value: sp?.rotationSpeed??0.4 }, u_pulse: { value: sp?.pulseIntensity??0.3 },
    u_waveSpd: { value: sp?.waveSpeed??0.5 },
    u_metal: { value: sp?.metalness??0.3 }, u_emissive: { value: sp?.emissiveStrength??0.5 },
    u_bassR: { value: sp?.bassReactivity??0.6 }, u_trebR: { value: sp?.trebleReactivity??0.4 },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  // Update uniforms when sp changes (without recreating them)
  useEffect(() => {
    if (!sp) return;
    const u = uniforms;
    u.u_c1.value = sc(sp.colors?.c1, '#06B6D4');
    u.u_c2.value = sc(sp.colors?.c2, '#8B5CF6');
    u.u_c3.value = sc(sp.colors?.c3, '#F97316');
    u.u_c4.value = sc(sp.colors?.c4, '#22C55E');
    u.u_c5.value = sc(sp.colors?.c5, '#EC4899');
    u.u_complexity.value = sp.geometryComplexity ?? 0.5;
    u.u_distortion.value = sp.geometryDistortion ?? 0.3;
    u.u_sharpness.value = sp.geometrySharpness ?? 0.5;
    u.u_scale.value = sp.geometryScale ?? 1.0;
    u.u_symmetry.value = sp.symmetry ?? 0.5;
    u.u_terrH.value = sp.terrainHeight ?? 0.4;
    u.u_terrF.value = sp.terrainFrequency ?? 0.5;
    u.u_erosion.value = sp.terrainErosion ?? 0.3;
    u.u_pDens.value = sp.particleDensity ?? 0.5;
    u.u_pSize.value = sp.particleSize ?? 0.4;
    u.u_pGrav.value = sp.particleGravity ?? 0.0;
    u.u_pTurb.value = sp.particleTurbulence ?? 0.3;
    u.u_fog.value = sp.fogDensity ?? 0.3;
    u.u_glow.value = sp.glowIntensity ?? 0.5;
    u.u_noise.value = sp.noiseScale ?? 0.5;
    u.u_rotSpd.value = sp.rotationSpeed ?? 0.4;
    u.u_pulse.value = sp.pulseIntensity ?? 0.3;
    u.u_waveSpd.value = sp.waveSpeed ?? 0.5;
    u.u_metal.value = sp.metalness ?? 0.3;
    u.u_emissive.value = sp.emissiveStrength ?? 0.5;
    u.u_bassR.value = sp.bassReactivity ?? 0.6;
    u.u_trebR.value = sp.trebleReactivity ?? 0.4;
  }, [sp, uniforms]);

  useFrame(({ clock }) => {
    uniforms.u_time.value = clock.getElapsedTime();
    uniforms.u_res.value.set(size.width * window.devicePixelRatio, size.height * window.devicePixelRatio);
    if (frequencies && isPlaying && frequencies.length > 0) {
      const l = frequencies.length, bE = Math.floor(l*0.15), mE = Math.floor(l*0.5);
      let bS=0,mS=0,tS=0;
      for(let i=0;i<bE;i++) bS+=frequencies[i];
      for(let i=bE;i<mE;i++) mS+=frequencies[i];
      for(let i=mE;i<l;i++) tS+=frequencies[i];
      uniforms.u_bass.value += (bS/(bE*255) - uniforms.u_bass.value) * 0.15;
      uniforms.u_mid.value += (mS/((mE-bE)*255) - uniforms.u_mid.value) * 0.15;
      uniforms.u_treble.value += (tS/((l-mE)*255) - uniforms.u_treble.value) * 0.15;
    } else {
      uniforms.u_bass.value *= 0.95; uniforms.u_mid.value *= 0.95; uniforms.u_treble.value *= 0.95;
    }
  });

  return (
    <mesh ref={meshRef} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={VERT}
        fragmentShader={FRAG}
        uniforms={uniforms}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}

export function Scene({ sceneParameters: sp }: { enablePointerLock?: boolean; sceneParameters?: SP }) {
  const defaults: SP = {
    colors: { c1: '#06B6D4', c2: '#8B5CF6', c3: '#F97316', c4: '#22C55E', c5: '#EC4899' },
    geometryComplexity: 0.6, geometryDistortion: 0.4, geometrySharpness: 0.3,
    geometryScale: 1.0, symmetry: 0.5,
    terrainHeight: 0.2, terrainFrequency: 0.5, terrainErosion: 0.2,
    particleDensity: 0.6, particleSize: 0.5, particleGravity: 0.1,
    particleTurbulence: 0.4, particleSpread: 0.6,
    fogDensity: 0.3, glowIntensity: 0.7, noiseScale: 0.5,
    rotationSpeed: 0.3, pulseIntensity: 0.4, waveSpeed: 0.4,
    metalness: 0.3, roughness: 0.4, emissiveStrength: 0.6, transparency: 0.1,
    cameraDistance: 0.5, cameraHeight: 0.5,
    bassReactivity: 0.6, trebleReactivity: 0.4,
  };
  const params = sp || defaults;
  const [webglError, setWebglError] = useState(false);

  return (
    <div className="absolute inset-0 w-full h-full z-0">
      <Canvas
        orthographic
        camera={{ zoom: 1, near: -1, far: 1, position: [0, 0, 0] }}
        gl={{
          antialias: false,
          powerPreference: "high-performance",
          alpha: false,
        }}
        onCreated={(state) => {
          try {
            // Force linear output so our shader's manual tone-mapping is not double-applied
            state.gl.outputColorSpace = THREE.LinearSRGBColorSpace;
            state.gl.toneMapping = THREE.NoToneMapping;
            console.log('✅ WebGL canvas created, WebGL2:', state.gl.capabilities.isWebGL2);
          } catch (e) {
            console.error('Canvas creation error:', e);
            setWebglError(true);
          }
        }}
      >
        <ShaderPlane sp={params} />
      </Canvas>
      {webglError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur">
          <div className="text-center">
            <p className="text-red-400 text-lg mb-2">WebGL Error</p>
            <p className="text-white/60 text-sm">Try enabling hardware acceleration in browser settings</p>
          </div>
        </div>
      )}
    </div>
  );
}
