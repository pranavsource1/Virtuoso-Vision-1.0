'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Mail, Lock, User, Loader, Check } from 'lucide-react';
import { createUserWithEmailAndPassword, updateProfile, signInWithPopup } from 'firebase/auth';
import { toast } from 'sonner';
import { auth, googleProvider, setTokenCookie } from '@/lib/firebase';

function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  if (!password) return { score: 0, label: '', color: '' };

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z\d]/.test(password)) score++;

  if (score <= 1) return { score, label: 'Weak', color: 'text-red-400' };
  if (score <= 3) return { score, label: 'Fair', color: 'text-yellow-400' };
  return { score, label: 'Strong', color: 'text-green-400' };
}

export default function SignupPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const passwordStrength = useMemo(() => getPasswordStrength(password), [password]);
  const passwordsMatch = password === confirmPassword && password.length > 0;

  const handlePostAuth = async (token: string, userEmail: string, userName: string) => {
    localStorage.setItem('firebaseToken', token);
    setTokenCookie(token);

    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: userEmail,
          displayName: userName,
        }),
      });
    } catch (err) {
      console.warn('Backend registration failed, but user created in Firebase');
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!displayName.trim()) {
      setError('Please enter your name');
      toast.error('Please enter your name');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      toast.error('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      toast.error('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(userCredential.user, {
        displayName: displayName,
      });

      const token = await userCredential.user.getIdToken();
      localStorage.setItem('userId', userCredential.user.uid);
      await handlePostAuth(token, email, displayName);

      toast.success('Welcome to VirtuosoVision!');
      router.push('/explore');
    } catch (err: any) {
      let errorMsg = err.message || 'Failed to create account';
      if (err.code === 'auth/email-already-in-use') {
        errorMsg = 'This email is already registered. Try signing in instead.';
      } else if (err.code === 'auth/weak-password') {
        errorMsg = 'Password is too weak. Use at least 6 characters.';
      } else if (err.code === 'auth/invalid-email') {
        errorMsg = 'Please enter a valid email address.';
      }
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    setError('');
    setGoogleLoading(true);

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const token = await result.user.getIdToken();
      localStorage.setItem('userId', result.user.uid);
      await handlePostAuth(
        token,
        result.user.email || '',
        result.user.displayName || 'User'
      );

      toast.success('Welcome to VirtuosoVision!');
      router.push('/explore');
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') {
        return; // User closed the popup, no error needed
      }
      const errorMsg = err.message || 'Google sign-up failed';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setGoogleLoading(false);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
        delayChildren: 0.15,
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
    <div className="relative w-full min-h-screen bg-gradient-to-br from-slate-950 via-purple-950/20 to-slate-950 flex items-center justify-center overflow-hidden py-8">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{
            x: [0, 50, 0],
            y: [0, 30, 0],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 rounded-full blur-3xl"
        />
        <motion.div
          animate={{
            x: [0, -50, 0],
            y: [0, -30, 0],
          }}
          transition={{ duration: 25, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-full blur-3xl"
        />
      </div>

      {/* Card */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10 w-full max-w-md mx-4"
      >
        {/* Glow effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 to-purple-600/20 rounded-3xl blur-2xl opacity-40" />

        <motion.div
          variants={itemVariants}
          className="relative bg-gradient-to-br from-slate-900/80 via-slate-900/60 to-slate-900/40 border border-white/20 backdrop-blur-xl rounded-3xl p-8 shadow-2xl"
        >
          {/* Header */}
          <motion.div variants={itemVariants} className="text-center mb-6">
            <motion.div
              whileHover={{ scale: 1.05 }}
              className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-purple-600 mb-4 shadow-lg shadow-purple-500/20"
            >
              <span className="text-2xl">🎨</span>
            </motion.div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-2">
              Join Us
            </h1>
            <p className="text-white/60">Create your VirtuosoVision account</p>
          </motion.div>

          {/* Google Sign Up Button */}
          <motion.div variants={itemVariants} className="mb-5">
            <button
              type="button"
              onClick={handleGoogleSignup}
              disabled={googleLoading || loading}
              className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white font-semibold hover:bg-white/10 hover:border-white/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-3 group"
            >
              {googleLoading ? (
                <>
                  <Loader size={18} className="animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  Continue with Google
                </>
              )}
            </button>
          </motion.div>

          {/* Divider */}
          <motion.div variants={itemVariants} className="relative mb-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/20" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-slate-900/80 text-white/50">or sign up with email</span>
            </div>
          </motion.div>

          {/* Form */}
          <motion.form variants={itemVariants} onSubmit={handleSignup} className="space-y-4">
            {/* Display Name */}
            <motion.div variants={itemVariants}>
              <label className="block text-sm font-medium text-white/80 mb-2 flex items-center gap-2">
                <User size={16} className="text-cyan-400" />
                Full Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="John Doe"
                className="w-full px-4 py-2.5 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/30 focus:border-cyan-500 focus:bg-white/10 focus:outline-none transition-all duration-300 focus:ring-2 focus:ring-cyan-500/30"
                required
              />
            </motion.div>

            {/* Email Input */}
            <motion.div variants={itemVariants}>
              <label className="block text-sm font-medium text-white/80 mb-2 flex items-center gap-2">
                <Mail size={16} className="text-purple-400" />
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-2.5 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/30 focus:border-purple-500 focus:bg-white/10 focus:outline-none transition-all duration-300 focus:ring-2 focus:ring-purple-500/30"
                required
              />
            </motion.div>

            {/* Password Input */}
            <motion.div variants={itemVariants}>
              <label className="block text-sm font-medium text-white/80 mb-2 flex items-center gap-2">
                <Lock size={16} className="text-pink-400" />
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/30 focus:border-pink-500 focus:bg-white/10 focus:outline-none transition-all duration-300 focus:ring-2 focus:ring-pink-500/30"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/80 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {password && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(passwordStrength.score / 5) * 100}%` }}
                      transition={{ duration: 0.3 }}
                      className={`h-full ${
                        passwordStrength.score <= 1
                          ? 'bg-red-500'
                          : passwordStrength.score <= 3
                          ? 'bg-yellow-500'
                          : 'bg-green-500'
                      }`}
                    />
                  </div>
                  <span className={`text-xs font-medium ${passwordStrength.color}`}>
                    {passwordStrength.label}
                  </span>
                </div>
              )}
            </motion.div>

            {/* Confirm Password */}
            <motion.div variants={itemVariants}>
              <label className="block text-sm font-medium text-white/80 mb-2 flex items-center gap-2">
                <Lock size={16} className="text-green-400" />
                Confirm Password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/30 focus:border-green-500 focus:bg-white/10 focus:outline-none transition-all duration-300 focus:ring-2 focus:ring-green-500/30"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/80 transition-colors"
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {confirmPassword && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`mt-2 text-xs flex items-center gap-1 ${
                    passwordsMatch ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  {passwordsMatch ? (
                    <>
                      <Check size={14} />
                      Passwords match
                    </>
                  ) : (
                    <>
                      <span>✕</span>
                      Passwords do not match
                    </>
                  )}
                </motion.div>
              )}
            </motion.div>

            {/* Error Message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-3 bg-gradient-to-br from-red-500/20 to-red-600/20 border border-red-500/50 rounded-xl backdrop-blur-sm"
              >
                <p className="text-xs text-red-300 flex items-center gap-2">
                  <span>✕</span>
                  {error}
                </p>
              </motion.div>
            )}

            {/* Sign Up Button */}
            <motion.button
              variants={itemVariants}
              type="submit"
              disabled={loading || googleLoading}
              whileHover={{ scale: loading ? 1 : 1.02 }}
              whileTap={{ scale: loading ? 1 : 0.98 }}
              className="w-full px-4 py-3 bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 rounded-xl text-white font-semibold hover:shadow-lg hover:shadow-purple-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all mt-4 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader size={18} className="animate-spin" />
                  Creating account...
                </>
              ) : (
                <>
                  Create Account
                  <motion.span
                    animate={{ x: [0, 4, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    →
                  </motion.span>
                </>
              )}
            </motion.button>
          </motion.form>

          {/* Divider */}
          <motion.div variants={itemVariants} className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/20" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2 bg-slate-900/80 text-white/50">Already have an account?</span>
            </div>
          </motion.div>

          {/* Sign In Link */}
          <motion.div variants={itemVariants}>
            <Link
              href="/login"
              className="block w-full px-4 py-2.5 border border-white/20 rounded-xl text-white font-semibold text-center text-sm hover:bg-white/5 hover:border-cyan-500/50 transition-all"
            >
              Sign In
            </Link>
          </motion.div>
        </motion.div>

        {/* Footer */}
        <motion.p variants={itemVariants} className="text-center text-white/40 text-xs mt-6">
          By signing up you agree to our Terms of Service
        </motion.p>
      </motion.div>
    </div>
  );
}
