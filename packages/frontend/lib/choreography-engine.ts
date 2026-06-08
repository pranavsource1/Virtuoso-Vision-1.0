/**
 * ChoreographyEngine
 *
 * Manages time-based scene parameter choreography during playback.
 * Interpolates between keyframes tied to song structure and emotional moments.
 */

export type SceneColorPalette = Partial<Record<'c1' | 'c2' | 'c3' | 'c4' | 'c5', string>> &
  Record<string, string | undefined>;

export interface SceneParameters {
  colors?: SceneColorPalette;
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
  cloudDensity?: number;
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
  terrainStyle?: string;
  waterType?: string;
  structureType?: string;
  skyAtmosphere?: string;
}

export interface ParameterKeyframe {
  timestamp: number;
  parameters: SceneParameters;
  trigger_type: string;
}

export interface LyricalMoment {
  timestamp: number;
  sentiment: string;
  intensity: number;
  lyric_text?: string;
}

export interface SongSection {
  section_type: string;
  start_time: number;
  end_time: number;
  energy_level: number;
  confidence?: number;
}

export interface SceneChoreography {
  base_parameters: SceneParameters;
  keyframes: ParameterKeyframe[];
  lyrical_moments: LyricalMoment[];
  sections: SongSection[];
  created_at?: string;
}

/**
 * ChoreographyEngine: Playback and interpolation of scene choreography
 */
export class ChoreographyEngine {
  private choreography: SceneChoreography;
  private keyframes: ParameterKeyframe[];

  constructor(choreography: SceneChoreography) {
    this.choreography = {
      ...choreography,
      base_parameters: choreography.base_parameters ?? {},
      keyframes: choreography.keyframes ?? [],
      lyrical_moments: choreography.lyrical_moments ?? [],
      sections: choreography.sections ?? [],
    };
    this.keyframes = [...this.choreography.keyframes]
      .filter((keyframe) => Number.isFinite(keyframe.timestamp))
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Get interpolated scene parameters at a specific time
   */
  getCurrentParameters(time: number): SceneParameters {
    const base = this.choreography.base_parameters;

    if (this.keyframes.length === 0) {
      return this.choreography.base_parameters;
    }

    let prev: ParameterKeyframe | null = null;
    let next: ParameterKeyframe | null = null;

    for (const keyframe of this.keyframes) {
      if (keyframe.timestamp <= time) {
        prev = keyframe;
      } else {
        next = keyframe;
        break;
      }
    }

    if (!prev) {
      return {
        ...base,
        ...this.keyframes[0]?.parameters,
      };
    }

    if (!next) {
      return {
        ...base,
        ...prev.parameters,
      };
    }

    const span = Math.max(next.timestamp - prev.timestamp, 0.001);
    const rawT = Math.min(1, Math.max(0, (time - prev.timestamp) / span));
    const easedT = rawT * rawT * (3 - 2 * rawT);

    return this.interpolateParameters(
      { ...base, ...prev.parameters },
      { ...base, ...next.parameters },
      easedT
    );
  }

  /**
   * Get lyrical moment intensity at current time
   * Returns 0-1 intensity if near a lyrical moment.
   */
  getLyricalMomentIntensity(time: number): number {
    if (!this.choreography.lyrical_moments || this.choreography.lyrical_moments.length === 0) {
      return 0;
    }

    const WINDOW_SECONDS = 0.75;
    let strongest = 0;

    for (const moment of this.choreography.lyrical_moments) {
      const distance = Math.abs(moment.timestamp - time);
      if (distance > WINDOW_SECONDS) continue;

      const falloff = 1 - distance / WINDOW_SECONDS;
      strongest = Math.max(strongest, (moment.intensity ?? 0) * falloff);
    }

    return Math.min(1, Math.max(0, strongest));
  }

  /**
   * Get current song section at time
   */
  getCurrentSection(time: number): SongSection | null {
    if (!this.choreography.sections || this.choreography.sections.length === 0) {
      return null;
    }

    return (
      this.choreography.sections.find(
        (s) => time >= s.start_time && time < s.end_time
      ) || null
    );
  }

  /**
   * Linear interpolation between two parameter sets
   */
  private interpolateParameters(
    a: SceneParameters,
    b: SceneParameters,
    t: number
  ): SceneParameters {
    const result: SceneParameters = {};

    // Interpolate all numeric parameters
    const numericKeys = [
      'geometryComplexity',
      'geometryDistortion',
      'geometrySharpness',
      'geometryScale',
      'symmetry',
      'terrainHeight',
      'terrainFrequency',
      'terrainErosion',
      'particleDensity',
      'particleSize',
      'particleGravity',
      'particleTurbulence',
      'particleSpread',
      'fogDensity',
      'cloudDensity',
      'glowIntensity',
      'noiseScale',
      'rotationSpeed',
      'pulseIntensity',
      'waveSpeed',
      'metalness',
      'roughness',
      'emissiveStrength',
      'transparency',
      'cameraDistance',
      'cameraHeight',
      'bassReactivity',
      'trebleReactivity',
    ] as const;

    for (const key of numericKeys) {
      const aVal = a[key] as number | undefined;
      const bVal = b[key] as number | undefined;

      if (aVal !== undefined && bVal !== undefined) {
        result[key] = aVal + (bVal - aVal) * t;
      } else if (bVal !== undefined) {
        result[key] = bVal;
      } else if (aVal !== undefined) {
        result[key] = aVal;
      }
    }

    const source = t < 0.5 ? a : b;
    const fallback = t < 0.5 ? b : a;

    result.colors = source.colors ?? fallback.colors;
    result.terrainStyle = source.terrainStyle ?? fallback.terrainStyle;
    result.waterType = source.waterType ?? fallback.waterType;
    result.structureType = source.structureType ?? fallback.structureType;
    result.skyAtmosphere = source.skyAtmosphere ?? fallback.skyAtmosphere;

    return result;
  }
}
