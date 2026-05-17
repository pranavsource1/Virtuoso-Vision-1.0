'use client';

import { create } from 'zustand';

interface AudioStore {
  frequencies: Uint8Array | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  setFrequencies: (frequencies: Uint8Array) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
}

export const useAudioStore = create<AudioStore>((set) => ({
  frequencies: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  setFrequencies: (frequencies) => set({ frequencies }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
}));
