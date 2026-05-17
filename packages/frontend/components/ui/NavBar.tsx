'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, LogOut, Home, Compass, User, Settings } from 'lucide-react';

export function NavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);

  React.useEffect(() => {
    const token = localStorage.getItem('firebaseToken');
    setIsAuthenticated(!!token);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('firebaseToken');
    localStorage.removeItem('userId');
    setShowUserMenu(false);
    setIsOpen(false);
    router.push('/login');
  };

  const navLinks = [
    { href: '/', label: 'Home', icon: <Home size={18} /> },
    { href: '/explore', label: 'Explore', icon: <Compass size={18} /> },
  ];

  const userMenuItems = [
    { label: 'Profile', icon: <User size={18} />, onClick: () => {} },
    { label: 'Settings', icon: <Settings size={18} />, onClick: () => {} },
    { label: 'Sign Out', icon: <LogOut size={18} />, onClick: handleLogout, danger: true },
  ];

  const isHomePage = pathname === '/';
  const isAuthPage = pathname === '/login' || pathname === '/signup';

  if (isAuthPage) {
    return null;
  }

  return (
    <>
      {/* Desktop NavBar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-b from-black/80 via-black/50 to-transparent backdrop-blur-lg border-b border-white/10 hidden md:block">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <motion.div
              whileHover={{ scale: 1.1, rotate: 360 }}
              transition={{ duration: 0.6 }}
              className="w-10 h-10 bg-gradient-to-br from-cyan-400 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/20 group-hover:shadow-purple-500/50 transition-all"
            >
              <span className="text-lg font-bold text-white">♪</span>
            </motion.div>
            <span className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-purple-600 bg-clip-text text-transparent">
              Virtuoso
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-white/70 hover:text-white transition-colors text-sm font-medium flex items-center gap-2 group"
              >
                <motion.span
                  className="text-cyan-400/0 group-hover:text-cyan-400"
                  whileHover={{ scale: 1.2 }}
                >
                  {link.icon}
                </motion.span>
                {link.label}
              </Link>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-4">
            {isAuthenticated ? (
              <div className="relative">
                <motion.button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  whileHover={{ scale: 1.05 }}
                  className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center text-white font-bold hover:shadow-lg hover:shadow-purple-500/50 transition-all"
                >
                  U
                </motion.button>

                <AnimatePresence>
                  {showUserMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: -10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className="absolute right-0 mt-2 w-48 bg-gradient-to-br from-slate-900/95 to-slate-900/80 border border-white/20 backdrop-blur-xl rounded-2xl shadow-2xl overflow-hidden"
                    >
                      {userMenuItems.map((item, idx) => (
                        <motion.button
                          key={idx}
                          onClick={item.onClick}
                          whileHover={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}
                          className={`w-full px-4 py-3 text-left flex items-center gap-3 text-sm font-medium transition-colors ${
                            item.danger
                              ? 'text-red-400 hover:text-red-300'
                              : 'text-white/70 hover:text-white'
                          }`}
                        >
                          {item.icon}
                          {item.label}
                        </motion.button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <>
                <Link
                  href="/login"
                  className="px-4 py-2 text-sm font-medium text-white hover:text-cyan-400 transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  href="/signup"
                  className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-lg text-white text-sm font-semibold hover:shadow-lg hover:shadow-purple-500/50 transition-all"
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile NavBar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-b from-black/80 to-transparent backdrop-blur-lg border-b border-white/10 md:hidden">
        <div className="px-4 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-cyan-400 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-sm font-bold text-white">♪</span>
            </div>
            <span className="text-lg font-bold bg-gradient-to-r from-cyan-400 to-purple-600 bg-clip-text text-transparent">
              Virtuoso
            </span>
          </Link>

          {/* Menu Toggle */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="text-white hover:text-cyan-400 transition-colors"
          >
            {isOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-black/95 backdrop-blur-lg border-b border-white/10"
            >
              <div className="px-4 py-4 space-y-2">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setIsOpen(false)}
                    className="block px-4 py-2.5 text-white/70 hover:text-white hover:bg-white/5 rounded-lg transition-all flex items-center gap-2"
                  >
                    {link.icon}
                    {link.label}
                  </Link>
                ))}

                <div className="border-t border-white/10 my-2 pt-2">
                  {isAuthenticated ? (
                    <button
                      onClick={handleLogout}
                      className="w-full px-4 py-2.5 text-left text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-all flex items-center gap-2 text-sm font-medium"
                    >
                      <LogOut size={18} />
                      Sign Out
                    </button>
                  ) : (
                    <>
                      <Link
                        href="/login"
                        onClick={() => setIsOpen(false)}
                        className="block px-4 py-2.5 text-white/70 hover:text-white hover:bg-white/5 rounded-lg transition-all text-sm font-medium"
                      >
                        Sign In
                      </Link>
                      <Link
                        href="/signup"
                        onClick={() => setIsOpen(false)}
                        className="block px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-purple-600 text-white rounded-lg transition-all text-sm font-medium mt-2"
                      >
                        Sign Up
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Spacer */}
      <div className="h-16" />
    </>
  );
}
