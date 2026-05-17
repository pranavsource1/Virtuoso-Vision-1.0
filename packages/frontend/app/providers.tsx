'use client';

import { useEffect } from 'react';
import { Toaster } from 'sonner';
import { initAuthListener } from '@/lib/firebase';

export function Providers({ children }: { children: React.ReactNode }) {
  // Start the Firebase auth state listener once at app startup.
  // This keeps localStorage + cookie in sync whenever the token refreshes or the user signs out.
  useEffect(() => {
    initAuthListener();
  }, []);

  return (
    <>
      {children}
      <Toaster theme="dark" position="top-center" richColors />
    </>
  );
}
