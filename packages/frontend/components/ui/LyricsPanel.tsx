'use client';

import React, { useEffect, useState } from 'react';
import { useAudioStore } from '@/lib/audio-store';

interface Lyric {
  text: string;
  timestamp: number;
}

interface LyricsPanelProps {
  lyrics: Lyric[];
}

export function LyricsPanel({ lyrics }: LyricsPanelProps) {
  const [activeLyricIndex, setActiveLyricIndex] = useState(0);
  const currentTime = useAudioStore((state) => state.currentTime);

  // Find active lyric based on current time
  useEffect(() => {
    if (!lyrics || lyrics.length === 0) return;

    const index = lyrics.findIndex((lyric, idx) => {
      const nextLyric = lyrics[idx + 1];
      return (
        lyric.timestamp <= currentTime &&
        (!nextLyric || nextLyric.timestamp > currentTime)
      );
    });

    if (index >= 0) {
      setActiveLyricIndex(index);
    }
  }, [currentTime, lyrics]);

  return (
    <aside className="fixed right-0 top-16 w-80 h-[calc(100vh-64px)] bg-black/40 backdrop-blur border-l border-white/10 overflow-y-auto p-6">
      <h3 className="text-sm font-bold text-white/50 uppercase tracking-widest mb-4">Lyrics</h3>

      {lyrics && lyrics.length > 0 ? (
        <div className="space-y-2">
          {lyrics.map((lyric, idx) => (
            <div
              key={idx}
              className={`py-3 px-4 rounded-lg transition-all duration-200 ${
                idx === activeLyricIndex
                  ? 'bg-gradient-to-r from-cyan-500/30 to-purple-600/30 text-white scale-105 shadow-lg shadow-purple-500/20'
                  : 'text-white/50 hover:text-white/70'
              }`}
            >
              <p className="text-sm leading-relaxed">{lyric.text}</p>
              <p className="text-xs text-white/30 mt-1">{lyric.timestamp.toFixed(2)}s</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center py-20">
          <p className="text-white/30 text-sm text-center">
            Lyrics will appear here
          </p>
        </div>
      )}
    </aside>
  );
}
