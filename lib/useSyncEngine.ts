'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  getPendingSyncItems,
  getPendingCount,
  updateSyncItemStatus,
  getPendingSales,
  updateSaleQueueStatus,
} from './offlineDB';

export interface SyncEngineState {
  pendingCount: number;
  isSyncing: boolean;
  justSynced: boolean; // true briefly after a successful sync round
}

/**
 * Watches online/offline state and automatically syncs pending
 * IndexedDB queue items to the server when connectivity returns.
 *
 * Handles three queues:
 *  1. syncQueue  — product mutations + customer creates
 *  2. salesQueue — offline sales
 *
 * @param isOnline      - live online status from useOnlineStatus
 * @param onSyncComplete - called after each sync round (use to reload fresh data from API)
 */
export function useSyncEngine(
  isOnline: boolean,
  onSyncComplete: () => void
): SyncEngineState {
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing,    setIsSyncing]    = useState(false);
  const [justSynced,   setJustSynced]   = useState(false);

  // Keep a stable ref to onSyncComplete so we don't re-create sync on every render
  const onSyncCompleteRef = useRef(onSyncComplete);
  useEffect(() => { onSyncCompleteRef.current = onSyncComplete; });

  // Prevent concurrent sync runs
  const isSyncingRef = useRef(false);

  // ── Pending count refresher ─────────────────────────────────────────────────
  const refreshCount = useCallback(async () => {
    try {
      const n = await getPendingCount();
      setPendingCount(n);
    } catch { /* IndexedDB not available in SSR */ }
  }, []);

  // ── Core sync function ──────────────────────────────────────────────────────
  const runSync = useCallback(async () => {
    if (isSyncingRef.current) return;

    let syncItems;
    let saleItems;
    try {
      [syncItems, saleItems] = await Promise.all([
        getPendingSyncItems(),
        getPendingSales(),
      ]);
    } catch {
      return;
    }

    // Nothing pending — just refresh data from server
    if (syncItems.length === 0 && saleItems.length === 0) {
      await refreshCount();
      onSyncCompleteRef.current();
      return;
    }

    isSyncingRef.current = true;
    setIsSyncing(true);

    let anySynced = false;

    // ── 1. Drain syncQueue (products + customer creates) ─────────────────────
    for (const item of syncItems) {
      // Abort if we went offline mid-sync
      if (!navigator.onLine) {
        await updateSyncItemStatus(item.id, 'pending');
        continue;
      }

      try {
        await updateSyncItemStatus(item.id, 'syncing');

        if (item.entity === 'customer' && item.type === 'create') {
          // Customer create: POST directly to /api/customers
          const res = await fetch('/api/customers', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(item.payload),
          });

          if (res.ok || res.status === 409) {
            // 201 Created or 409 Duplicate phone → both mean the customer exists in DB
            await updateSyncItemStatus(item.id, 'synced');
            anySynced = true;
          } else if (res.status >= 500) {
            await updateSyncItemStatus(item.id, 'pending');
          } else {
            await updateSyncItemStatus(item.id, 'failed');
          }
        } else {
          // Product mutations: route through /api/sync
          const res = await fetch('/api/sync', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ operations: [item] }),
          });

          if (res.ok) {
            const data = await res.json();
            const opResult = data?.results?.[0];
            if (opResult?.success !== false) {
              await updateSyncItemStatus(item.id, 'synced');
              anySynced = true;
            } else {
              await updateSyncItemStatus(item.id, 'pending');
            }
          } else if (res.status >= 500) {
            await updateSyncItemStatus(item.id, 'pending');
          } else {
            await updateSyncItemStatus(item.id, 'failed');
          }
        }
      } catch {
        await updateSyncItemStatus(item.id, 'pending');
      }
    }

    // ── 2. Drain salesQueue (offline sales) ──────────────────────────────────
    for (const sale of saleItems) {
      if (!navigator.onLine) {
        await updateSaleQueueStatus(sale.id, 'pending');
        continue;
      }

      try {
        await updateSaleQueueStatus(sale.id, 'syncing');

        const res = await fetch('/api/sales', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(sale.payload),
        });

        if (res.ok) {
          await updateSaleQueueStatus(sale.id, 'synced');
          anySynced = true;
        } else if (res.status >= 500) {
          await updateSaleQueueStatus(sale.id, 'pending');
        } else {
          // 4xx (e.g. 400 bad data) — mark failed, won't auto-retry
          await updateSaleQueueStatus(sale.id, 'failed');
        }
      } catch {
        await updateSaleQueueStatus(sale.id, 'pending');
      }
    }

    isSyncingRef.current = false;
    setIsSyncing(false);
    await refreshCount();

    if (anySynced) {
      setJustSynced(true);
      setTimeout(() => setJustSynced(false), 3500);
      // Reload fresh data from server now that everything is synced
      onSyncCompleteRef.current();
    }
  }, [refreshCount]);

  // ── Trigger sync when coming online ────────────────────────────────────────
  useEffect(() => {
    if (isOnline) {
      runSync();
    } else {
      // Just refresh count when going offline
      refreshCount();
    }
  }, [isOnline, runSync, refreshCount]);

  // ── Poll pending count every 5 s (catches changes from other tabs) ──────────
  useEffect(() => {
    refreshCount();
    const id = setInterval(refreshCount, 5000);
    return () => clearInterval(id);
  }, [refreshCount]);

  return { pendingCount, isSyncing, justSynced };
}
