'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Scene } from '@/components/3d/Scene';
import { useVisionStore } from '@/lib/vision-store';
import { useAudioStore } from '@/lib/audio-store';
import { Play, Pause, Volume2, Heart, Share2, ArrowLeft, BookOpen, Settings, Loader, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { getVision as fetchVisionAPI, getSong as fetchSongAPI, getAuthToken, startMusicWorldGeneration } from '@/lib/api';

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
  sceneParameters: Record<string, any>;
  visualDescription?: string;
  audioUrl: string;
  duration: number;
  createdAt: string;
  modelUrl?: string | null;
  splatUrl?: string | null;
  generatedMusicUrl?: string | null;
  scene3dDescription?: string | null;
  generationTaskId?: string | null;
  generationStatus?: 'pending' | 'processing' | 'succeeded' | 'failed';
  generationError?: string | null;
  worldLore?: string | null;
}

export default function VisionPage() {
  const params = useParams();
  const router = useRouter();
  const visionId = params.id as string;
  const audioRef = useRef<HTMLAudioElement>(null);

  const [vision, setVision] = useState<Vision | null>(null);
  const [song, setSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentLyricIndex, setCurrentLyricIndex] = useState(-1);
  const [showLyrics, setShowLyrics] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [volume, setVolume] = useState(100);
  const [isFavorited, setIsFavorited] = useState(false);
  const [showInsight, setShowInsight] = useState(false);

  const { setCurrentVision, setCurrentSong, setSceneParameters } = useVisionStore();
  const { frequencies, setIsPlaying: setAudioPlaying, setCurrentTime, setDuration, setFrequencies } = useAudioStore();

  const [bassScale, setBassScale] = useState(1);

  // Calculate bass scale for HUD
  useEffect(() => {
    if (!frequencies || frequencies.length === 0) {
      setBassScale(1);
      return;
    }
    let sum = 0;
    // Average first 5 frequency bins for bass
    for (let i = 0; i < 5; i++) {
      sum += frequencies[i] || 0;
    }
    const avg = sum / 5;
    setBassScale(1 + (avg / 255) * 0.15);
  }, [frequencies]);

  // Fetch vision and song data using centralized API (handles 401 retry)
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch vision using the centralized API wrapper (auto-retries on 401)
        const { data: visionData, error: visionErr } = await fetchVisionAPI(visionId);

        if (visionErr || !visionData) {
          throw new Error(visionErr || 'Failed to fetch vision');
        }

        const vData = visionData as Vision;
        setVision(vData);
        setCurrentVision(vData);
        setIsFavorited(vData.favorited);

        // Fetch song using the centralized API wrapper
        const { data: songData, error: songErr } = await fetchSongAPI(vData.songId);

        if (songErr || !songData) {
          throw new Error(songErr || 'Failed to fetch song');
        }

        const sData = songData as Song;
        setSong(sData);
        setCurrentSong(sData);
        setSceneParameters(sData.sceneParameters);
      } catch (err: any) {
        console.error('Error loading vision:', err);
        setError(err.message || 'Failed to load vision');
        toast.error(err.message || 'Failed to load vision');
      } finally {
        setLoading(false);
      }
    };

    if (visionId) {
      fetchData();

      // Set up polling for real-time updates (check every 2 seconds)
      const pollInterval = setInterval(fetchData, 2000);

      // Stop polling if vision successfully loads (after 30 seconds)
      const timeout = setTimeout(() => {
        clearInterval(pollInterval);
      }, 30000);

      return () => {
        clearInterval(pollInterval);
        clearTimeout(timeout);
      };
    }
  }, [visionId, setCurrentVision, setCurrentSong, setSceneParameters]);

  // Handle audio playback
  const handlePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
      setAudioPlaying(!isPlaying);
    }
  };

  // Update current time
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);

      // Update current lyric
      if (song?.lyrics) {
        const currentIndex = song.lyrics.findIndex(
          (lyric, idx) =>
            audioRef.current!.currentTime >= lyric.timestamp &&
            (idx === song.lyrics.length - 1 ||
              audioRef.current!.currentTime < song.lyrics[idx + 1].timestamp)
        );
        if (currentIndex !== -1) {
          setCurrentLyricIndex(currentIndex);
        } else if (song.lyrics.length > 0 && audioRef.current!.currentTime < song.lyrics[0].timestamp) {
          setCurrentLyricIndex(-1);
        }
      }
    }
  };

  // Audio reactivity FFT analysis — create AudioContext once, animate when playing
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animationIdRef = useRef<number>(0);

  // One-time setup: connect audio element to AudioContext
  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current);
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        try { audioContextRef.current.close(); } catch (e) { /* ignore */ }
      }
    };
  }, []);

  // Start/stop FFT animation loop based on play state
  useEffect(() => {
    if (!audioRef.current) return;

    if (!isPlaying) {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
        animationIdRef.current = 0;
      }
      return;
    }

    // Initialize AudioContext + analyser on first play (only once)
    if (!audioContextRef.current) {
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        const source = ctx.createMediaElementSource(audioRef.current);
        source.connect(analyser);
        analyser.connect(ctx.destination);

        audioContextRef.current = ctx;
        analyserRef.current = analyser;
        sourceRef.current = source;
      } catch (err) {
        console.error('Audio context setup failed:', err);
        return;
      }
    }

    // Resume if suspended (browser autoplay policy)
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }

    const analyser = analyserRef.current;
    if (!analyser) return;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      analyser.getByteFrequencyData(dataArray);
      setFrequencies(dataArray);
    };

    animate();

    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
        animationIdRef.current = 0;
      }
    };
  }, [isPlaying, setFrequencies]);

  const handleFavorite = async () => {
    try {
      const token = await getAuthToken();
      if (!token) {
        toast.error('Please log in to update favorites');
        return;
      }

      const newFavorited = !isFavorited;

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/visions/${visionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ favorited: newFavorited }),
      });

      if (response.ok) {
        setIsFavorited(newFavorited);
        toast.success(newFavorited ? 'Added to favorites' : 'Removed from favorites');
      }
    } catch (error) {
      toast.error('Failed to update favorite');
    }
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success('Link copied to clipboard');
    } catch (error) {
      toast.error('Failed to copy link');
    }
  };



  if (loading) {
    return (
      <div className="w-full h-screen bg-black flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          className="w-12 h-12 border-4 border-purple-500/20 border-t-purple-500 rounded-full"
        />
      </div>
    );
  }

  if (error || !vision || !song) {
    return (
      <div className="w-full h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-lg mb-4">{error || 'Failed to load vision'}</p>
          <motion.button
            onClick={() => router.push('/explore')}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-purple-600 text-white rounded-lg font-semibold hover:shadow-lg hover:shadow-purple-500/50"
          >
            Back to Explore
          </motion.button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      {/* 3D Scene */}
      <Scene
        enableFreeMove={true}
        sceneParameters={song.sceneParameters}
        modelUrl={song.modelUrl}
        splatUrl={song.splatUrl}
      />

      {/* Cinematic HUD Overlay for Lyrics */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10 overflow-hidden">
        <AnimatePresence>
          {isPlaying && currentLyricIndex >= 0 && song?.lyrics?.[currentLyricIndex] && showLyrics && (
            <motion.div
              key={currentLyricIndex}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: -30, scale: bassScale }}
              exit={{ opacity: 0, y: -60, filter: 'blur(10px)', transition: { duration: 0.5, ease: 'easeOut' } }}
              transition={{
                y: { duration: 6, ease: 'linear' }, // Slow drift upwards
                opacity: { duration: 0.8 },
                scale: { type: 'spring', stiffness: 300, damping: 20 },
              }}
              className="absolute w-full px-8 flex justify-center text-center"
            >
              <h1
                className="text-4xl md:text-5xl lg:text-6xl font-black text-white/90 tracking-widest uppercase max-w-5xl leading-tight"
                style={{
                  textShadow: '0 0 30px rgba(168, 85, 247, 0.8), 0 0 15px rgba(6, 182, 212, 0.6), 2px 2px 0px rgba(0,0,0,1)',
                  fontFamily: '"Inter", sans-serif',
                }}
              >
                {song.lyrics[currentLyricIndex].text}
              </h1>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Cinematic Lore Overlay */}
      <AnimatePresence>
        {song.worldLore && showInsight && (
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            className="absolute top-32 left-6 max-w-sm z-20 pointer-events-none"
          >
            <div className="border-l-4 border-purple-500 pl-4 py-2 bg-gradient-to-r from-black/60 to-transparent pr-4 rounded-r-xl backdrop-blur-sm">
              <h3 className="text-purple-400 font-bold text-xs uppercase tracking-widest mb-2 flex items-center gap-2">
                <Sparkles size={12} />
                World Lore
              </h3>
              <p 
                className="text-white/90 text-sm font-serif leading-relaxed italic" 
                style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}
              >
                "{song.worldLore}"
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hidden audio element — proxied through Next.js rewrite for same-origin AudioContext */}
      <audio
        ref={audioRef}
        src={song.audioUrl.replace(/^https?:\/\/[^/]+/, '')}
        crossOrigin="anonymous"
        preload="auto"
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => {
          setIsPlaying(false);
          setAudioPlaying(false);
        }}
        onLoadedMetadata={() => {
          if (audioRef.current) {
            setDuration(audioRef.current.duration);
            audioRef.current.volume = volume / 100;
          }
        }}
        onError={(e) => {
          console.error('Audio load error:', e);
          toast.error('Failed to load audio');
        }}
      />

      {/* Top Bar */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute top-6 left-6 right-6 z-20 flex items-center justify-between"
      >
        {/* Back Button */}
        <motion.button
          onClick={() => router.push('/explore')}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          className="p-2.5 rounded-lg bg-black/40 backdrop-blur-xl border border-white/20 hover:bg-black/60 text-white transition-all"
        >
          <ArrowLeft size={20} />
        </motion.button>

        {/* Center - Song Info */}
        <div className="text-center hidden sm:block">
          <h2 className="text-white font-bold text-lg truncate max-w-xs">{song.title}</h2>
          <p className="text-white/60 text-sm">{song.artist || 'Unknown Artist'}</p>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          <motion.button
            onClick={handleShare}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            className="p-2.5 rounded-lg bg-black/40 backdrop-blur-xl border border-white/20 hover:bg-black/60 text-white transition-all"
          >
            <Share2 size={20} />
          </motion.button>
          <motion.button
            onClick={handleFavorite}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            className="p-2.5 rounded-lg bg-black/40 backdrop-blur-xl border border-white/20 hover:bg-black/60 text-white transition-all"
          >
            {isFavorited ? (
              <Heart size={20} fill="currentColor" className="text-red-400" />
            ) : (
              <Heart size={20} />
            )}
          </motion.button>
        </div>
      </motion.div>



      {/* Bottom Control Bar */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/80 to-transparent p-6 pt-20 z-20"
      >
        {/* Progress Bar */}
        <div className="mb-6">
          <input
            type="range"
            min="0"
            max={song.duration}
            value={audioRef.current?.currentTime || 0}
            onChange={(e) => {
              if (audioRef.current) {
                audioRef.current.currentTime = parseFloat(e.target.value);
              }
            }}
            className="w-full h-1.5 bg-white/20 rounded-lg cursor-pointer accent-gradient hover:h-2 transition-all"
            style={{
              background: `linear-gradient(to right, rgb(6, 182, 212) 0%, rgb(168, 85, 247) 50%, rgb(236, 72, 153) 100%)`,
            }}
          />
          <div className="flex justify-between text-xs text-white/60 mt-2">
            <span>{formatTime(audioRef.current?.currentTime || 0)}</span>
            <span>{formatTime(song.duration)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between gap-6">
          {/* Left: Play button and info */}
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <motion.button
              onClick={handlePlayPause}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="w-14 h-14 rounded-full bg-gradient-to-r from-cyan-500 to-purple-600 flex items-center justify-center text-white hover:shadow-lg hover:shadow-purple-500/50 transition-all flex-shrink-0"
            >
              {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
            </motion.button>

            <div className="min-w-0">
              <p className="text-white font-semibold truncate">{song.title}</p>
              <p className="text-white/50 text-sm truncate">{song.artist || 'Unknown Artist'}</p>
            </div>
          </div>

          {/* Right: Lyrics and Settings */}
          <div className="flex items-center gap-3">
            {/* Volume Control */}
            <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm px-3 py-2 rounded-lg">
              <Volume2 size={18} className="text-white/60" />
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(e) => {
                  const newVolume = parseInt(e.target.value);
                  setVolume(newVolume);
                  if (audioRef.current) {
                    audioRef.current.volume = newVolume / 100;
                  }
                }}
                className="w-20 h-1.5 bg-white/20 rounded-lg cursor-pointer accent-cyan-500"
              />
              <span className="text-xs text-white/60 w-6">{volume}%</span>
            </div>

            {/* Lyrics Toggle */}
            <motion.button
              onClick={() => setShowLyrics(!showLyrics)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`p-2.5 rounded-lg backdrop-blur-xl border transition-all flex items-center gap-2 px-3 ${
                showLyrics
                  ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                  : 'bg-white/10 border-white/20 text-white/60 hover:bg-white/20'
              }`}
            >
              <BookOpen size={18} />
              <span className="text-sm font-medium hidden sm:inline">Lyrics</span>
            </motion.button>

            {/* Settings */}
            <motion.button
              onClick={() => setShowSettings(!showSettings)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`p-2.5 rounded-lg backdrop-blur-xl border transition-all ${
                showSettings
                  ? 'bg-purple-500/20 border-purple-500/50 text-purple-300'
                  : 'bg-white/10 border-white/20 text-white/60 hover:bg-white/20'
              }`}
            >
              <Settings size={18} />
            </motion.button>

            {/* AI Insight Toggle */}
            {song.visualDescription && (
              <motion.button
                onClick={() => setShowInsight(!showInsight)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={`p-2.5 rounded-lg backdrop-blur-xl border transition-all flex items-center gap-2 px-3 ${
                  showInsight
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                    : 'bg-white/10 border-white/20 text-white/60 hover:bg-white/20'
                }`}
              >
                <Sparkles size={18} />
                <span className="text-sm font-medium hidden sm:inline">Insight</span>
              </motion.button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Lyrics Sidebar */}
      <AnimatePresence>
        {showLyrics && song.lyrics && song.lyrics.length > 0 && (
          <motion.div
            initial={{ x: 400, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 400, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="absolute right-0 top-0 h-full w-80 bg-gradient-to-br from-black/95 to-slate-900/50 border-l border-white/20 overflow-y-auto p-6 backdrop-blur-xl z-10"
          >
            <h2 className="text-2xl font-bold text-white mb-6 sticky top-6 bg-black/50 -mx-6 px-6 py-2 rounded-lg">
              Lyrics
            </h2>

            <div className="space-y-3 pb-32">
              {song.lyrics.map((lyric, idx) => (
                <motion.div
                  key={idx}
                  animate={{
                    scale: idx === currentLyricIndex ? 1.05 : 1,
                    opacity: idx === currentLyricIndex ? 1 : 0.5,
                  }}
                  transition={{ duration: 0.2 }}
                  className={`p-3 rounded-lg transition-all ${
                    idx === currentLyricIndex
                      ? 'bg-gradient-to-r from-cyan-500/30 to-purple-600/30 border border-purple-500/50 shadow-lg shadow-purple-500/20'
                      : 'hover:bg-white/5'
                  }`}
                >
                  <p className="text-white/80 text-sm">{lyric.text}</p>
                  <p className="text-xs text-white/30 mt-1">{formatTime(lyric.timestamp)}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI Insight Panel — Visual Description Overlay */}
      <AnimatePresence>
        {showInsight && song.visualDescription && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="absolute bottom-32 left-6 max-w-lg z-30"
          >
            <div className="relative bg-black/60 backdrop-blur-2xl rounded-2xl border border-white/15 p-6 shadow-2xl shadow-purple-500/10">
              {/* Decorative gradient border glow */}
              <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-br from-cyan-500/20 via-purple-500/20 to-amber-500/20 -z-10 blur-sm" />

              {/* Header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/30">
                  <Sparkles size={18} className="text-white" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-sm tracking-wide">AI Visual Interpretation</h3>
                  <p className="text-white/40 text-xs">Generated by Mistral via Ollama</p>
                </div>
              </div>

              {/* Description */}
              <p className="text-white/80 text-sm leading-relaxed mb-4 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                {song.visualDescription}
              </p>

              {/* Mood + Color Palette */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-gradient-to-r from-purple-500/30 to-cyan-500/30 text-purple-200 text-xs font-semibold rounded-full border border-purple-500/30">
                    {song.mood}
                  </span>
                </div>
                {song.sceneParameters?.colors && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-white/30 text-xs mr-1">Palette</span>
                    {Object.values(song.sceneParameters.colors).map((color: any, i: number) => (
                      <div
                        key={i}
                        className="w-4 h-4 rounded-full border border-white/20 shadow-sm"
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Panel */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ x: -400, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -400, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="absolute left-0 top-0 h-full w-80 bg-gradient-to-br from-black/95 to-slate-900/50 border-r border-white/20 overflow-y-auto p-6 backdrop-blur-xl z-10"
          >
            <h2 className="text-2xl font-bold text-white mb-6">Scene Settings</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-white/70 mb-2">Bloom Intensity</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  defaultValue={song.sceneParameters?.bloomIntensity || 50}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-sm text-white/70 mb-2">Particle Speed</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  defaultValue={song.sceneParameters?.particleSpeed || 50}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-sm text-white/70 mb-2">Audio Reactivity</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  defaultValue={song.sceneParameters?.audioReactivityScale || 50}
                  className="w-full"
                />
              </div>

              <div className="pt-4 border-t border-white/10">
                <p className="text-xs text-white/50">Mood: {song.mood}</p>
                <p className="text-xs text-white/50">Plays: {vision.playCount}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls Hint */}
      <div className="absolute top-24 right-6 text-white/40 text-xs z-20 hidden sm:block text-right pointer-events-none">
        <p><strong>Left Click</strong> to Orbit</p>
        <p><strong>Scroll</strong> to Zoom</p>
        <p><strong>Right Click</strong> to Pan</p>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
