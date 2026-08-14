"use client";

import { useState } from "react";
import Header        from "./components/Header";
import POSRegister   from "./components/POSRegister";
import StoreManager  from "./components/StoreManager";
import ReceiptModal  from "./components/ReceiptModal";
import CustomerManager from "./components/CustomerManager";
import MKSLogo       from "./components/MKSLogo";
import type { Product, Category } from "./types";

import { useOnlineStatus } from "@/lib/useOnlineStatus";
import { useOfflineData  } from "@/lib/useOfflineData";
import { useSyncEngine   } from "@/lib/useSyncEngine";
import { addToSalesQueue } from "@/lib/offlineDB";

interface CartItem {
  product:  Product;
  quantity: number;
}

// ─── Loading skeleton shown while fetching ────────────────────────────────────
function LoadingSkeleton() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 dark:bg-black">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
        <p className="text-sm font-semibold text-slate-500 dark:text-zinc-400">
          Loading inventory from database…
        </p>
      </div>
    </div>
  );
}

// ─── Error screen (API unreachable AND no IndexedDB fallback) ─────────────────
function ErrorScreen({
  message,
  onRetry,
  isOffline,
}: {
  message:   string;
  onRetry:   () => void;
  isOffline: boolean;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 dark:bg-black px-6">
      <div className="max-w-sm text-center">
        <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${
          isOffline
            ? "bg-amber-100 dark:bg-amber-950/40"
            : "bg-rose-100 dark:bg-rose-950/40"
        }`}>
          {isOffline ? (
            <svg className="h-7 w-7 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0Z" />
            </svg>
          ) : (
            <svg className="h-7 w-7 text-rose-600 dark:text-rose-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          )}
        </div>
        <h2 className="text-lg font-black text-slate-900 dark:text-white">
          {isOffline ? "You're Offline" : "Database Connection Error"}
        </h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-zinc-400">{message}</p>
        {!isOffline && (
          <p className="mt-1 text-xs text-slate-400 dark:text-zinc-600">
            Make sure MongoDB is running and MONGODB_URI is set in .env.local
          </p>
        )}
        {isOffline && (
          <p className="mt-1 text-xs text-slate-400 dark:text-zinc-600">
            Open the app while connected to the internet at least once to cache data locally.
          </p>
        )}
        {!isOffline && (
          <button
            onClick={onRetry}
            className="mt-6 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Manager password ─────────────────────────────────────────────────────────
const MANAGER_PASSWORD = process.env.NEXT_PUBLIC_MANAGER_PASSWORD ?? "";

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Home() {
  // ── Offline / data layer ────────────────────────────────────────────────────
  const isOnline = useOnlineStatus();

  const {
    products,
    categories,
    customers,
    isLoading,
    loadError,
    isOfflineLoad,
    loadData,
    handleAddProduct,
    handleUpdateProductPrice,
    handleUpdateProductDetails,
    handleDeleteProduct,
    handleResetToDefault,
  } = useOfflineData();

  const { pendingCount, isSyncing, justSynced } = useSyncEngine(isOnline, loadData);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [showWelcome, setShowWelcome] = useState(true);
  const [view, setView]               = useState<"register" | "manager" | "customers">("register");
  const [cart, setCart]               = useState<CartItem[]>([]);

  // Checkout modal
  const [isReceiptOpen,     setIsReceiptOpen]     = useState(false);
  const [receiptCart,       setReceiptCart]       = useState<CartItem[]>([]);
  const [receiptTotal,      setReceiptTotal]      = useState(0);
  const [receiptDiscount,   setReceiptDiscount]   = useState(0);
  const [receiptCustomer,   setReceiptCustomer]   = useState("");
  const [receiptInvoiceNum,     setReceiptInvoiceNum]     = useState("");
  const [receiptPaymentMethod,  setReceiptPaymentMethod]  = useState<"cash" | "card" | "credit">("cash");
  const [receiptCustomerId,     setReceiptCustomerId]     = useState<string | undefined>(undefined);
  const [receiptCustomerPhone,  setReceiptCustomerPhone]  = useState<string | undefined>(undefined);

  // Protected sections password gate
  const [managerUnlocked,      setManagerUnlocked]      = useState(false);
  const [customersUnlocked,    setCustomersUnlocked]    = useState(false);
  const [showPasswordModal,    setShowPasswordModal]    = useState(false);
  const [passwordTargetView,   setPasswordTargetView]   = useState<"manager" | "customers">("manager");
  const [passwordInput,        setPasswordInput]        = useState("");
  const [passwordError,        setPasswordError]        = useState(false);

  // ── View change / password gate ─────────────────────────────────────────────
  const handleViewChange = (newView: "register" | "manager" | "customers") => {
    if (newView === "manager" && !managerUnlocked) {
      setPasswordTargetView("manager");
      setPasswordInput("");
      setPasswordError(false);
      setShowPasswordModal(true);
      return;
    }
    if (newView === "customers" && !customersUnlocked) {
      setPasswordTargetView("customers");
      setPasswordInput("");
      setPasswordError(false);
      setShowPasswordModal(true);
      return;
    }
    if (newView === "register") {
      setManagerUnlocked(false);
      setCustomersUnlocked(false);
    }
    setView(newView);
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === MANAGER_PASSWORD) {
      if (passwordTargetView === "manager") {
        setManagerUnlocked(true);
        setView("manager");
      } else {
        setCustomersUnlocked(true);
        setView("customers");
      }
      setShowPasswordModal(false);
      setPasswordInput("");
      setPasswordError(false);
    } else {
      setPasswordError(true);
      setPasswordInput("");
    }
  };

  // ── Cart handlers ───────────────────────────────────────────────────────────
  const handleAddToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const handleRemoveFromCart = (productId: string) =>
    setCart((prev) => prev.filter((i) => i.product.id !== productId));

  const handleUpdateCartQty = (productId: string, qty: number) => {
    if (qty <= 0) { handleRemoveFromCart(productId); return; }
    setCart((prev) =>
      prev.map((i) => (i.product.id === productId ? { ...i, quantity: qty } : i))
    );
  };

  const handleClearCart = () => setCart([]);

  // ── Checkout ────────────────────────────────────────────────────────────────
  const handleCheckout = async (
    discountAmount: number,
    customerName: string,
    paymentMethod: "cash" | "card" | "credit",
    customerId?: string,
    customerPhone?: string
  ) => {
    const subtotal   = cart.reduce((acc, i) => acc + i.product.price * i.quantity, 0);
    const finalTotal = subtotal - discountAmount;
    const invoiceNum = `INV-${Math.floor(100000 + Math.random() * 900000)}`;

    const salePayload = {
      invoiceNumber:  invoiceNum,
      customerId:     customerId,
      customerName:   customerName || undefined,
      items: cart.map((i) => ({
        productId:       i.product.id,
        productName:     i.product.name,
        productNameUrdu: i.product.nameUrdu,
        productCode:     i.product.code,
        quantity:        i.quantity,
        unitPrice:       i.product.price,
        totalPrice:      i.product.price * i.quantity,
      })),
      subtotal,
      discountAmount,
      totalAmount:    finalTotal,
      paymentMethod,
    };

    // If online: persist sale to MongoDB (fire-and-forget, non-blocking)
    if (isOnline) {
      fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(salePayload),
      }).catch(() => {/* ignore — sale shown locally */});
    } else {
      // Offline: store in IndexedDB salesQueue for later sync
      addToSalesQueue({
        id:         invoiceNum,   // invoiceNumber is the idempotency key
        payload:    salePayload as Record<string, unknown>,
        createdAt:  Date.now(),
        status:     'pending',
        retryCount: 0,
      }).catch((e) => console.warn('[Checkout] salesQueue write failed:', e));
    }

    setReceiptCart(cart);
    setReceiptTotal(finalTotal);
    setReceiptDiscount(discountAmount);
    setReceiptCustomer(customerName);
    setReceiptInvoiceNum(invoiceNum);
    setReceiptPaymentMethod(paymentMethod);
    setReceiptCustomerId(customerId);
    setReceiptCustomerPhone(customerPhone);
    setIsReceiptOpen(true);
    setCart([]);
  };

  // ── Welcome screen ──────────────────────────────────────────────────────────
  if (showWelcome) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-zinc-950 px-5 py-10 text-center sm:px-8">
        {/* Ambient glow */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500/5 blur-3xl" />
        </div>

        {/* Logo */}
        <div className="relative">
          <div className="absolute inset-0 scale-150 rounded-full bg-amber-500/8 blur-2xl" />
          <MKSLogo size={120} />
        </div>

        {/* Business name */}
        <h1 className="mt-5 text-3xl font-black tracking-tight text-white sm:text-4xl">
          <span className="text-amber-400">Shabbir Khan</span>{" "}
          <span className="whitespace-nowrap">Auto Body Parts</span>
        </h1>
        <p className="mt-1 font-urdu text-base text-amber-500/70 sm:text-lg" dir="rtl">
          شبیر خان آٹو باڈی پارٹس
        </p>

        {/* Divider */}
        <div className="mt-4 flex items-center gap-3">
          <div className="h-px w-16 bg-gradient-to-r from-transparent to-amber-600/50 sm:w-20" />
          <div className="h-1.5 w-1.5 rounded-full bg-amber-500/60" />
          <div className="h-px w-16 bg-gradient-to-l from-transparent to-amber-600/50 sm:w-20" />
        </div>

        {/* Address */}
        <p className="mt-4 flex items-start justify-center gap-2 text-sm font-medium text-zinc-400">
          <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
          </svg>
          Bara Sandha Stop, T 4, Band Road, Lahore
        </p>

        {/* Phone numbers */}
        <div className="mt-4 grid grid-cols-1 items-center justify-center gap-2 sm:grid-cols-3 sm:gap-3">
          {["0300-4254118", "0300-4177275", "0334-0450186"].map((num) => (
            <div
              key={num}
              className="flex items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5"
            >
              <svg className="h-3.5 w-3.5 flex-shrink-0 text-amber-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.338c0 10.302 8.365 18.662 18.662 18.662 0-5.799-3.03-10.896-7.594-13.825C16.806 8.26 18 5.768 18 3a7.5 7.5 0 0 0-15.75 0c0 1.17.266 2.278.75 3.256-.161.078-.318.16-.473.247A7.5 7.5 0 0 1 2.25 6.338Z" />
              </svg>
              <span className="font-mono text-sm font-semibold text-zinc-300">{num}</span>
            </div>
          ))}
        </div>

        {/* Enter button */}
        <button
          onClick={() => setShowWelcome(false)}
          className="mt-8 flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 px-9 py-4 text-base font-black text-black shadow-2xl shadow-amber-500/25 transition-all hover:from-amber-400 hover:to-amber-500 hover:shadow-amber-500/35 active:scale-95 sm:mt-10 sm:w-auto"
        >
          <svg className="h-5 w-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
          </svg>
          Enter Billing System
        </button>

        <p className="mt-8 text-xs text-zinc-700">Powered by Antigravity POS</p>
      </div>
    );
  }

  // ── Loading / Error states ──────────────────────────────────────────────────
  if (isLoading) return <LoadingSkeleton />;
  if (loadError) return (
    <ErrorScreen
      message={loadError}
      onRetry={loadData}
      isOffline={!isOnline}
    />
  );

  // ── Main app ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-50 font-sans text-zinc-900 dark:bg-black dark:text-zinc-50 print:bg-white print:text-black print:h-auto print:overflow-auto">
      <Header
        currentView={view}
        onViewChange={handleViewChange}
        productsCount={products.length}
        isOnline={isOnline}
        pendingCount={pendingCount}
        isSyncing={isSyncing}
        justSynced={justSynced}
      />

      {/* Offline banner — shown below header when using cached data */}
      {isOfflineLoad && (
        <div className="flex items-center justify-center gap-2 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border-b border-amber-200 dark:border-amber-900/40">
          <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0Z" />
          </svg>
          Offline — showing locally cached inventory. Changes will sync when connectivity returns.
        </div>
      )}

      <main className="flex flex-1 flex-col overflow-hidden print:p-0">
        {view === "register" ? (
          <POSRegister
            products={products}
            categories={categories as Category[]}
            customers={customers}
            isOnline={isOnline}
            cart={cart}
            onAddToCart={handleAddToCart}
            onRemoveFromCart={handleRemoveFromCart}
            onUpdateCartQty={handleUpdateCartQty}
            onClearCart={handleClearCart}
            onCheckout={handleCheckout}
          />
        ) : view === "customers" ? (
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            <CustomerManager />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            <StoreManager
            products={products}
            categories={categories as Category[]}
            onUpdateProductPrice={handleUpdateProductPrice}
            onUpdateProductDetails={handleUpdateProductDetails}
            onAddProduct={handleAddProduct}
            onDeleteProduct={handleDeleteProduct}
          />
          </div>
        )}
      </main>

      <ReceiptModal
        isOpen={isReceiptOpen}
        onClose={() => setIsReceiptOpen(false)}
        cart={receiptCart}
        totalAmount={receiptTotal}
        discountAmount={receiptDiscount}
        customerName={receiptCustomer}
        invoiceNumber={receiptInvoiceNum}
        paymentMethod={receiptPaymentMethod}
        customerPhone={receiptCustomerPhone}
      />

      {/* Protected View Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-zinc-900">
            {/* Header */}
            <div className={`flex flex-col items-center gap-3 px-6 py-7 text-center ${
              passwordTargetView === "customers"
                ? "bg-gradient-to-br from-violet-600 to-indigo-700"
                : "bg-gradient-to-br from-indigo-600 to-violet-700"
            }`}>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm shadow-lg">
                {passwordTargetView === "customers" ? (
                  <svg className="h-7 w-7 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                  </svg>
                ) : (
                  <svg className="h-7 w-7 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                  </svg>
                )}
              </div>
              <div>
                <h2 className="text-lg font-black text-white">
                  {passwordTargetView === "customers" ? "Customer Records & Ledger" : "Store Manager"}
                </h2>
                <p className="mt-0.5 text-xs font-semibold text-violet-200">
                  {passwordTargetView === "customers"
                    ? "Enter password to access customer records & ledger"
                    : "Enter password to access inventory manager"}
                </p>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handlePasswordSubmit} className="px-6 py-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-500">
                  Password
                </label>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(false); }}
                  placeholder="Enter password"
                  autoFocus
                  className={`block w-full rounded-xl border px-4 py-3 text-sm font-semibold text-slate-900 transition-colors focus:outline-none dark:text-white dark:bg-zinc-800 ${
                    passwordError
                      ? "border-rose-400 bg-rose-50 focus:border-rose-500 dark:border-rose-600 dark:bg-rose-950/20"
                      : "border-slate-200 bg-slate-50 focus:border-violet-500 dark:border-zinc-700"
                  }`}
                />
                {passwordError && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                    </svg>
                    Incorrect password. Please try again.
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`flex-1 rounded-xl py-2.5 text-sm font-semibold text-white shadow-lg transition-all active:scale-95 ${
                    passwordTargetView === "customers"
                      ? "bg-gradient-to-r from-violet-600 to-indigo-600 shadow-violet-500/25 hover:from-violet-500 hover:to-indigo-500"
                      : "bg-gradient-to-r from-indigo-600 to-violet-600 shadow-indigo-500/25 hover:from-indigo-500 hover:to-violet-500"
                  }`}
                >
                  Unlock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
