'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { NavBar, UploadModal, TransformationLoadingModal } from '@/components/ui';
import { Scene } from '@/components/3d/Scene';
import { motion } from 'framer-motion';
import { Sparkles, Music, Globe, Zap, ArrowRight, Play } from 'lucide-react';
import { toast } from 'sonner';
import { getAuthToken, uploadSong } from '@/lib/api';
import { auth, setTokenCookie } from '@/lib/firebase';

export default function HomePage() {
  const router = useRouter();
  const [uploadModal, setUploadModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [transformationModal, setTransformationModal] = useState(false);
  const [taskId, setTaskId] = useState('');
  const [songTitle, setSongTitle] = useState('');

  useEffect(() => {
    // Sync current auth state whenever it changes
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        console.log('🔐 User logged in:', user.email);
        const token = await user.getIdToken(true);
        localStorage.setItem('firebaseToken', token);
        localStorage.setItem('userId', user.uid);
        setTokenCookie(token);
        console.log('✅ Token synced to localStorage');
      } else {
        console.log('🔓 User logged out');
        localStorage.removeItem('firebaseToken');
        localStorage.removeItem('userId');
        setTokenCookie(null);
      }
    });

    return unsubscribe;
  }, []);

  const handleUpload = async (url: string, title?: string) => {
    try {
      setSongTitle(title || 'Your Song');
      const { data, error } = await uploadSong(url, title);

      if (error) {
        throw new Error(error);
      }

      // Show transformation loading modal
      setTaskId(data?.taskId || '');
      setTransformationModal(true);
      setUploadModal(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed');
      throw error;
    }
  };

  const handleTransformationComplete = (songId: string) => {
    setTransformationModal(false);
    toast.success('Vision created! Redirecting...');

    // Navigate to explore page where latest vision will be visible
    setTimeout(() => {
      router.push('/explore');
    }, 500);
  };

  const handleStartTransforming = async () => {
    setIsLoading(true);
    try {
      const token = await getAuthToken({ forceRefresh: true });

      if (token) {
        setUploadModal(true);
      } else {
        toast.error('Please sign in first');
        router.push('/login');
      }
    } catch (error) {
      console.error('Authentication error:', error);
      toast.error('Authentication error - please log in again');
      router.push('/login');
    } finally {
      setIsLoading(false);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.3,
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

  const features = [
    {
      icon: <Music className="w-8 h-8" />,
      title: 'Any Song',
      description: 'Upload any audio file and watch it transform instantly',
      gradient: 'from-purple-500 to-pink-500',
    },
    {
      icon: <Globe className="w-8 h-8" />,
      title: 'Live 3D Worlds',
      description: 'Audio-reactive environments that pulse with your music',
      gradient: 'from-cyan-500 to-blue-500',
    },
    {
      icon: <Zap className="w-8 h-8" />,
      title: 'Immersive Experience',
      description: 'Explore and interact with your music like never before',
      gradient: 'from-pink-500 to-yellow-500',
    },
  ];

  return (
    <div className="relative w-full min-h-screen bg-black overflow-hidden">
      {/* 3D Canvas Background */}
      <Scene enablePointerLock={false} />

      {/* Navigation */}
      <NavBar />

      {/* Hero Content */}
      <main className="relative z-10">
        {/* Hero Section */}
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
          className="min-h-screen flex items-center justify-center px-4 pt-20"
        >
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="text-center max-w-4xl"
          >
            {/* Badge */}
            <motion.div
              variants={itemVariants}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-500/30 mb-6"
            >
              <Sparkles size={16} className="text-cyan-400" />
              <span className="text-sm text-cyan-300">AI-Powered Music Visualization</span>
            </motion.div>

            {/* Main Title */}
            <motion.h1
              variants={itemVariants}
              className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 leading-tight"
            >
              <span className="bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                Transform Music Into
              </span>
              <br />
              <span className="bg-gradient-to-r from-pink-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
                Infinite Worlds
              </span>
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              variants={itemVariants}
              className="text-lg sm:text-xl text-white/70 mb-12 max-w-2xl mx-auto leading-relaxed"
            >
              Upload any song and watch it transform into an interactive, audio-reactive 3D world you can explore
              in real-time. Experience music in a completely new dimension.
            </motion.p>

            {/* CTA Button */}
            <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              <motion.button
                onClick={handleStartTransforming}
                disabled={isLoading}
                whileHover={{ scale: isLoading ? 1 : 1.05 }}
                whileTap={{ scale: isLoading ? 1 : 0.95 }}
                className="px-8 py-4 bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 rounded-2xl text-white font-bold text-lg hover:shadow-2xl hover:shadow-purple-500/50 transition-all flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <motion.span
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity }}
                    >
                      ⚙️
                    </motion.span>
                    Authenticating...
                  </>
                ) : (
                  <>
                    <Play size={20} />
                    Start Transforming
                    <motion.span
                      animate={{ x: [0, 4, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      →
                    </motion.span>
                  </>
                )}
              </motion.button>

              <motion.button
                onClick={() => router.push('/explore')}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-8 py-4 border-2 border-white/20 rounded-2xl text-white font-bold text-lg hover:bg-white/5 hover:border-cyan-500/50 transition-all flex items-center justify-center gap-2"
              >
                <Music size={20} />
                Explore Visions
              </motion.button>
            </motion.div>

            {/* Scroll Indicator */}
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="flex justify-center mt-8"
            >
              <div className="text-white/40 text-sm">Scroll to explore features</div>
            </motion.div>
          </motion.div>
        </motion.section>

        {/* Features Section */}
        <section className="relative z-10 py-20 px-4 bg-gradient-to-b from-transparent via-purple-950/20 to-transparent">
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            className="max-w-6xl mx-auto"
          >
            {/* Section Title */}
            <motion.div variants={itemVariants} className="text-center mb-16">
              <h2 className="text-4xl sm:text-5xl font-bold mb-4">
                <span className="bg-gradient-to-r from-cyan-400 to-purple-600 bg-clip-text text-transparent">
                  Powerful Features
                </span>
              </h2>
              <p className="text-xl text-white/60">Everything you need for an immersive music experience</p>
            </motion.div>

            {/* Features Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {features.map((feature, idx) => (
                <motion.div
                  key={idx}
                  variants={itemVariants}
                  whileHover={{ scale: 1.05, y: -5 }}
                  className="group relative"
                >
                  {/* Glow effect */}
                  <div
                    className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} rounded-2xl blur-xl opacity-0 group-hover:opacity-40 transition-all duration-300`}
                  />

                  {/* Card */}
                  <div className="relative bg-gradient-to-br from-white/5 to-white/0 border border-white/10 group-hover:border-white/20 backdrop-blur-xl rounded-2xl p-8 transition-all duration-300">
                    {/* Icon */}
                    <motion.div
                      whileHover={{ rotate: 360 }}
                      transition={{ duration: 0.6 }}
                      className={`w-16 h-16 rounded-xl bg-gradient-to-br ${feature.gradient} p-3 mb-6 text-white shadow-lg shadow-purple-500/20 group-hover:shadow-purple-500/50 transition-all`}
                    >
                      {feature.icon}
                    </motion.div>

                    {/* Content */}
                    <h3 className="text-2xl font-bold text-white mb-3">{feature.title}</h3>
                    <p className="text-white/60 mb-4">{feature.description}</p>

                    {/* Arrow */}
                    <motion.div
                      animate={{ x: [0, 4, 0] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="text-cyan-400"
                    >
                      <ArrowRight size={20} />
                    </motion.div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </section>

        {/* CTA Section */}
        <section className="relative z-10 py-20 px-4 mb-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="max-w-2xl mx-auto text-center"
          >
            <div className="bg-gradient-to-br from-cyan-500/10 to-purple-600/10 border border-white/20 backdrop-blur-xl rounded-3xl p-12">
              <h2 className="text-4xl font-bold text-white mb-6">Ready to Transform?</h2>
              <p className="text-xl text-white/60 mb-8">
                Join thousands of users creating stunning music visualizations today
              </p>
              <motion.button
                onClick={handleStartTransforming}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-8 py-4 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-xl text-white font-bold text-lg hover:shadow-2xl hover:shadow-purple-500/50 transition-all inline-flex items-center gap-2"
              >
                <Sparkles size={20} />
                Start Your Vision
              </motion.button>
            </div>
          </motion.div>
        </section>
      </main>

      {/* Upload Modal */}
      <UploadModal
        isOpen={uploadModal}
        onClose={() => setUploadModal(false)}
        onSubmit={handleUpload}
      />

      {/* Transformation Loading Modal */}
      <TransformationLoadingModal
        isOpen={transformationModal}
        taskId={taskId}
        songTitle={songTitle}
        onComplete={handleTransformationComplete}
      />
    </div>
  );
}
