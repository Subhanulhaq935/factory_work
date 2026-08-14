"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import type { Product, Category, Customer } from "../types";
import { putCustomer, addToSyncQueue } from "@/lib/offlineDB";

function uuidPOS(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

interface CartItem {
  product: Product;
  quantity: number;
}

interface POSRegisterProps {
  products: Product[];
  categories: Category[];
  customers: Customer[];     // full customer list for offline search
  isOnline: boolean;         // used to decide API vs local search
  cart: CartItem[];
  onAddToCart: (product: Product) => void;
  onRemoveFromCart: (productId: string) => void;
  onUpdateCartQty: (productId: string, qty: number) => void;
  onClearCart: () => void;
  onCheckout: (
    discountAmount: number,
    customerName: string,
    paymentMethod: "cash" | "card" | "credit",
    customerId?: string,
    customerPhone?: string
  ) => void;
}

export default function POSRegister({
  products,
  categories,
  customers,
  isOnline,
  cart,
  onAddToCart,
  onRemoveFromCart,
  onUpdateCartQty,
  onClearCart,
  onCheckout,
}: POSRegisterProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [customerName, setCustomerName] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("fixed");
  const [discountInput, setDiscountInput] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "credit">("cash");

  // ── Customer selector state ──────────────────────────────────────────────────
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const [showAddCustomerForm, setShowAddCustomerForm] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustAddress, setNewCustAddress] = useState("");
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [addCustomerError, setAddCustomerError] = useState("");
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  // Mobile cart drawer
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);

  const totalAmount = useMemo(
    () => cart.reduce((acc, item) => acc + item.product.price * item.quantity, 0),
    [cart]
  );

  const cartItemCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    products.forEach((p) => {
      counts[p.category] = (counts[p.category] || 0) + 1;
    });
    return counts;
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch =
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.nameUrdu.includes(searchTerm) ||
        (product.code && product.code.includes(searchTerm));
      const matchesCategory =
        selectedCategory === "all" || product.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchTerm, selectedCategory]);

  const discountAmount = useMemo(() => {
    const val = parseFloat(discountInput) || 0;
    if (val <= 0 || totalAmount <= 0) return 0;
    if (discountType === "percent") {
      return Math.round((Math.min(val, 100) / 100) * totalAmount);
    }
    return Math.min(Math.round(val), totalAmount);
  }, [discountInput, discountType, totalAmount]);

  const discountedTotal = totalAmount - discountAmount;

  const selectedCategoryLabel =
    selectedCategory === "all"
      ? null
      : categories.find((c) => c.id === selectedCategory)?.name;

  const handleCheckoutClick = () => {
    if (cart.length === 0) return;
    const displayName = selectedCustomer?.name ?? customerName.trim();
    onCheckout(
      discountAmount,
      displayName,
      paymentMethod,
      selectedCustomer?.customerId,
      selectedCustomer?.phone
    );
    setDiscountInput("");
    setCustomerName("");
    setPaymentMethod("cash");
    setSelectedCustomer(null);
    setCustomerSearch("");
    setIsMobileCartOpen(false);
  };

  const checkoutLabel = () => {
    if (cart.length === 0) return "Add Items to Checkout";
    return "Complete Checkout →";
  };

  // Close cart on ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMobileCartOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Lock body scroll when mobile cart is open
  useEffect(() => {
    document.body.style.overflow = isMobileCartOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isMobileCartOpen]);

  // ── Customer search — hybrid: API when online, local cache when offline ──────
  const searchCustomers = useCallback(async (q: string) => {
    if (!q.trim()) { setCustomerResults([]); return; }
    setCustomerSearchLoading(true);
    try {
      if (navigator.onLine) {
        // Online: real-time API search
        const res = await fetch(`/api/customers?search=${encodeURIComponent(q.trim())}`);
        if (res.ok) setCustomerResults(await res.json());
      } else {
        // Offline: search the in-memory cache (already loaded from IndexedDB)
        const qLower = q.trim().toLowerCase();
        const results = customers.filter(
          (c) =>
            c.name.toLowerCase().includes(qLower) ||
            c.phone.toLowerCase().includes(qLower)
        );
        setCustomerResults(results.slice(0, 50));
      }
    } catch { /* ignore */ }
    finally { setCustomerSearchLoading(false); }
  }, [customers]);

  useEffect(() => {
    const t = setTimeout(() => searchCustomers(customerSearch), 300);
    return () => clearTimeout(t);
  }, [customerSearch, searchCustomers]);

  // Close customer dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(e.target as Node)) {
        setCustomerSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Add-new-customer — works online and offline ───────────────────────────
  const handleAddNewCustomer = async () => {
    if (!newCustName.trim() || !newCustPhone.trim()) {
      setAddCustomerError("Name and phone are required.");
      return;
    }
    setAddingCustomer(true);
    setAddCustomerError("");

    if (!navigator.onLine) {
      // ── Offline path: save locally + queue for sync ───────────────────────
      // Check for duplicate phone in local cache
      const duplicate = customers.find(
        (c) => c.phone.trim() === newCustPhone.trim()
      );
      if (duplicate) {
        setSelectedCustomer(duplicate);
        setCustomerSearch("");
        setShowAddCustomerForm(false);
        setCustomerSearchOpen(false);
        setNewCustName(""); setNewCustPhone(""); setNewCustAddress("");
        setAddingCustomer(false);
        return;
      }

      const tempId = `CUST-OFFLINE-${uuidPOS()}`;
      const newCust: Customer = {
        customerId:         tempId,
        name:               newCustName.trim(),
        phone:              newCustPhone.trim(),
        address:            newCustAddress.trim(),
        outstandingBalance: 0,
        createdAt:          new Date().toISOString(),
        updatedAt:          new Date().toISOString(),
      };

      try {
        await putCustomer(newCust);
        await addToSyncQueue({
          id:                  uuidPOS(),
          type:                'create',
          entity:              'customer',
          customerId:          tempId,
          payload:             {
            name:    newCust.name,
            phone:   newCust.phone,
            address: newCust.address,
            clientId: tempId,           // so server can deduplicate
          },
          clientTransactionId: tempId,
          createdAt:           Date.now(),
          status:              'pending',
          retryCount:          0,
        });
        setSelectedCustomer(newCust);
        setCustomerSearch("");
        setShowAddCustomerForm(false);
        setCustomerSearchOpen(false);
        setNewCustName(""); setNewCustPhone(""); setNewCustAddress("");
      } catch {
        setAddCustomerError("Failed to save customer locally.");
      } finally {
        setAddingCustomer(false);
      }
      return;
    }

    // ── Online path (existing behaviour) ─────────────────────────────────────
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCustName.trim(), phone: newCustPhone.trim(), address: newCustAddress.trim() }),
      });
      const data = await res.json();
      if (res.status === 409 && data.existing) {
        // Phone already exists — select that customer and update local cache
        await putCustomer(data.existing).catch(() => {});
        setSelectedCustomer(data.existing);
        setCustomerSearch("");
        setShowAddCustomerForm(false);
        setCustomerSearchOpen(false);
        setNewCustName(""); setNewCustPhone(""); setNewCustAddress("");
        return;
      }
      if (!res.ok) { setAddCustomerError(data.error ?? "Failed to create customer"); return; }
      // Save new customer to local IndexedDB cache immediately
      await putCustomer(data).catch(() => {});
      setSelectedCustomer(data);
      setCustomerSearch("");
      setShowAddCustomerForm(false);
      setCustomerSearchOpen(false);
      setNewCustName(""); setNewCustPhone(""); setNewCustAddress("");
    } catch { setAddCustomerError("Network error. Please try again."); }
    finally { setAddingCustomer(false); }
  };

  return (
    <>
    {/* ═══ Two-Pane Layout: left scrolls, right cart always visible ═══ */}
    <div className="flex flex-1 overflow-hidden">

      {/* LEFT: Products Panel — scrolls independently */}
      <div className="flex-1 overflow-y-auto px-4 py-5 pb-fab sm:px-6 md:pb-5 lg:px-8 scrollbar-thin">
        <div className="mx-auto max-w-3xl space-y-4 pb-6">

        {/* Search Bar */}
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
            <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.637 10.637Z" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search by item code, English or Urdu name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="block w-full rounded-2xl border-2 border-slate-200 bg-white py-3.5 pl-12 pr-12 text-sm font-medium text-slate-900 placeholder-slate-400 shadow-sm transition-colors duration-200 focus:border-indigo-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder-zinc-500"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute inset-y-0 right-0 flex items-center pr-4 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Category Filter Pills — reliable outer/inner scroll pattern */}
        <div className="overflow-x-auto pb-2 scrollbar-thin">
          <div className="flex min-w-max gap-2">
            {/* All */}
            <button
              onClick={() => setSelectedCategory("all")}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all duration-200 ${
                selectedCategory === "all"
                  ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/25"
                  : "border border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-indigo-700 dark:hover:text-indigo-400"
              }`}
            >
              All Items
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${
                selectedCategory === "all"
                  ? "bg-white/25 text-white"
                  : "bg-slate-100 text-slate-500 dark:bg-zinc-700 dark:text-zinc-400"
              }`}>
                {products.length}
              </span>
            </button>

            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCategory(c.id)}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-bold transition-all duration-200 ${
                  selectedCategory === c.id
                    ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/25"
                    : "border border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-indigo-700 dark:hover:text-indigo-400"
                }`}
              >
                {c.name}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${
                  selectedCategory === c.id
                    ? "bg-white/25 text-white"
                    : "bg-slate-100 text-slate-500 dark:bg-zinc-700 dark:text-zinc-400"
                }`}>
                  {categoryCounts[c.id] || 0}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Results Summary */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-4 w-1 rounded-full bg-gradient-to-b from-indigo-500 to-violet-600"></div>
            <span className="text-sm font-bold text-slate-800 dark:text-white">
              {filteredProducts.length} item{filteredProducts.length !== 1 ? "s" : ""}
            </span>
            {selectedCategoryLabel && (
              <span className="text-sm text-slate-400 dark:text-zinc-500">
                in <span className="font-semibold text-indigo-600 dark:text-indigo-400">{selectedCategoryLabel}</span>
              </span>
            )}
            {searchTerm && (
              <span className="text-sm text-slate-400 dark:text-zinc-500">
                for "<span className="font-semibold text-violet-600 dark:text-violet-400">{searchTerm}</span>"
              </span>
            )}
          </div>
          {filteredProducts.length > 0 && (
            <span className="text-xs font-mono font-semibold text-slate-400 dark:text-zinc-600">
              #1 – #{filteredProducts.length}
            </span>
          )}
        </div>

        {/* Products Grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {filteredProducts.map((product, index) => {
            const inCart = cart.find((item) => item.product.id === product.id);
            return (
              <button
                key={product.id}
                onClick={() => onAddToCart(product)}
                className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border bg-white p-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg dark:bg-zinc-900 ${
                  inCart
                    ? "border-indigo-300 shadow-md shadow-indigo-100 ring-1 ring-indigo-200 dark:border-indigo-700 dark:shadow-indigo-950 dark:ring-indigo-900"
                    : "border-slate-200 shadow-sm hover:border-indigo-300 dark:border-zinc-700 dark:hover:border-indigo-600"
                }`}
              >
                {/* Top row: sequential index + code badge */}
                <div className="flex items-start justify-between">
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-slate-100 px-1 text-[10px] font-black text-slate-500 dark:bg-zinc-800 dark:text-zinc-400">
                    {index + 1}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {inCart && (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[9px] font-black text-white shadow-sm shadow-indigo-500/30">
                        {inCart.quantity}
                      </span>
                    )}
                    {product.code && (
                      <span className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-black text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-400">
                        #{product.code}
                      </span>
                    )}
                  </div>
                </div>

                {/* Names */}
                <div className="mt-2.5 flex-1 space-y-1">
                  <p className="line-clamp-2 text-xs font-bold leading-tight text-slate-900 transition-colors group-hover:text-indigo-700 dark:text-white dark:group-hover:text-indigo-300">
                    {product.name}
                  </p>
                  <p className="line-clamp-1 text-right text-[10px] font-bold leading-relaxed text-slate-600 dark:text-zinc-300 font-urdu" dir="rtl">
                    {product.nameUrdu}
                  </p>
                </div>

                {/* Price */}
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 dark:border-zinc-700/60">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Rs.</span>
                  <span className="text-sm font-black text-indigo-600 transition-colors group-hover:text-violet-600 dark:text-indigo-400 dark:group-hover:text-violet-400">
                    {product.price.toLocaleString()}
                  </span>
                </div>
              </button>
            );
          })}

          {filteredProducts.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-24 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 dark:bg-zinc-800">
                <svg className="h-8 w-8 text-slate-400 dark:text-zinc-600" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.637 10.637Z" />
                </svg>
              </div>
              <h3 className="mt-4 text-sm font-bold text-slate-800 dark:text-white">No items found</h3>
              <p className="mt-1 text-xs text-slate-400 dark:text-zinc-600">Try a different search term or category.</p>
            </div>
          )}
        </div>
        </div>{/* /max-w-3xl */}
      </div>{/* /left panel */}

      {/* RIGHT: Cart Panel — always visible on md+, fixed side panel */}
      <div className="hidden md:flex md:flex-col w-80 xl:w-96 flex-none border-l border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">

          {/* Cart Header */}
          <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-zinc-800">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-sm">
                <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                </svg>
              </div>
              <div>
                <h2 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">Current Order</h2>
                <p className="text-[10px] font-bold text-slate-400 dark:text-zinc-500">
                  {cartItemCount > 0 ? `${cartItemCount} unit${cartItemCount !== 1 ? "s" : ""} · ${cart.length} item${cart.length !== 1 ? "s" : ""}` : "Cart Empty"}
                </p>
              </div>
            </div>
            {cart.length > 0 && (
              <button
                onClick={onClearCart}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-black text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors"
              >
                <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                Clear
              </button>
            )}
          </div>

          {/* Cart Items List — scrollable area */}
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3.5 scrollbar-thin">
            {cart.map((item) => (
              <div
                key={item.product.id}
                className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50/80 p-2.5 dark:border-zinc-800 dark:bg-zinc-800/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="font-mono text-[9px] font-black text-slate-400 dark:text-zinc-500">
                      #{item.product.code || "–"}
                    </span>
                  </div>
                  <p className="truncate text-xs font-bold text-slate-900 dark:text-white leading-tight">
                    {item.product.name}
                  </p>
                  {item.product.nameUrdu && (
                    <p className="text-right text-[10px] font-bold text-slate-600 dark:text-zinc-300 font-urdu leading-loose" dir="rtl">
                      {item.product.nameUrdu}
                    </p>
                  )}
                  <p className="mt-1 text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                    Rs.{item.product.price.toLocaleString()} × {item.quantity} ={" "}
                    <span className="font-black text-indigo-600 dark:text-indigo-400">
                      Rs.{(item.product.price * item.quantity).toLocaleString()}
                    </span>
                  </p>
                </div>

                <div className="flex flex-col items-end gap-1.5 pt-0.5">
                  <button
                    onClick={() => onRemoveFromCart(item.product.id)}
                    className="text-slate-300 transition-colors hover:text-rose-500 dark:text-zinc-600 dark:hover:text-rose-400"
                    title="Remove item"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                  <div className="flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-zinc-700 dark:bg-zinc-800 shadow-xs">
                    <button
                      onClick={() => onUpdateCartQty(item.product.id, item.quantity - 1)}
                      className="flex h-5 w-6 items-center justify-center text-xs font-bold text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:text-zinc-400 dark:hover:bg-rose-950/30 dark:hover:text-rose-400 transition-colors"
                    >
                      −
                    </button>
                    <span className="min-w-6 px-0.5 text-center text-xs font-black text-slate-800 dark:text-zinc-100">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => onUpdateCartQty(item.product.id, item.quantity + 1)}
                      className="flex h-5 w-6 items-center justify-center text-xs font-bold text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 dark:text-zinc-400 dark:hover:bg-indigo-950/30 dark:hover:text-indigo-400 transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {cart.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-zinc-800">
                  <svg className="h-6 w-6 text-slate-300 dark:text-zinc-600" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
                  </svg>
                </div>
                <p className="mt-2.5 text-xs font-bold text-slate-400 dark:text-zinc-500">Cart is empty</p>
                <p className="text-[10px] text-slate-300 dark:text-zinc-600">Click any product to add</p>
              </div>
            )}
          </div>

          {/* Cart Footer: Totals + Customer + Discount + Payment + Checkout Button */}
          <div className="flex-shrink-0 border-t border-slate-200/80 bg-white p-3.5 space-y-2 dark:border-zinc-800 dark:bg-zinc-900 shadow-lg">

            {/* Totals block */}
            <div className="space-y-0.5">
              {discountAmount > 0 && (
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-bold text-slate-500 dark:text-zinc-400">Subtotal</span>
                  <span className="font-black text-slate-800 dark:text-zinc-200">
                    Rs.&nbsp;{totalAmount.toLocaleString()}
                  </span>
                </div>
              )}
              {discountAmount > 0 && (
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-bold text-rose-500">
                    Discount{discountType === "percent" ? ` (${discountInput}%)` : ""}
                  </span>
                  <span className="font-black text-rose-500">
                    − Rs.&nbsp;{discountAmount.toLocaleString()}
                  </span>
                </div>
              )}
              <div className="flex items-baseline justify-between pt-0.5">
                <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400">Grand Total</span>
                <span className="text-xl font-black text-slate-900 dark:text-white">
                  Rs.&nbsp;{discountedTotal.toLocaleString()}
                </span>
              </div>
            </div>

            {cart.length > 0 && (
              <div className="space-y-2 rounded-xl bg-slate-50 p-2.5 dark:bg-zinc-800/60 border border-slate-100 dark:border-zinc-700/60">

                {/* ── Customer Selector (Compact) ── */}
                <div ref={customerDropdownRef} className="relative">
                  {selectedCustomer ? (
                    <div className="flex items-center justify-between rounded-lg border border-violet-300 bg-violet-50 px-2.5 py-1.5 dark:border-violet-700 dark:bg-violet-950/30">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-black text-violet-900 dark:text-violet-200">{selectedCustomer.name}</p>
                        <p className="text-[10px] font-bold text-violet-600 dark:text-violet-400">📞 {selectedCustomer.phone}</p>
                      </div>
                      <button
                        onClick={() => { setSelectedCustomer(null); setCustomerSearch(""); }}
                        className="ml-1 rounded-md p-1 text-violet-400 hover:bg-violet-100 hover:text-violet-700 dark:hover:bg-violet-900/40"
                        title="Remove customer"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ) : showAddCustomerForm ? (
                    <div className="space-y-1.5 rounded-lg border border-violet-300 bg-white p-2 dark:border-violet-700 dark:bg-zinc-800 shadow-md">
                      <p className="text-[10px] font-black uppercase tracking-wider text-violet-700 dark:text-violet-400">New Customer</p>
                      <input
                        type="text"
                        placeholder="Full Name *"
                        value={newCustName}
                        onChange={(e) => setNewCustName(e.target.value)}
                        className="block w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-900 focus:border-violet-400 focus:outline-none dark:border-zinc-600 dark:bg-zinc-700 dark:text-white"
                      />
                      <input
                        type="tel"
                        placeholder="Phone Number *"
                        value={newCustPhone}
                        onChange={(e) => setNewCustPhone(e.target.value)}
                        className="block w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-900 focus:border-violet-400 focus:outline-none dark:border-zinc-600 dark:bg-zinc-700 dark:text-white"
                      />
                      {addCustomerError && <p className="text-[10px] font-bold text-rose-600">{addCustomerError}</p>}
                      <div className="flex gap-1.5 pt-0.5">
                        <button
                          onClick={() => { setShowAddCustomerForm(false); setAddCustomerError(""); }}
                          className="flex-1 rounded-md border border-slate-200 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50 dark:border-zinc-600 dark:text-zinc-400"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleAddNewCustomer}
                          disabled={addingCustomer}
                          className="flex-1 rounded-md bg-violet-600 py-1 text-[10px] font-black text-white hover:bg-violet-500 disabled:opacity-60"
                        >
                          {addingCustomer ? "Saving…" : "Save"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-1.5">
                        <div className="relative flex-1">
                          <input
                            type="text"
                            placeholder="Customer Name / Phone…"
                            value={customerSearch}
                            onFocus={() => setCustomerSearchOpen(true)}
                            onChange={(e) => { setCustomerSearch(e.target.value); setCustomerSearchOpen(true); }}
                            className="block w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-900 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
                          />
                          {customerSearchLoading && (
                            <div className="absolute right-2 top-1/2 -translate-y-1/2">
                              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-200 border-t-violet-500" />
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => setShowAddCustomerForm(true)}
                          className="rounded-lg border border-violet-300 bg-violet-50 px-2 py-1.5 text-[10px] font-black text-violet-700 hover:bg-violet-100 dark:border-violet-700 dark:bg-violet-950/30 dark:text-violet-300 whitespace-nowrap"
                          title="Add New Customer"
                        >
                          + New
                        </button>
                      </div>

                      {/* Search Dropdown */}
                      {customerSearchOpen && (customerResults.length > 0 || customerSearch.trim()) && (
                        <div className="absolute bottom-full mb-1 z-50 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-800 max-h-48 overflow-y-auto">
                          {customerResults.map((c) => (
                            <button
                              key={c.customerId}
                              onClick={() => { setSelectedCustomer(c); setCustomerSearch(""); setCustomerSearchOpen(false); }}
                              className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-violet-50 dark:hover:bg-violet-950/20 border-b border-slate-100 dark:border-zinc-700/60 last:border-0"
                            >
                              <div className="min-w-0 flex-1 pr-2">
                                <p className="text-xs font-black text-slate-900 dark:text-white truncate">{c.name}</p>
                                <p className="text-[10px] font-bold text-slate-400 dark:text-zinc-400">📞 {c.phone}</p>
                              </div>
                              {c.outstandingBalance > 0 && (
                                <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-black text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 whitespace-nowrap">
                                  Due: Rs.{c.outstandingBalance.toLocaleString()}
                                </span>
                              )}
                            </button>
                          ))}
                          <button
                            onClick={() => { setShowAddCustomerForm(true); setCustomerSearchOpen(false); }}
                            className="flex w-full items-center gap-1.5 bg-slate-50 px-3 py-2 text-xs font-black text-violet-600 hover:bg-violet-50 dark:bg-zinc-800/80 dark:text-violet-400"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                            Add New Customer
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Discount input (Compact) */}
                <div className="flex items-center gap-1.5">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      placeholder={discountType === "percent" ? "Discount %" : "Discount Rs."}
                      value={discountInput}
                      onChange={(e) => setDiscountInput(e.target.value)}
                      className="block w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
                    />
                  </div>
                  <div className="flex overflow-hidden rounded-lg border border-slate-200 dark:border-zinc-600">
                    <button
                      onClick={() => { setDiscountType("percent"); setDiscountInput(""); }}
                      className={`px-2 py-1 text-[11px] font-black transition-colors ${
                        discountType === "percent"
                          ? "bg-rose-500 text-white"
                          : "bg-white text-slate-500 hover:bg-slate-50 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      %
                    </button>
                    <button
                      onClick={() => { setDiscountType("fixed"); setDiscountInput(""); }}
                      className={`border-l border-slate-200 px-2 py-1 text-[11px] font-black transition-colors dark:border-zinc-600 ${
                        discountType === "fixed"
                          ? "bg-rose-500 text-white"
                          : "bg-white text-slate-500 hover:bg-slate-50 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      Rs
                    </button>
                  </div>
                </div>

                {/* Payment Method 3-Buttons (Horizontal Row) */}
                <div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      onClick={() => setPaymentMethod("cash")}
                      className={`flex items-center justify-center gap-1 rounded-lg border-2 py-1.5 text-xs font-black transition-all ${
                        paymentMethod === "cash"
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" /></svg>
                      Cash
                    </button>
                    <button
                      onClick={() => setPaymentMethod("card")}
                      className={`flex items-center justify-center gap-1 rounded-lg border-2 py-1.5 text-xs font-black transition-all ${
                        paymentMethod === "card"
                          ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
                          : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" /></svg>
                      Card
                    </button>
                    <button
                      onClick={() => setPaymentMethod("credit")}
                      className={`flex items-center justify-center gap-1 rounded-lg border-2 py-1.5 text-xs font-black transition-all ${
                        paymentMethod === "credit"
                          ? "border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                          : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                      Udhaar
                    </button>
                  </div>
                  {paymentMethod === "credit" && !selectedCustomer && (
                    <p className="mt-1 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                      ⚠ Please select a customer above for Udhaar.
                    </p>
                  )}
                </div>

              </div>
            )}

            {/* Checkout Button — Always in view */}
            <button
              onClick={handleCheckoutClick}
              disabled={cart.length === 0}
              className={`w-full rounded-xl py-3 text-xs sm:text-sm font-black tracking-wide shadow-md transition-all duration-200 active:scale-[0.99] ${
                cart.length > 0
                  ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-indigo-500/25 hover:from-indigo-500 hover:to-violet-500"
                  : "cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-zinc-800 dark:text-zinc-600 shadow-none"
              }`}
            >
              {checkoutLabel()}
            </button>
          </div>{/* /cart footer */}
      </div>{/* /right cart panel */}
    </div>{/* /two-pane wrapper */}

    {/* ── MOBILE ONLY: Backdrop + Bottom Sheet Drawer + Sticky FAB ── */}

    {/* Backdrop — mobile only (below md) */}
    {isMobileCartOpen && (
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
        onClick={() => setIsMobileCartOpen(false)}
      />
    )}

    {/* Bottom sheet — mobile only (below md) */}
    <div
      className={`fixed inset-x-0 bottom-0 z-50 flex flex-col md:hidden transition-transform duration-300 ease-out ${
        isMobileCartOpen ? "translate-y-0" : "translate-y-full"
      }`}
      style={{ maxHeight: "88vh" }}
      aria-hidden={!isMobileCartOpen}
    >
      {/* Drag handle bar */}
      <div className="flex justify-center rounded-t-3xl border-t border-x border-slate-200 bg-white px-4 pb-1 pt-2 dark:border-zinc-700 dark:bg-zinc-900">
        <div className="h-1 w-10 rounded-full bg-slate-300 dark:bg-zinc-600" />
      </div>

      {/* Cart Header (mobile drawer) */}
      <div className="flex items-center justify-between border-b border-x border-slate-200 bg-white px-5 py-4 dark:border-zinc-700/60 dark:bg-zinc-900">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-md shadow-indigo-500/25">
            <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-900 dark:text-white">Current Order</h2>
            <p className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500">
              {cartItemCount > 0 ? `${cartItemCount} unit${cartItemCount !== 1 ? "s" : ""} · ${cart.length} item${cart.length !== 1 ? "s" : ""}` : "Empty"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {cart.length > 0 && (
            <button
              onClick={onClearCart}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-rose-500 transition-colors hover:bg-rose-50 dark:hover:bg-rose-950/20"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
              Clear
            </button>
          )}
          <button
            onClick={() => setIsMobileCartOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            aria-label="Close cart"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Cart Items (mobile) */}
      <div className="flex-1 overflow-y-auto border-x border-slate-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900 scrollbar-thin">
        <div className="space-y-2">
          {cart.map((item) => (
            <div key={item.product.id} className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 dark:bg-zinc-800/60">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="font-mono text-[9px] font-black text-slate-400 dark:text-zinc-600">#{item.product.code || "–"}</span>
                </div>
                <p className="truncate text-xs font-bold text-slate-900 dark:text-white leading-tight">{item.product.name}</p>
                <p className="text-right text-[10px] font-bold text-slate-600 dark:text-zinc-300 font-urdu leading-loose" dir="rtl">{item.product.nameUrdu}</p>
                <p className="mt-1 text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                  Rs.{item.product.price.toLocaleString()} × {item.quantity} =&nbsp;
                  <span className="font-black text-indigo-600 dark:text-indigo-400">Rs.{(item.product.price * item.quantity).toLocaleString()}</span>
                </p>
              </div>
              <div className="flex flex-col items-end gap-2 pt-0.5">
                <button onClick={() => onRemoveFromCart(item.product.id)} className="text-slate-300 transition-colors hover:text-rose-500 dark:text-zinc-600 dark:hover:text-rose-400">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                </button>
                <div className="flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-zinc-600 dark:bg-zinc-700">
                  <button onClick={() => onUpdateCartQty(item.product.id, item.quantity - 1)} className="flex h-6 w-7 items-center justify-center text-sm font-bold text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:text-zinc-400 dark:hover:bg-rose-950/30 dark:hover:text-rose-400">−</button>
                  <span className="min-w-7 px-1 text-center text-xs font-black text-slate-800 dark:text-zinc-100">{item.quantity}</span>
                  <button onClick={() => onUpdateCartQty(item.product.id, item.quantity + 1)} className="flex h-6 w-7 items-center justify-center text-sm font-bold text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 dark:text-zinc-400 dark:hover:bg-indigo-950/30 dark:hover:text-indigo-400">+</button>
                </div>
              </div>
            </div>
          ))}
          {cart.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-zinc-800">
                <svg className="h-7 w-7 text-slate-300 dark:text-zinc-600" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
                </svg>
              </div>
              <p className="mt-3 text-sm font-bold text-slate-400 dark:text-zinc-600">Cart is empty</p>
              <p className="mt-0.5 text-xs text-slate-300 dark:text-zinc-700">Tap a product to start billing</p>
            </div>
          )}
        </div>
      </div>

      {/* Cart Footer (mobile) */}
      <div className="space-y-3 border border-slate-200 bg-white px-5 py-4 pb-safe dark:border-zinc-700/60 dark:bg-zinc-900">
        <div className="space-y-1">
          {discountAmount > 0 && (
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-bold text-slate-600 dark:text-zinc-400">Subtotal</span>
              <span className="font-black text-slate-800 dark:text-zinc-200">Rs.&nbsp;{totalAmount.toLocaleString()}</span>
            </div>
          )}
          {discountAmount > 0 && (
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-bold text-rose-500">Discount{discountType === "percent" ? ` (${discountInput}%)` : ""}</span>
              <span className="font-black text-rose-500">− Rs.&nbsp;{discountAmount.toLocaleString()}</span>
            </div>
          )}
          <div className="flex items-baseline justify-between border-t border-slate-100 pt-2 dark:border-zinc-700/60">
            <span className="text-sm font-bold text-slate-500 dark:text-zinc-400">Grand Total</span>
            <span className="text-2xl font-black text-slate-900 dark:text-white">Rs.&nbsp;{discountedTotal.toLocaleString()}</span>
          </div>
        </div>

        {cart.length > 0 && (
          <div className="space-y-2 rounded-xl bg-slate-50 p-2.5 dark:bg-zinc-800/60 border border-slate-100 dark:border-zinc-700/60">

            {/* Customer selector (mobile) */}
            <div>
              {selectedCustomer ? (
                <div className="flex items-center justify-between rounded-lg border border-violet-300 bg-violet-50 px-2.5 py-1.5 dark:border-violet-700 dark:bg-violet-950/30">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-black text-violet-900 dark:text-violet-200">{selectedCustomer.name}</p>
                    <p className="text-[10px] font-bold text-violet-600 dark:text-violet-400">📞 {selectedCustomer.phone}</p>
                  </div>
                  <button
                    onClick={() => { setSelectedCustomer(null); setCustomerSearch(""); }}
                    className="ml-1 rounded-md p-1 text-violet-400 hover:bg-violet-100 hover:text-violet-700"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ) : showAddCustomerForm ? (
                <div className="space-y-1.5 rounded-lg border border-violet-300 bg-white p-2 dark:border-violet-700 dark:bg-zinc-800 shadow-md">
                  <p className="text-[10px] font-black uppercase tracking-wider text-violet-700 dark:text-violet-400">New Customer</p>
                  <input
                    type="text"
                    placeholder="Full Name *"
                    value={newCustName}
                    onChange={(e) => setNewCustName(e.target.value)}
                    className="block w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-900 focus:border-violet-400 focus:outline-none dark:border-zinc-600 dark:bg-zinc-700 dark:text-white"
                  />
                  <input
                    type="tel"
                    placeholder="Phone Number *"
                    value={newCustPhone}
                    onChange={(e) => setNewCustPhone(e.target.value)}
                    className="block w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-900 focus:border-violet-400 focus:outline-none dark:border-zinc-600 dark:bg-zinc-700 dark:text-white"
                  />
                  {addCustomerError && <p className="text-[10px] font-bold text-rose-600">{addCustomerError}</p>}
                  <div className="flex gap-1.5 pt-0.5">
                    <button
                      onClick={() => { setShowAddCustomerForm(false); setAddCustomerError(""); }}
                      className="flex-1 rounded-md border border-slate-200 py-1 text-[10px] font-bold text-slate-600 dark:border-zinc-600 dark:text-zinc-400"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddNewCustomer}
                      disabled={addingCustomer}
                      className="flex-1 rounded-md bg-violet-600 py-1 text-[10px] font-black text-white hover:bg-violet-500 disabled:opacity-60"
                    >
                      {addingCustomer ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder="Customer Name / Phone…"
                    value={customerSearch}
                    onChange={(e) => { setCustomerSearch(e.target.value); setCustomerSearchOpen(true); }}
                    onFocus={() => setCustomerSearchOpen(true)}
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:border-violet-400 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
                  />
                  <button
                    onClick={() => setShowAddCustomerForm(true)}
                    className="rounded-lg border border-violet-300 bg-violet-50 px-2.5 py-1.5 text-[10px] font-black text-violet-700 dark:border-violet-700 dark:bg-violet-950/20 dark:text-violet-400 whitespace-nowrap"
                  >
                    + New
                  </button>
                </div>
              )}
              {/* Mobile search results */}
              {customerSearchOpen && customerResults.length > 0 && !selectedCustomer && !showAddCustomerForm && (
                <div className="mt-1 max-h-36 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
                  {customerResults.map((c) => (
                    <button
                      key={c.customerId}
                      onClick={() => { setSelectedCustomer(c); setCustomerSearch(""); setCustomerSearchOpen(false); }}
                      className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-violet-50 dark:hover:bg-violet-950/20 border-b border-slate-100 dark:border-zinc-700/60 last:border-0"
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <p className="text-xs font-black text-slate-900 dark:text-white truncate">{c.name}</p>
                        <p className="text-[10px] font-bold text-slate-400 dark:text-zinc-400">📞 {c.phone}</p>
                      </div>
                      {c.outstandingBalance > 0 && (
                        <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-black text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 whitespace-nowrap">
                          Due: Rs.{c.outstandingBalance.toLocaleString()}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Discount row */}
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder={discountType === "percent" ? "Discount %" : "Discount Rs."}
                  value={discountInput}
                  onChange={(e) => setDiscountInput(e.target.value)}
                  className="block w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
                />
              </div>
              <div className="flex overflow-hidden rounded-lg border border-slate-200 dark:border-zinc-600">
                <button
                  onClick={() => { setDiscountType("percent"); setDiscountInput(""); }}
                  className={`px-2 py-1 text-[11px] font-black transition-colors ${
                    discountType === "percent"
                      ? "bg-rose-500 text-white"
                      : "bg-white text-slate-500 hover:bg-slate-50 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  %
                </button>
                <button
                  onClick={() => { setDiscountType("fixed"); setDiscountInput(""); }}
                  className={`border-l border-slate-200 px-2 py-1 text-[11px] font-black transition-colors dark:border-zinc-600 ${
                    discountType === "fixed"
                      ? "bg-rose-500 text-white"
                      : "bg-white text-slate-500 hover:bg-slate-50 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  Rs
                </button>
              </div>
            </div>

            {/* Payment Method 3-Buttons */}
            <div>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  onClick={() => setPaymentMethod("cash")}
                  className={`flex items-center justify-center gap-1 rounded-lg border-2 py-1.5 text-xs font-black transition-all ${
                    paymentMethod === "cash"
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "border-slate-200 bg-white text-slate-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" /></svg>
                  Cash
                </button>
                <button
                  onClick={() => setPaymentMethod("card")}
                  className={`flex items-center justify-center gap-1 rounded-lg border-2 py-1.5 text-xs font-black transition-all ${
                    paymentMethod === "card"
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
                      : "border-slate-200 bg-white text-slate-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" /></svg>
                  Card
                </button>
                <button
                  onClick={() => setPaymentMethod("credit")}
                  className={`flex items-center justify-center gap-1 rounded-lg border-2 py-1.5 text-xs font-black transition-all ${
                    paymentMethod === "credit"
                      ? "border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                      : "border-slate-200 bg-white text-slate-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                  Udhaar
                </button>
              </div>
              {paymentMethod === "credit" && !selectedCustomer && (
                <p className="mt-1 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                  ⚠ Please select a customer for Udhaar.
                </p>
              )}
            </div>
          </div>
        )}
        <button
          onClick={handleCheckoutClick}
          disabled={cart.length === 0}
          className={`w-full rounded-xl py-3.5 text-sm font-black tracking-wide shadow-md transition-all duration-200 active:scale-[0.99] ${
            cart.length > 0
              ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-indigo-500/25 hover:from-indigo-500 hover:to-violet-500"
              : "cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-zinc-800 dark:text-zinc-600 shadow-none"
          }`}
        >
          {checkoutLabel()}
        </button>
      </div>
    </div>

    {/* Sticky View Cart FAB — mobile only (below md), hidden when drawer is open */}
    <div
      className={`fixed inset-x-0 bottom-0 z-30 px-4 pt-3 md:hidden transition-transform duration-300 ${
        isMobileCartOpen ? "translate-y-full pointer-events-none" : "translate-y-0"
      }`}
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 1rem))" }}
    >
      <button
        onClick={() => setIsMobileCartOpen(true)}
        className={`relative w-full flex items-center justify-between rounded-2xl px-5 py-4 text-sm font-black shadow-2xl transition-all duration-200 active:scale-[0.98] ${
          cart.length > 0
            ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-indigo-500/40"
            : "border border-slate-200 bg-white text-slate-700 shadow-slate-200/60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
        }`}
        aria-label="Open cart"
      >
        <div className="flex items-center gap-3">
          <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${
            cart.length > 0 ? "bg-white/20" : "bg-slate-100 dark:bg-zinc-800"
          }`}>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
            </svg>
          </div>
          <span>{cart.length > 0 ? `${cartItemCount} item${cartItemCount !== 1 ? "s" : ""} in cart` : "View Cart"}</span>
        </div>
        <div className="flex items-center gap-3">
          {cart.length > 0 && (
            <span className="text-base font-black">Rs.&nbsp;{discountedTotal.toLocaleString()}</span>
          )}
          {cartItemCount > 0 && (
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-400 px-1.5 text-[11px] font-black text-black shadow-sm">
              {cartItemCount}
            </span>
          )}
        </div>
      </button>
    </div>
    </>
  );
}
