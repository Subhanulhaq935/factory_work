"use client";

import MKSLogo from "./MKSLogo";
import OfflineStatus from "./OfflineStatus";

interface HeaderProps {
  currentView:  "register" | "manager" | "customers" | "bills";
  onViewChange: (view: "register" | "manager" | "customers" | "bills") => void;
  productsCount: number;
  isOnline:     boolean;
  pendingCount: number;
  isSyncing:    boolean;
  justSynced:   boolean;
}

export default function Header({
  currentView,
  onViewChange,
  productsCount,
  isOnline,
  pendingCount,
  isSyncing,
  justSynced,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 bg-white/95 backdrop-blur-xl shadow-sm dark:border-slate-800 dark:bg-zinc-950/95">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-2 px-3 sm:h-16 sm:gap-3 sm:px-6 lg:px-8">

        {/* Brand */}
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <div className="relative flex-shrink-0">
            <MKSLogo size={36} />
            <div className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-2 border-white dark:border-zinc-950 sm:h-2.5 sm:w-2.5 transition-colors ${isOnline ? 'bg-emerald-500' : 'bg-rose-500'}`} />
          </div>
          <div className="min-w-0 overflow-hidden">
            <h1 className="truncate text-sm font-black tracking-tight text-zinc-900 dark:text-white sm:text-base">
              Shabbir Khan <span className="gradient-text font-black">Auto Body</span> Parts
            </h1>
            <p className="hidden text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 sm:block">
              Band Road, Lahore · Billing System
            </p>
          </div>
        </div>

        {/* View Switcher */}
        <nav className="flex flex-shrink-0 items-center gap-0.5 rounded-xl sm:rounded-2xl bg-slate-100/90 p-1 dark:bg-zinc-900">
          <button
            onClick={() => onViewChange("register")}
            className={`flex items-center gap-1 sm:gap-1.5 rounded-lg sm:rounded-xl px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 text-xs font-black transition-all duration-200 sm:text-sm ${
              currentView === "register"
                ? "bg-white text-indigo-600 shadow-sm sm:shadow-md shadow-black/5 dark:bg-zinc-800 dark:text-indigo-400"
                : "text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
            title="Billing Register"
          >
            <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 14.25l6-6m4.5-3.493V21a1.5 1.5 0 01-1.5 1.5H3.75A1.5 1.5 0 012.25 21V3.75A1.5 1.5 0 013.75 2.25h13.514M21 3h-6.75" />
            </svg>
            <span className="hidden md:inline">Billing </span>
            <span>Register</span>
          </button>

          <button
            onClick={() => onViewChange("customers")}
            className={`flex items-center gap-1 sm:gap-1.5 rounded-lg sm:rounded-xl px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 text-xs font-black transition-all duration-200 sm:text-sm ${
              currentView === "customers"
                ? "bg-white text-violet-600 shadow-sm sm:shadow-md shadow-black/5 dark:bg-zinc-800 dark:text-violet-400"
                : "text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
            title="Customers & Ledger"
          >
            <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
            </svg>
            <span>Customers</span>
          </button>

          <button
            onClick={() => onViewChange("manager")}
            className={`flex items-center gap-1 sm:gap-1.5 rounded-lg sm:rounded-xl px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 text-xs font-black transition-all duration-200 sm:text-sm ${
              currentView === "manager"
                ? "bg-white text-indigo-600 shadow-sm sm:shadow-md shadow-black/5 dark:bg-zinc-800 dark:text-indigo-400"
                : "text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
            title="Store Manager"
          >
            <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
            </svg>
            <span className="hidden md:inline">Store </span>
            <span>Manager</span>
            <span className={`ml-0.5 rounded-full px-1.5 py-0.2 text-[9px] sm:text-[10px] font-black transition-all ${
              currentView === "manager"
                ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                : "bg-slate-200 text-slate-600 dark:bg-zinc-700 dark:text-zinc-300"
            }`}>
              {productsCount}
            </span>
          </button>

          {/* Bills History button */}
          <button
            onClick={() => onViewChange("bills")}
            className={`flex items-center gap-1 sm:gap-1.5 rounded-lg sm:rounded-xl px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 text-xs font-black transition-all duration-200 sm:text-sm ${
              currentView === "bills"
                ? "bg-white text-amber-600 shadow-sm sm:shadow-md shadow-black/5 dark:bg-zinc-800 dark:text-amber-400"
                : "text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
            title="Bills History"
          >
            <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
            </svg>
            <span className="hidden md:inline">Bills </span>
            <span>History</span>
          </button>
        </nav>

        {/* Live Offline/Online Status Badge */}
        <OfflineStatus
          isOnline={isOnline}
          pendingCount={pendingCount}
          isSyncing={isSyncing}
          justSynced={justSynced}
        />
      </div>
    </header>
  );
}
