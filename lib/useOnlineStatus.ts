'use client';

import { useState, useEffect } from 'react';

/**
 * Reactively tracks browser online/offline state.
 * Uses both navigator.onLine and window online/offline events for reliability.
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const setOnline  = () => setIsOnline(true);
    const setOffline = () => setIsOnline(false);

    window.addEventListener('online',  setOnline);
    window.addEventListener('offline', setOffline);

    // Sync with current state in case it changed before the effect ran
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online',  setOnline);
      window.removeEventListener('offline', setOffline);
    };
  }, []);

  return isOnline;
}
