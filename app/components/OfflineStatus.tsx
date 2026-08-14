'use client';

interface OfflineStatusProps {
  isOnline:     boolean;
  pendingCount: number;
  isSyncing:    boolean;
  justSynced:   boolean;
}

/**
 * Small status indicator displayed in the Header.
 * Replaces the static "MongoDB Synced" badge with a live online/offline/sync indicator.
 */
export default function OfflineStatus({
  isOnline,
  pendingCount,
  isSyncing,
  justSynced,
}: OfflineStatusProps) {

  // ── Syncing in progress ─────────────────────────────────────────────────────
  if (isOnline && isSyncing) {
    return (
      <div className="hidden items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 sm:flex dark:border-blue-900/40 dark:bg-blue-950/20 transition-all duration-300">
        <svg
          className="h-3 w-3 animate-spin text-blue-500"
          fill="none" viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
        <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-400">
          Syncing {pendingCount > 0 ? `${pendingCount} change${pendingCount !== 1 ? 's' : ''}` : ''}…
        </span>
      </div>
    );
  }

  // ── Just synced (brief flash) ───────────────────────────────────────────────
  if (isOnline && justSynced && pendingCount === 0) {
    return (
      <div className="hidden items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 sm:flex dark:border-emerald-900/50 dark:bg-emerald-950/20 transition-all duration-300">
        <svg className="h-3 w-3 text-emerald-500" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
        <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
          All synced ✓
        </span>
      </div>
    );
  }

  // ── Online, nothing pending ─────────────────────────────────────────────────
  if (isOnline && pendingCount === 0) {
    return (
      <div className="hidden items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 sm:flex dark:border-emerald-900/50 dark:bg-emerald-950/20">
        <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
        <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
          MongoDB Synced
        </span>
      </div>
    );
  }

  // ── Online but has unsynced pending items ───────────────────────────────────
  if (isOnline && pendingCount > 0) {
    return (
      <div className="hidden items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 sm:flex dark:border-amber-900/40 dark:bg-amber-950/20">
        <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
          {pendingCount} pending
        </span>
      </div>
    );
  }

  // ── Offline with pending changes ────────────────────────────────────────────
  if (!isOnline && pendingCount > 0) {
    return (
      <div className="hidden items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 sm:flex dark:border-rose-900/40 dark:bg-rose-950/20">
        <div className="h-1.5 w-1.5 rounded-full bg-rose-500" />
        <span className="text-[11px] font-semibold text-rose-700 dark:text-rose-400">
          Offline · {pendingCount} pending
        </span>
      </div>
    );
  }

  // ── Offline, nothing pending ────────────────────────────────────────────────
  return (
    <div className="hidden items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 sm:flex dark:border-rose-900/40 dark:bg-rose-950/20">
      <div className="h-1.5 w-1.5 rounded-full bg-rose-500" />
      <span className="text-[11px] font-semibold text-rose-700 dark:text-rose-400">
        Offline
      </span>
    </div>
  );
}
