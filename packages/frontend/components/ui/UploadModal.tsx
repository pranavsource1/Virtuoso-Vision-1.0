'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (url: string, title?: string, vibePrompt?: string) => Promise<void>;
}

export function UploadModal({ isOpen, onClose, onSubmit }: UploadModalProps) {
  const [songUrl, setSongUrl] = useState('');
  const [title, setTitle] = useState('');
  const [vibePrompt, setVibePrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const normalizedUrl = songUrl.trim();
    const normalizedTitle = title.trim();

    if (!normalizedUrl) {
      setError('Please enter a song URL');
      return;
    }

    setLoading(true);
    try {
      await onSubmit(normalizedUrl, normalizedTitle || undefined, vibePrompt.trim() || undefined);
      setSongUrl('');
      setTitle('');
      setVibePrompt('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-gradient-to-b from-black/80 to-black border border-white/20 rounded-2xl p-8 w-full max-w-md shadow-2xl"
      >
        <h2 className="text-2xl font-bold text-white mb-6">Transform Your Song</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title Input */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">
              Song Title (optional)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My Amazing Song"
              className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/30 focus:border-cyan-500 focus:outline-none transition-colors"
            />
          </div>

          {/* URL Input */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">
              Song URL
            </label>
            <input
              type="url"
              value={songUrl}
              onChange={(e) => setSongUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=... or Spotify link"
              className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/30 focus:border-cyan-500 focus:outline-none transition-colors"
            />
            <p className="text-xs text-white/40 mt-2">
              Supports YouTube, Spotify, SoundCloud, and more
            </p>
          </div>

          {/* Vibe Prompt Input */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">
              Custom Vibe (Optional)
            </label>
            <input
              type="text"
              value={vibePrompt}
              onChange={(e) => setVibePrompt(e.target.value)}
              placeholder="e.g. Cyberpunk neon city, Ethereal forest..."
              className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/30 focus:border-cyan-500 focus:outline-none transition-colors"
            />
            <p className="text-xs text-white/40 mt-2">
              Describe a vibe to guide the AI world generation
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-white/20 rounded-lg text-white hover:bg-white/5 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-lg text-white font-medium hover:shadow-lg hover:shadow-purple-500/50 disabled:opacity-50 transition-all"
            >
              {loading ? 'Processing...' : 'Transform'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
