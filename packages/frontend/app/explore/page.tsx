'use client';

import React, { useEffect, useState } from 'react';
import { NavBar } from '@/components/ui';
import { motion } from 'framer-motion';
import { Search, Heart, Play, Music, Flame, Clock, Grid, List, Loader } from 'lucide-react';
import { toast } from 'sonner';
import { getAuthToken } from '@/lib/api';

interface Vision {
  id: string;
  name: string;
  thumbnail?: string;
  playCount: number;
  favorited: boolean;
  createdAt: string;
  mood?: string;
}

type SortOption = 'newest' | 'trending' | 'favorites';

export default function ExplorePage() {
  const [visions, setVisions] = useState<Vision[]>([]);
  const [filteredVisions, setFilteredVisions] = useState<Vision[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [creatingData, setCreatingData] = useState(false);

  useEffect(() => {
    fetchVisions();
  }, []);

  useEffect(() => {
    filterAndSortVisions();
  }, [visions, searchQuery, sortBy]);

  const fetchVisions = async () => {
    try {
      const token = await getAuthToken();
      if (!token) {
        toast.error('Please log in to view your visions');
        return;
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/visions/user/all`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setVisions(data.visions || []);
      }
    } catch (error) {
      console.error('Failed to fetch visions:', error);
      toast.error('Failed to load visions');
    } finally {
      setLoading(false);
    }
  };

  const createSampleData = async () => {
    setCreatingData(true);
    try {
      console.log('🔐 Getting fresh Firebase token...');

      const token = await getAuthToken({ forceRefresh: true });
      if (!token) {
        toast.error('Not authenticated. Please log in first.');
        return;
      }

      // 1. Create sample song
      console.log('📝 Creating sample song with token...');
      const songRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/songs/debug/create-sample`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
      });

      console.log('🎵 Song response status:', songRes.status);
      const songText = await songRes.text();
      console.log('🎵 Song response body:', songText);

      if (!songRes.ok) {
        throw new Error(`Backend error (${songRes.status}): ${songText}`);
      }

      const songData = JSON.parse(songText);
      console.log('✅ Song created:', songData.songId);
      toast.success('Sample song created!');

      // 2. Create sample vision
      console.log('🎨 Creating sample vision...');
      const visionRes = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/visions/debug/create-sample?song_id=${songData.songId}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
        }
      );

      console.log('🎨 Vision response status:', visionRes.status);
      const visionText = await visionRes.text();
      console.log('🎨 Vision response body:', visionText);

      if (!visionRes.ok) {
        throw new Error(`Backend error (${visionRes.status}): ${visionText}`);
      }

      const visionData = JSON.parse(visionText);
      console.log('✅ Vision created:', visionData.visionId);
      toast.success('Sample vision created! Redirecting...');

      // Redirect to vision
      setTimeout(() => {
        window.location.href = `/vision/${visionData.visionId}`;
      }, 1000);
    } catch (error: any) {
      console.error('❌ Error:', error);
      toast.error(error.message || 'Failed to create sample data');
    } finally {
      setCreatingData(false);
    }
  };

  const filterAndSortVisions = () => {
    let filtered = [...visions];

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter(
        (vision) =>
          vision.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (vision.mood && vision.mood.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    // Sort
    if (sortBy === 'trending') {
      filtered.sort((a, b) => b.playCount - a.playCount);
    } else if (sortBy === 'favorites') {
      filtered.sort((a, b) => (b.favorited ? 1 : 0) - (a.favorited ? 1 : 0));
    } else {
      filtered.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }

    setFilteredVisions(filtered);
    console.log('Filtered Visions:', filtered);
  };

  const handleToggleFavorite = async (visionId: string, currentFavorited: boolean) => {
    try {
      const token = await getAuthToken();
      if (!token) {
        toast.error('Please log in to update favorites');
        return;
      }

      const newFavorited = !currentFavorited;

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/visions/${visionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ favorited: newFavorited }),
      });

      if (response.ok) {
        setVisions((prev) =>
          prev.map((v) => (v.id === visionId ? { ...v, favorited: newFavorited } : v))
        );
        toast.success(newFavorited ? 'Added to favorites' : 'Removed from favorites');
      }
    } catch (error) {
      console.error('Failed to update favorite:', error);
      toast.error('Failed to update favorite');
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: 'spring', stiffness: 100 },
    },
  };

  return (
    <div className="relative w-full min-h-screen bg-gradient-to-b from-slate-950 via-black to-slate-950">
      <NavBar />

      {/* Background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 right-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />
      </div>

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-12"
        >
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
            <div>
              <h1 className="text-4xl sm:text-5xl font-bold mb-2">
                <span className="bg-gradient-to-r from-cyan-400 to-purple-600 bg-clip-text text-transparent">
                  Your Visions
                </span>
              </h1>
              <p className="text-white/60">
                {filteredVisions.length} vision{filteredVisions.length !== 1 ? 's' : ''} total
              </p>
            </div>
          </div>
        </motion.div>

        {/* Search and Filter Bar */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mb-8 space-y-4"
        >
          <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" size={20} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search your visions..."
                className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/40 focus:border-cyan-500 focus:bg-white/10 focus:outline-none transition-all focus:ring-2 focus:ring-cyan-500/30"
              />
            </div>

            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/30 transition-all cursor-pointer"
            >
              <option value="newest">Newest</option>
              <option value="trending">Trending</option>
              <option value="favorites">Favorites</option>
            </select>

            {/* View Mode Toggle */}
            <div className="flex gap-2 bg-white/5 border border-white/20 rounded-xl p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`px-4 py-2 rounded-lg transition-all ${
                  viewMode === 'grid'
                    ? 'bg-gradient-to-r from-cyan-500 to-purple-600 text-white'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <Grid size={20} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-4 py-2 rounded-lg transition-all ${
                  viewMode === 'list'
                    ? 'bg-gradient-to-r from-cyan-500 to-purple-600 text-white'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <List size={20} />
              </button>
            </div>
          </div>
        </motion.div>

        {/* Content */}
        {loading ? (
          // Skeleton Loading
          <div className={`grid gap-6 ${viewMode === 'grid' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : ''}`}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className={`h-64 bg-gradient-to-br from-white/5 to-white/0 rounded-xl border border-white/10 animate-pulse ${
                  viewMode === 'list' ? 'flex items-center gap-4 p-4' : ''
                }`}
              />
            ))}
          </div>
        ) : filteredVisions.length > 0 ? (
          <div
            className={`grid gap-6 ${viewMode === 'grid' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'}`}
          >
            {filteredVisions.map((vision) => (
              <div
                key={vision.id}
                className={viewMode === 'grid' ? 'group cursor-pointer' : ''}
              >
                {viewMode === 'grid' ? (
                  // Grid View Card
                  <div className="relative h-64 bg-gradient-to-br from-white/5 to-white/0 rounded-xl overflow-hidden border border-white/10 group-hover:border-cyan-500/50 transition-all shadow-xl">
                    {vision.thumbnail && (
                      <img
                        src={vision.thumbnail}
                        alt={vision.name}
                        className="w-full h-full object-cover"
                      />
                    )}

                    {/* Gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col items-start justify-between p-4">
                      {/* Top: Mood badge */}
                      {vision.mood && (
                        <div className="flex gap-2 flex-wrap">
                          <span className="px-3 py-1 bg-purple-500/80 text-purple-100 text-xs font-semibold rounded-full backdrop-blur-sm">
                            {vision.mood}
                          </span>
                        </div>
                      )}

                      {/* Bottom: Actions */}
                      <div className="w-full flex gap-2">
                        <motion.button
                          onClick={(e) => {
                            e.stopPropagation();
                            window.location.href = `/vision/${vision.id}`;
                          }}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-lg text-white text-sm font-semibold hover:shadow-lg transition-all flex items-center justify-center gap-2"
                        >
                          <Play size={14} />
                          Play
                        </motion.button>
                        <motion.button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleFavorite(vision.id, vision.favorited);
                          }}
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          className="px-4 py-2 bg-white/10 rounded-lg text-white hover:bg-white/20 transition-all"
                        >
                          {vision.favorited ? (
                            <Heart size={18} fill="currentColor" className="text-red-400" />
                          ) : (
                            <Heart size={18} className="text-white/60" />
                          )}
                        </motion.button>
                      </div>
                    </div>

                    {/* Stats - always visible */}
                    <div className="absolute top-4 right-4 flex flex-col gap-2">
                      <div className="flex items-center gap-1 px-2 py-1 bg-black/50 backdrop-blur-sm rounded-lg text-white/80 text-xs">
                        <Play size={12} />
                        {vision.playCount}
                      </div>
                    </div>

                    {/* Title - bottom left when not hovered */}
                    <div className="absolute bottom-4 left-4 right-4 group-hover:hidden">
                      <h3 className="text-white font-semibold truncate text-lg">{vision.name}</h3>
                    </div>
                  </div>
                ) : (
                  // List View Card
                  <div className="flex items-center gap-4 p-4 bg-gradient-to-br from-white/5 to-white/0 border border-white/10 rounded-xl hover:border-cyan-500/50 transition-all group cursor-pointer">
                    {/* Thumbnail */}
                    <div className="w-24 h-24 rounded-lg overflow-hidden flex-shrink-0 bg-gradient-to-br from-cyan-500/20 to-purple-600/20">
                      {vision.thumbnail ? (
                        <img
                          src={vision.thumbnail}
                          alt={vision.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Music size={32} className="text-white/30" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-white mb-2">{vision.name}</h3>
                      <div className="flex flex-wrap gap-2 items-center">
                        {vision.mood && (
                          <span className="px-2 py-1 bg-purple-500/30 text-purple-300 text-xs rounded-full">
                            {vision.mood}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-white/60 text-sm">
                          <Flame size={14} />
                          {vision.playCount} plays
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3">
                      <motion.button
                        onClick={() => handleToggleFavorite(vision.id, vision.favorited)}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                      >
                        {vision.favorited ? (
                          <Heart size={20} fill="currentColor" className="text-red-400" />
                        ) : (
                          <Heart size={20} className="text-white/40 hover:text-white/60" />
                        )}
                      </motion.button>
                      <motion.button
                        onClick={() => (window.location.href = `/vision/${vision.id}`)}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-lg text-white text-sm font-semibold hover:shadow-lg transition-all flex items-center gap-2"
                      >
                        <Play size={14} />
                        Play
                      </motion.button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          // Empty State
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-20"
          >
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-cyan-500/20 to-purple-600/20 flex items-center justify-center mb-6">
              <Music size={40} className="text-white/40" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">No visions yet</h3>
            <p className="text-white/60 mb-8">Create a test vision to see the 3D visualization in action</p>
            <div className="flex flex-col sm:flex-row gap-4">
              <motion.button
                onClick={createSampleData}
                disabled={creatingData}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-8 py-3 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-xl text-white font-semibold hover:shadow-lg hover:shadow-purple-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {creatingData ? (
                  <>
                    <span className="animate-spin">⚙️</span>
                    Creating Sample...
                  </>
                ) : (
                  <>
                    ✨ Create Sample Vision
                  </>
                )}
              </motion.button>
              <motion.button
                onClick={() => window.location.href = '/'}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-8 py-3 bg-white/10 border border-white/20 rounded-xl text-white font-semibold hover:bg-white/20 transition-all"
              >
                Upload Your Own
              </motion.button>
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}
