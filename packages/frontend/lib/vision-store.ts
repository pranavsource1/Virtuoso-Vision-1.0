'use client';

import { create } from 'zustand';

interface SceneParameters {
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
}

interface Vision {
  id: string;
  name: string;
  songId: string;
  thumbnail?: string;
  playCount: number;
  favorited: boolean;
  createdAt: string;
}

interface Song {
  id: string;
  title: string;
  artist?: string;
  mood: string;
  lyrics: Array<{ text: string; timestamp: number; confidence: number }>;
  sceneParameters: SceneParameters;
  audioUrl: string;
  duration: number;
  createdAt: string;
}

interface VisionStore {
  currentVision: Vision | null;
  currentSong: Song | null;
  sceneParameters: SceneParameters | null;
  setCurrentVision: (vision: Vision) => void;
  setCurrentSong: (song: Song) => void;
  setSceneParameters: (params: SceneParameters) => void;
  clearCurrent: () => void;
}

export const useVisionStore = create<VisionStore>((set) => ({
  currentVision: null,
  currentSong: null,
  sceneParameters: null,
  setCurrentVision: (vision) => set({ currentVision: vision }),
  setCurrentSong: (song) => set({ currentSong: song }),
  setSceneParameters: (sceneParameters) => set({ sceneParameters }),
  clearCurrent: () => set({ currentVision: null, currentSong: null, sceneParameters: null }),
}));
