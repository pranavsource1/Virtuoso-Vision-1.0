'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAuthToken } from '@/lib/api';

interface Vision {
  id: string;
  name: string;
  createdAt: string;
}

export function SideNav() {
  const router = useRouter();
  const [visions, setVisions] = useState<Vision[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchVisions();
  }, []);

  const fetchVisions = async () => {
    try {
      const token = await getAuthToken();
      if (!token) return;

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
    } finally {
      setLoading(false);
    }
  };

  return (
    <aside className="fixed left-0 top-16 w-64 h-[calc(100vh-64px)] bg-black/40 backdrop-blur border-r border-white/10 overflow-y-auto p-4">
      {/* Add New Vision */}
      <button
        onClick={() => router.push('/')}
        className="w-full mb-6 px-4 py-3 bg-gradient-to-r from-cyan-500/20 to-purple-600/20 hover:from-cyan-500/30 hover:to-purple-600/30 border border-cyan-500/50 rounded-lg text-white text-sm font-semibold transition-all"
      >
        + New Vision
      </button>

      {/* Visions List */}
      <div>
        <h3 className="text-xs font-bold text-white/50 uppercase tracking-widest mb-3">My Visions</h3>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-white/5 rounded animate-pulse" />
            ))}
          </div>
        ) : visions.length > 0 ? (
          <div className="space-y-2">
            {visions.map((vision) => (
              <button
                key={vision.id}
                onClick={() => router.push(`/vision/${vision.id}`)}
                className="w-full text-left px-3 py-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors text-sm truncate"
              >
                {vision.name}
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-white/50 text-sm">No visions yet</p>
            <p className="text-white/30 text-xs mt-2">Start by uploading a song!</p>
          </div>
        )}
      </div>
    </aside>
  );
}
