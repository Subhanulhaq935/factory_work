"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import type { Sale, Customer, Product, SaleItem } from "../types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MANAGER_PASSWORD = process.env.NEXT_PUBLIC_MANAGER_PASSWORD ?? "";

interface EditCartItem {
  productId:       string;
  productName:     string;
  productNameUrdu: string;
  productCode?:    string;
  quantity:        number;
  unitPrice:       number;
  totalPrice:      number;
}

interface EditBillModalProps {
  sale:      Sale;
  customers: Customer[];
  products:  Product[];
  isOnline:  boolean;
  onClose:   () => void;
  onSuccess: (newSale: Sale) => void;
}

function uuidEB(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Product Search Dropdown ──────────────────────────────────────────────────

function ProductSearch({
  products,
  onSelect,
}: {
  products: Product[];
  onSelect: (p: Product) => void;
}) {
  const [q, setQ]           = useState("");
  const [open, setOpen]     = useState(false);
  const ref                 = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!q.trim()) return [];
    const ql = q.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(ql) ||
        p.nameUrdu.includes(q) ||
        (p.code && p.code.includes(q))
    ).slice(0, 20);
  }, [products, q]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        placeholder="Search product to add..."
        value={q}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        className="block w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-xs font-bold text-slate-900 focus:border-violet-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
      />
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-[300] mt-1 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-800">
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                onSelect(p);
                setQ("");
                setOpen(false);
              }}
              className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-violet-50 active:bg-violet-100 dark:hover:bg-violet-950/20 border-b border-slate-100 dark:border-zinc-700/60 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black text-slate-900 dark:text-white truncate">{p.name}</p>
                <p className="text-[10px] text-slate-400 dark:text-zinc-400 font-urdu" dir="rtl">{p.nameUrdu}</p>
              </div>
              <span className="ml-2 text-xs font-black text-indigo-600 dark:text-indigo-400 whitespace-nowrap">Rs. {p.price.toLocaleString()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main EditBillModal ───────────────────────────────────────────────────────

export default function EditBillModal({
  sale,
  customers,
  products,
  isOnline,
  onClose,
  onSuccess,
}: EditBillModalProps) {
  // ── Initialise from original sale ─────────────────────────────────────────
  const [items, setItems] = useState<EditCartItem[]>(
    sale.items.map((item) => ({
      productId:       item.productId,
      productName:     item.productName,
      productNameUrdu: item.productNameUrdu ?? "",
      productCode:     item.productCode,
      quantity:        item.quantity,
      unitPrice:       item.unitPrice,
      totalPrice:      item.totalPrice,
    }))
  );

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    customers.find((c) => c.customerId === sale.customerId) ?? null
  );
  const [customerSearch,  setCustomerSearch]  = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [custSearchOpen,  setCustSearchOpen]  = useState(false);
  const [customerName,    setCustomerName]    = useState(sale.customerName ?? "");
  const custDropRef = useRef<HTMLDivElement>(null);

  const [discountInput, setDiscountInput]     = useState(String(sale.discountAmount || ""));
  const [paymentMethod, setPaymentMethod]     = useState<"cash" | "card" | "credit">(sale.paymentMethod);
  const [editNote,      setEditNote]          = useState("");

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  // ── Customer search ────────────────────────────────────────────────────────
  const searchCustomers = useCallback((q: string) => {
    if (!q.trim()) { setCustomerResults([]); return; }
    const ql = q.toLowerCase();
    setCustomerResults(
      customers.filter(
        (c) => c.name.toLowerCase().includes(ql) || c.phone.toLowerCase().includes(ql)
      ).slice(0, 20)
    );
  }, [customers]);

  useEffect(() => {
    const t = setTimeout(() => searchCustomers(customerSearch), 200);
    return () => clearTimeout(t);
  }, [customerSearch, searchCustomers]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (custDropRef.current && !custDropRef.current.contains(e.target as Node)) {
        setCustSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Computed totals ────────────────────────────────────────────────────────
  const subtotal = useMemo(
    () => items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0),
    [items]
  );
  const discountAmount = useMemo(() => {
    const d = parseFloat(discountInput) || 0;
    return Math.min(Math.max(0, Math.round(d)), subtotal);
  }, [discountInput, subtotal]);
  const totalAmount = subtotal - discountAmount;

  // ── Credit delta info (for user warning) ──────────────────────────────────
  const origWasCredit = sale.paymentMethod === "credit";
  const newIsCredit   = paymentMethod === "credit";
  let creditDeltaMsg  = "";

  if (origWasCredit && newIsCredit && totalAmount !== sale.totalAmount) {
    const delta = totalAmount - sale.totalAmount;
    creditDeltaMsg = `Customer's outstanding balance will ${delta > 0 ? "increase" : "decrease"} by Rs. ${Math.abs(delta).toLocaleString()}`;
  } else if (origWasCredit && !newIsCredit) {
    creditDeltaMsg = `Rs. ${sale.totalAmount.toLocaleString()} will be removed from customer's outstanding balance`;
  } else if (!origWasCredit && newIsCredit) {
    creditDeltaMsg = `Rs. ${totalAmount.toLocaleString()} will be added to customer's outstanding balance`;
  }

  // ── Item mutation handlers ─────────────────────────────────────────────────
  const addItem = (p: Product) => {
    setItems((prev) => {
      const existing = prev.findIndex((i) => i.productId === p.id);
      if (existing >= 0) {
        return prev.map((item, idx) =>
          idx === existing
            ? { ...item, quantity: item.quantity + 1, totalPrice: item.unitPrice * (item.quantity + 1) }
            : item
        );
      }
      return [...prev, {
        productId:       p.id,
        productName:     p.name,
        productNameUrdu: p.nameUrdu,
        productCode:     p.code,
        quantity:        1,
        unitPrice:       p.price,
        totalPrice:      p.price,
      }];
    });
  };

  const updateQty = (idx: number, qty: number) => {
    if (qty <= 0) {
      setItems((prev) => prev.filter((_, i) => i !== idx));
      return;
    }
    setItems((prev) =>
      prev.map((item, i) =>
        i === idx ? { ...item, quantity: qty, totalPrice: item.unitPrice * qty } : item
      )
    );
  };

  const updatePrice = (idx: number, price: number) => {
    const p = Math.max(0, price);
    setItems((prev) =>
      prev.map((item, i) =>
        i === idx ? { ...item, unitPrice: p, totalPrice: p * item.quantity } : item
      )
    );
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!isOnline) {
      setError("Editing bills requires an internet connection.");
      return;
    }
    if (items.length === 0) {
      setError("At least one item is required.");
      return;
    }
    if (newIsCredit && !selectedCustomer && !customerName.trim()) {
      setError("A customer must be selected for credit sales.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/bills/edit", {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          "x-manager-password": MANAGER_PASSWORD,
        },
        body: JSON.stringify({
          originalInvoiceNumber: sale.invoiceNumber,
          newBill: {
            customerId:     selectedCustomer?.customerId,
            customerName:   (selectedCustomer?.name ?? customerName.trim()) || undefined,
            items:          items.map((item) => ({
              productId:       item.productId,
              productName:     item.productName,
              productNameUrdu: item.productNameUrdu,
              productCode:     item.productCode,
              quantity:        item.quantity,
              unitPrice:       item.unitPrice,
              totalPrice:      item.totalPrice,
            })),
            subtotal,
            discountAmount,
            totalAmount,
            paymentMethod,
            editNote: editNote.trim() || undefined,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save edited bill.");
        return;
      }

      onSuccess(data.newBill as Sale);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[96vh] flex flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl dark:bg-zinc-900">

        {/* Header */}
        <div className="flex items-center justify-between bg-gradient-to-r from-violet-600 to-indigo-700 px-5 py-4 sm:px-6 sm:py-5 text-white flex-shrink-0">
          <div>
            <h2 className="text-base sm:text-lg font-black">Edit Bill</h2>
            <p className="text-xs sm:text-sm font-bold text-violet-200">
              Original: {sale.invoiceNumber} · A new bill number will be assigned
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-violet-200 hover:bg-white/10 hover:text-white transition-colors">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Offline warning */}
        {!isOnline && (
          <div className="flex-shrink-0 bg-amber-50 border-b border-amber-200 px-5 py-3 dark:bg-amber-950/20 dark:border-amber-900/40">
            <p className="text-xs font-black text-amber-700 dark:text-amber-400">⚠ Offline — editing bills requires an internet connection.</p>
          </div>
        )}

        {/* Body — scrollable */}
        <div className="overflow-y-auto flex-1 p-5 sm:p-6 space-y-5 scrollbar-thin">

          {/* Original bill info box */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800/60 text-xs">
            <p className="font-black uppercase tracking-wider text-slate-400 dark:text-zinc-500 text-[10px]">Original Bill</p>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
              <span className="font-bold text-slate-700 dark:text-zinc-300">#{sale.invoiceNumber}</span>
              <span className="text-slate-500">Total: Rs. {sale.totalAmount.toLocaleString()}</span>
              <span className="text-slate-500">Payment: {sale.paymentMethod}</span>
              {sale.customerName && <span className="text-slate-500">Customer: {sale.customerName}</span>}
            </div>
          </div>

          {/* Customer selector */}
          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-400">Customer</label>
            <div ref={custDropRef} className="relative">
              {selectedCustomer ? (
                <div className="flex items-center justify-between rounded-xl border-2 border-violet-300 bg-violet-50 px-3 py-2 dark:border-violet-700 dark:bg-violet-950/30">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-violet-900 dark:text-violet-200 truncate">{selectedCustomer.name}</p>
                    <p className="text-[10px] font-bold text-violet-600 dark:text-violet-400">📞 {selectedCustomer.phone}</p>
                  </div>
                  <button
                    onClick={() => { setSelectedCustomer(null); setCustomerSearch(""); }}
                    className="ml-2 rounded-lg p-1 text-violet-400 hover:bg-violet-100 hover:text-violet-700"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ) : (
                <div>
                  <input
                    type="text"
                    placeholder="Search customer by name or phone..."
                    value={customerSearch}
                    onFocus={() => setCustSearchOpen(true)}
                    onChange={(e) => { setCustomerSearch(e.target.value); setCustSearchOpen(true); }}
                    className="block w-full rounded-xl border-2 border-slate-200 px-3.5 py-2.5 text-sm font-bold text-slate-900 focus:border-violet-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  />
                  {custSearchOpen && customerResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 z-[200] mt-1 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-800">
                      {customerResults.map((c) => (
                        <button
                          key={c.customerId}
                          type="button"
                          onPointerDown={(e) => {
                            e.preventDefault();
                            setSelectedCustomer(c);
                            setCustomerSearch("");
                            setCustSearchOpen(false);
                          }}
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-violet-50 dark:hover:bg-violet-950/20 border-b border-slate-100 dark:border-zinc-700/60 last:border-0"
                        >
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-xs font-black text-white">
                            {c.name.charAt(0)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-black text-slate-900 dark:text-white truncate">{c.name}</p>
                            <p className="text-[10px] font-bold text-slate-400 dark:text-zinc-400">📞 {c.phone}</p>
                          </div>
                          {c.outstandingBalance > 0 && (
                            <span className="text-[10px] font-black text-rose-600">Due Rs. {c.outstandingBalance.toLocaleString()}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  {!selectedCustomer && (
                    <input
                      type="text"
                      placeholder="Or type walk-in customer name (optional)"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="mt-2 block w-full rounded-xl border-2 border-slate-200 px-3.5 py-2 text-sm font-bold text-slate-900 focus:border-violet-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                    />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-400">Items</label>
              <span className="text-xs font-bold text-slate-500">{items.length} item{items.length !== 1 ? "s" : ""}</span>
            </div>

            <div className="space-y-2 mb-3">
              {items.map((item, idx) => (
                <div key={`${item.productId}-${idx}`} className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/60">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-slate-900 dark:text-white">{item.productName}</p>
                    {item.productNameUrdu && (
                      <p className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 font-urdu" dir="rtl">{item.productNameUrdu}</p>
                    )}
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="text-[10px] font-bold text-slate-400">Price:</span>
                      <input
                        type="number"
                        min="0"
                        value={item.unitPrice}
                        onChange={(e) => updatePrice(idx, parseFloat(e.target.value) || 0)}
                        className="w-24 rounded-lg border border-slate-200 px-2 py-0.5 text-xs font-black text-slate-900 focus:border-violet-400 focus:outline-none dark:border-zinc-600 dark:bg-zinc-700 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <button onClick={() => removeItem(idx)} className="text-slate-300 hover:text-rose-500 transition-colors dark:text-zinc-600 dark:hover:text-rose-400">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                    </button>
                    <div className="flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-zinc-600 dark:bg-zinc-700">
                      <button onClick={() => updateQty(idx, item.quantity - 1)} className="flex h-6 w-7 items-center justify-center text-xs font-bold text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:text-zinc-400 dark:hover:bg-rose-950/30 transition-colors">−</button>
                      <span className="min-w-7 px-1 text-center text-xs font-black text-slate-800 dark:text-zinc-100">{item.quantity}</span>
                      <button onClick={() => updateQty(idx, item.quantity + 1)} className="flex h-6 w-7 items-center justify-center text-xs font-bold text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 dark:text-zinc-400 dark:hover:bg-indigo-950/30 transition-colors">+</button>
                    </div>
                    <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">Rs. {item.totalPrice.toLocaleString()}</span>
                  </div>
                </div>
              ))}

              {items.length === 0 && (
                <div className="rounded-xl border-2 border-dashed border-slate-200 py-6 text-center dark:border-zinc-700">
                  <p className="text-xs font-bold text-slate-400">No items. Add at least one product.</p>
                </div>
              )}
            </div>

            {/* Product search to add */}
            <ProductSearch products={products} onSelect={addItem} />
          </div>

          {/* Discount */}
          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-400">Discount (Rs.)</label>
            <input
              type="number"
              min="0"
              max={subtotal}
              value={discountInput}
              onChange={(e) => setDiscountInput(e.target.value)}
              placeholder="0"
              className="block w-full rounded-xl border-2 border-slate-200 px-3.5 py-2.5 text-sm font-bold text-slate-900 focus:border-violet-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
            />
          </div>

          {/* Payment method */}
          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-400">Payment Method</label>
            <div className="grid grid-cols-3 gap-2">
              {(["cash", "card", "credit"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setPaymentMethod(m)}
                  className={`rounded-xl border-2 py-2.5 text-xs font-black transition-all capitalize ${
                    paymentMethod === m
                      ? "border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
                      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  {m === "cash" ? "💵 Cash" : m === "credit" ? "📋 Udhaar" : "💳 Card"}
                </button>
              ))}
            </div>
          </div>

          {/* Credit delta warning */}
          {creditDeltaMsg && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/20">
              <p className="text-xs font-black text-amber-700 dark:text-amber-400">⚠ Credit Balance Change</p>
              <p className="mt-0.5 text-xs font-bold text-amber-600 dark:text-amber-500">{creditDeltaMsg}</p>
            </div>
          )}

          {/* Totals summary */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800/60 space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-600 dark:text-zinc-400">
              <span className="font-bold">Subtotal</span>
              <span className="font-black">Rs. {subtotal.toLocaleString()}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-rose-500">
                <span className="font-bold">Discount</span>
                <span className="font-black">- Rs. {discountAmount.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-black text-slate-900 dark:text-white border-t border-slate-200 dark:border-zinc-700 pt-1.5">
              <span>New Total</span>
              <span className="text-violet-700 dark:text-violet-300">Rs. {totalAmount.toLocaleString()}</span>
            </div>
          </div>

          {/* Edit note */}
          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-400">Edit Note (Optional)</label>
            <input
              type="text"
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              placeholder="e.g. Price correction, added missing item..."
              className="block w-full rounded-xl border-2 border-slate-200 px-3.5 py-2.5 text-sm font-bold text-slate-900 focus:border-violet-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 dark:border-rose-900/40 dark:bg-rose-950/20">
              <p className="text-sm font-bold text-rose-600 dark:text-rose-400">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-slate-200 dark:border-zinc-800 p-4 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border-2 border-slate-200 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !isOnline || items.length === 0}
            className="flex-1 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 py-3 text-sm font-black text-white shadow-lg shadow-violet-500/25 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-60 transition-all active:scale-[0.98]"
          >
            {saving ? "Saving…" : "Save & Create New Bill"}
          </button>
        </div>
      </div>
    </div>
  );
}
