'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Music, Brain, Palette, Zap, Check, Film } from 'lucide-react';
import { toast } from 'sonner';

interface TransformationLoadingModalProps {
  isOpen: boolean;
  taskId: string;
  songTitle: string;
  onComplete: (songId: string) => void;
}

const STEPS = [
  { id: 'downloading', label: 'Downloading audio', icon: Music, color: 'from-blue-500 to-cyan-500' },
  { id: 'transcribing', label: 'Transcribing lyrics', icon: Brain, color: 'from-purple-500 to-pink-500' },
  { id: 'analyzing', label: 'Analyzing mood', icon: Zap, color: 'from-amber-500 to-orange-500' },
  { id: 'generating', label: 'Generating visuals', icon: Palette, color: 'from-teal-500 to-green-500' },
  { id: 'creating', label: 'Building 3D world', icon: Film, color: 'from-indigo-500 to-blue-500' },
];

export function TransformationLoadingModal({
  isOpen,
  taskId,
  songTitle,
  onComplete,
}: TransformationLoadingModalProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [stepProgress, setStepProgress] = useState(0);
  const [taskStatus, setTaskStatus] = useState('PENDING');
  const [error, setError] = useState('');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);

  // Calculate overall progress
  const totalSteps = STEPS.length;
  const overallProgress = ((currentStepIndex + stepProgress / 100) / totalSteps) * 100;

  // Poll task status - keeps fetching real backend data
  useEffect(() => {
    if (!isOpen || !taskId) return;

    const pollInterval = setInterval(async () => {
      try {
        const token = localStorage.getItem('firebaseToken');
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/songs/task/${taskId}/status`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const data = await response.json();
        setTaskStatus(data.status);

        if (data.status === 'FAILURE') {
          setError(data.error || 'Transformation failed');
          toast.error('Transformation failed');
          clearInterval(pollInterval);
        } else if (data.status === 'SUCCESS') {
          setCurrentStepIndex(STEPS.length);
          setStepProgress(100);
          clearInterval(pollInterval);
          if (data.result?.songId) {
            setTimeout(() => onComplete(data.result.songId), 1500);
          }
        } else if (data.status === 'PROGRESS' && data.result) {
          const result = data.result;
          const stage = result.current_stage ?? 0;
          const progress = result.progress ?? 0;

          setCurrentStepIndex(stage);
          setStepProgress(progress);
        }
      } catch (err) {
        console.error('Error polling task status:', err);
      }
    }, 1000); // Poll every second for smooth updates

    return () => clearInterval(pollInterval);
  }, [isOpen, taskId, onComplete]);

  // Track elapsed time
  useEffect(() => {
    if (!isOpen) return;
    const timer = setInterval(() => {
      setElapsedTime((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  // Show floating badge when minimized
  if (isMinimized && !error && currentStepIndex < STEPS.length) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed bottom-6 right-6 z-40"
      >
        <motion.button
          onClick={() => setIsMinimized(false)}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 rounded-full text-white font-semibold shadow-lg hover:shadow-xl transition-all"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
          >
            <Music size={18} />
          </motion.div>
          <span>{songTitle}</span>
          <motion.div
            animate={{ width: `${overallProgress}%` }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-cyan-300 to-pink-300 rounded-full"
          />
        </motion.button>
      </motion.div>
    );
  }

  const currentStep = STEPS[currentStepIndex];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={() => setIsMinimized(true)}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl flex items-center justify-center p-4 cursor-pointer"
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl"
      >
        {/* Animated background orbs */}
        <div className="absolute inset-0 blur-3xl pointer-events-none">
          <motion.div
            animate={{ x: [0, 40, 0], y: [0, 40, 0] }}
            transition={{ duration: 8, repeat: Infinity }}
            className="absolute -top-32 -right-32 w-80 h-80 bg-cyan-500/10 rounded-full"
          />
          <motion.div
            animate={{ x: [0, -40, 0], y: [0, -40, 0] }}
            transition={{ duration: 10, repeat: Infinity }}
            className="absolute -bottom-32 -left-32 w-80 h-80 bg-purple-500/10 rounded-full"
          />
        </div>

        {/* Main card */}
        <div className="relative bg-gradient-to-br from-white/10 via-white/5 to-transparent backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-2xl">
          {/* Close button */}
          <motion.button
            onClick={() => setIsMinimized(true)}
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.95 }}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-all"
            title="Minimize"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </motion.button>

          {/* Header */}
          <div className="text-center mb-10">
            <motion.div
              animate={{ scale: [1, 1.15, 1], rotate: [0, 5, -5, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="inline-flex items-center justify-center mb-4"
            >
              <div className="relative w-16 h-16">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                  className="absolute inset-0 rounded-full bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 p-1"
                >
                  <div className="w-full h-full rounded-full bg-black/60 flex items-center justify-center">
                    <Music className="w-8 h-8 text-white" />
                  </div>
                </motion.div>
              </div>
            </motion.div>
            <h2 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-2">
              Creating Your Vision
            </h2>
            <p className="text-white/60 truncate max-w-md mx-auto">{songTitle}</p>
          </div>

          {/* Equalizer visualization */}
          <div className="flex items-end justify-center gap-1 mb-8 h-20">
            {Array.from({ length: 12 }).map((_, i) => (
              <motion.div
                key={i}
                animate={{ height: ['10%', '100%', '30%'] }}
                transition={{
                  duration: 0.5 + (i % 3) * 0.2,
                  repeat: Infinity,
                  delay: i * 0.05,
                }}
                className={`flex-1 rounded-full bg-gradient-to-t ${
                  i % 3 === 0
                    ? 'from-cyan-500 to-cyan-300'
                    : i % 3 === 1
                    ? 'from-purple-500 to-purple-300'
                    : 'from-pink-500 to-pink-300'
                }`}
              />
            ))}
          </div>

          {/* Steps grid */}
          <div className="grid grid-cols-5 gap-3 mb-8">
            {STEPS.map((step, idx) => {
              const Icon = step.icon;
              const isActive = idx === currentStepIndex;
              const isComplete = idx < currentStepIndex;

              return (
                <motion.div
                  key={step.id}
                  animate={{
                    scale: isActive ? 1.05 : 1,
                  }}
                  className={`relative flex flex-col items-center p-4 rounded-xl transition-all ${
                    isActive
                      ? `bg-gradient-to-br ${step.color} border border-white/50 shadow-lg`
                      : isComplete
                      ? 'bg-green-500/30 border border-green-500/50'
                      : 'bg-white/5 border border-white/10'
                  }`}
                >
                  <motion.div
                    animate={isActive ? { rotate: 360, scale: [1, 1.2, 1] } : {}}
                    transition={
                      isActive
                        ? { duration: 1.5, repeat: Infinity }
                        : { duration: 0.2 }
                    }
                    className="mb-2"
                  >
                    {isComplete ? (
                      <Check size={24} className="text-green-300" />
                    ) : (
                      <Icon
                        size={24}
                        className={isActive ? 'text-white' : 'text-white/60'}
                      />
                    )}
                  </motion.div>
                  <p
                    className={`text-xs font-semibold text-center leading-tight ${
                      isActive
                        ? 'text-white'
                        : isComplete
                        ? 'text-green-300'
                        : 'text-white/50'
                    }`}
                  >
                    {step.label.split(' ')[0]}
                  </p>
                </motion.div>
              );
            })}
          </div>

          {/* Current step progress */}
          {currentStepIndex < STEPS.length && currentStep && (
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-1">
                  <p className="text-sm text-white/70 font-semibold">
                    {currentStep.label}
                  </p>
                </div>
              </div>

              {/* Progress bar with animation */}
              <div className="h-3 bg-white/10 rounded-full overflow-hidden relative">
                <motion.div
                  animate={{ width: `${stepProgress}%` }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className={`h-full bg-gradient-to-r ${currentStep.color}`}
                >
                  {/* Shimmer effect */}
                  <motion.div
                    animate={{ x: ['-100%', '100%'] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent"
                  />
                </motion.div>
              </div>
              <p className="text-xs text-white/50 mt-2">{stepProgress}% complete</p>
            </div>
          )}

          {/* Overall progress */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-white/70">Overall Progress</p>
              <p className="text-xs font-bold text-cyan-400">{Math.round(overallProgress)}%</p>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden relative">
              <motion.div
                animate={{ width: `${overallProgress}%` }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="h-full bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 relative"
              >
                {/* Shimmer effect */}
                <motion.div
                  animate={{ x: ['-100%', '100%'] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent"
                />
              </motion.div>
            </div>
          </div>

          {/* Completion message */}
          <AnimatePresence>
            {currentStepIndex === STEPS.length ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/50 rounded-xl text-center"
              >
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 0.6 }}
                  className="text-2xl mb-2"
                >
                  ✨
                </motion.div>
                <p className="text-sm text-green-300 font-semibold">
                  Vision Created! Redirecting...
                </p>
              </motion.div>
            ) : error ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-center"
              >
                <p className="text-sm text-red-300 font-semibold">{error}</p>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* Footer */}
          <div className="flex items-center justify-between text-xs text-white/50 mt-4">
            <span>Processing your masterpiece...</span>
            <span className="text-cyan-400 font-semibold">{formatTime(elapsedTime)}</span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
