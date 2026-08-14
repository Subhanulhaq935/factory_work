"use client";

import { useState, useEffect, useCallback } from "react";
import type { Customer, Sale, CustomerPayment, LedgerRow } from "../types";
import {
  saveCustomers,
  searchCustomersLocal,
  getCustomerById,
  putCustomer,
  addToSyncQueue,
} from "@/lib/offlineDB";

function uuidCM(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function pmLabel(pm: string) {
  if (pm === "cash") return "💵 Cash";
  if (pm === "credit") return "📋 Udhaar";
  return "💳 Card";
}

// ─── Build ledger from sales + payments ──────────────────────────────────────

function buildLedger(sales: Sale[], payments: CustomerPayment[]): LedgerRow[] {
  const rows: LedgerRow[] = [];

  for (const s of sales) {
    rows.push({
      date:          s.createdAt,
      description:   s.paymentMethod === "credit" ? "Credit Sale" : "Sale",
      invoiceNumber: s.invoiceNumber,
      debit:         s.paymentMethod === "credit" ? s.totalAmount : 0,
      credit:        s.paymentMethod !== "credit" ? s.totalAmount : 0,
      balance:       0,
      type:          "sale",
    });
  }

  for (const p of payments) {
    rows.push({
      date:        p.createdAt,
      description: "Payment Received",
      debit:       0,
      credit:      p.amount,
      balance:     0,
      type:        "payment",
    });
  }

  // Sort by date ascending to calculate running balance
  rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Calculate running balance (only credit sales add to debit balance)
  let running = 0;
  for (const r of rows) {
    if (r.type === "sale" && r.debit > 0) running += r.debit;
    if (r.type === "payment") running -= r.credit;
    r.balance = Math.max(0, running);
  }

  return rows.reverse(); // newest first for display
}

// ─── Payment Modal ────────────────────────────────────────────────────────────

function RecordPaymentModal({
  customer,
  onClose,
  onSuccess,
}: {
  customer: Customer;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "card">("cash");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    const num = parseFloat(amount);
    if (!num || num <= 0) { setError("Enter a valid amount."); return; }
    if (num > customer.outstandingBalance) {
      setError(`Cannot exceed outstanding balance: Rs. ${customer.outstandingBalance.toLocaleString()}`);
      return;
    }
    setLoading(true);
    setError("");

    if (!navigator.onLine) {
      try {
        const newBal = Math.max(0, customer.outstandingBalance - num);
        await putCustomer({
          ...customer,
          outstandingBalance: newBal,
          updatedAt: new Date().toISOString(),
        });
        onSuccess();
      } catch {
        setError("Failed to update payment locally.");
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const res = await fetch(`/api/customers/${customer.customerId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: num, paymentMethod: method, notes: notes.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to record payment"); return; }
      const newBal = Math.max(0, customer.outstandingBalance - num);
      await putCustomer({
        ...customer,
        outstandingBalance: newBal,
        updatedAt: new Date().toISOString(),
      }).catch(() => {});
      onSuccess();
    } catch { setError("Network error. Try again."); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 p-0 sm:p-4 backdrop-blur-sm">
      <div className="w-full max-w-md max-h-[92vh] flex flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl dark:bg-zinc-900">
        <div className="flex items-center justify-between bg-gradient-to-r from-violet-600 to-indigo-700 px-5 py-4 sm:px-6 sm:py-5 text-white">
          <div>
            <h2 className="text-base sm:text-lg font-black">Record Payment</h2>
            <p className="text-xs sm:text-sm font-bold text-violet-200 truncate max-w-[260px]">{customer.name}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-violet-200 hover:bg-white/10 hover:text-white transition-colors"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="overflow-y-auto p-5 sm:p-6 space-y-4 scrollbar-thin">
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 dark:border-rose-900/40 dark:bg-rose-950/20">
            <p className="text-[10px] font-black uppercase tracking-wider text-rose-500 dark:text-rose-400">Outstanding Balance</p>
            <p className="mt-0.5 text-xl sm:text-2xl font-black text-rose-700 dark:text-rose-300">Rs. {customer.outstandingBalance.toLocaleString()}</p>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-400">Payment Amount (Rs.)</label>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              max={customer.outstandingBalance}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`Max: Rs. ${customer.outstandingBalance.toLocaleString()}`}
              className="block w-full rounded-xl border-2 border-slate-200 px-3.5 py-2.5 sm:py-3 text-base sm:text-lg font-black text-slate-900 focus:border-violet-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-400">Payment Method</label>
            <div className="grid grid-cols-2 gap-2">
              {(["cash", "card"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  className={`rounded-xl border-2 py-2.5 text-xs sm:text-sm font-black transition-all capitalize ${
                    method === m
                      ? "border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
                      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  {m === "cash" ? "💵 Cash" : "💳 Card"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-400">Notes (Optional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Partial payment, receipt #..."
              className="block w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm font-bold text-slate-900 focus:border-violet-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
            />
          </div>

          {error && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs sm:text-sm font-bold text-rose-600 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
              {error}
            </p>
          )}

          <div className="flex gap-2 sm:gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 rounded-xl border-2 border-slate-200 py-2.5 sm:py-3 text-xs sm:text-sm font-bold text-slate-600 hover:bg-slate-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 py-2.5 sm:py-3 text-xs sm:text-sm font-black text-white shadow-lg shadow-violet-500/25 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-60 transition-all active:scale-[0.98]"
            >
              {loading ? "Recording…" : "Record Payment"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Customer Profile ─────────────────────────────────────────────────────────

function CustomerProfile({
  customerId,
  onBack,
}: {
  customerId: string;
  onBack: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [stats, setStats] = useState({ totalPurchases: 0, totalAmount: 0, totalPaid: 0, outstanding: 0 });
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [activeTab, setActiveTab] = useState<"ledger" | "purchases">("ledger");

  const load = useCallback(async () => {
    setLoading(true);
    if (navigator.onLine) {
      try {
        const res = await fetch(`/api/customers/${customerId}`);
        if (res.ok) {
          const data = await res.json();
          setCustomer(data.customer);
          setSales(data.sales ?? []);
          setPayments(data.payments ?? []);
          setStats(data.stats ?? {});
          if (data.customer) {
            await putCustomer(data.customer).catch(() => {});
          }
          setLoading(false);
          return;
        }
      } catch {
        // Fall back to local customer
      }
    }

    // Offline mode: load customer from IndexedDB
    try {
      const localCustomer = (await getCustomerById(customerId)) as Customer | undefined;
      if (localCustomer) {
        setCustomer(localCustomer);
        setStats({
          totalPurchases: 0,
          totalAmount: 0,
          totalPaid: 0,
          outstanding: localCustomer.outstandingBalance ?? 0,
        });
      }
    } catch (e) {
      console.warn("Failed to load customer locally:", e);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-200 border-t-violet-600" />
      </div>
    );
  }

  if (!customer) return <p className="p-8 text-center text-sm font-bold text-slate-500">Customer not found.</p>;

  const ledger = buildLedger(sales, payments);

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Back button */}
      <div>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors shadow-sm"
        >
          <svg className="h-4 w-4 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" /></svg>
          Back to Customers
        </button>
      </div>

      {/* Customer Header card */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="bg-gradient-to-r from-violet-600 to-indigo-700 px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg sm:text-2xl font-black text-white truncate">{customer.name}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm font-bold text-violet-100">
                <span>📞 {customer.phone}</span>
                {customer.address && <span className="truncate">📍 {customer.address}</span>}
              </div>
              <p className="mt-2 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-violet-300">
                Customer ID: <span className="font-mono">{customer.customerId}</span> · Registered: {fmtDate(customer.createdAt)}
              </p>
            </div>

            {customer.outstandingBalance > 0 ? (
              <div className="flex-shrink-0 self-start sm:self-auto rounded-xl border border-white/20 bg-rose-500/30 px-3.5 py-2 text-left sm:text-right backdrop-blur-sm">
                <p className="text-[10px] font-black uppercase tracking-wider text-rose-200">Outstanding Balance</p>
                <p className="text-base sm:text-xl font-black text-white">Rs. {customer.outstandingBalance.toLocaleString()}</p>
              </div>
            ) : (
              <div className="flex-shrink-0 self-start sm:self-auto rounded-xl border border-white/20 bg-emerald-500/30 px-3.5 py-2 text-left sm:text-right backdrop-blur-sm">
                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-200">Account Status</p>
                <p className="text-xs sm:text-sm font-black text-white">Clear ✓ (No Dues)</p>
              </div>
            )}
          </div>
        </div>

        {/* 4 Summary Stats */}
        <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 dark:divide-zinc-800 sm:grid-cols-4 sm:divide-y-0 bg-slate-50/50 dark:bg-zinc-900/50">
          {[
            { label: "Total Purchases", value: `${stats.totalPurchases} bill${stats.totalPurchases !== 1 ? 's' : ''}` },
            { label: "Total Amount", value: `Rs. ${stats.totalAmount.toLocaleString()}` },
            { label: "Total Paid", value: `Rs. ${stats.totalPaid.toLocaleString()}` },
            { label: "Outstanding", value: `Rs. ${stats.outstanding.toLocaleString()}`, highlight: stats.outstanding > 0 },
          ].map((s) => (
            <div key={s.label} className="p-3 sm:p-4">
              <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-zinc-500">{s.label}</p>
              <p className={`mt-0.5 text-sm sm:text-base font-black truncate ${s.highlight ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-white"}`}>
                {s.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Record Payment action CTA if balance exists */}
      {customer.outstandingBalance > 0 && (
        <button
          onClick={() => setShowPaymentModal(true)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 sm:py-3.5 text-xs sm:text-sm font-black text-white shadow-lg shadow-violet-500/25 hover:from-violet-500 hover:to-indigo-500 active:scale-[0.99] transition-all"
        >
          <svg className="h-4 w-4 sm:h-5 sm:w-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Record Customer Payment (Rs. {customer.outstandingBalance.toLocaleString()} Due)
        </button>
      )}

      {/* Ledger vs Purchases tabs */}
      <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800">
        {(["ledger", "purchases"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`flex-1 rounded-lg py-2 text-xs sm:text-sm font-black transition-all ${
              activeTab === t
                ? "bg-white text-violet-700 shadow-sm dark:bg-zinc-800 dark:text-violet-300"
                : "text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            {t === "ledger" ? "📒 Customer Ledger" : "🛒 Purchase History"}
          </button>
        ))}
      </div>

      {/* ─── Tab 1: Ledger ─── */}
      {activeTab === "ledger" && (
        <div className="space-y-3">
          {ledger.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white py-12 text-center dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-sm font-bold text-slate-400 dark:text-zinc-500">No transactions recorded for this customer yet.</p>
            </div>
          ) : (
            <>
              {/* Desktop / Tablet Table View (>= sm) */}
              <div className="hidden sm:block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[580px] text-sm">
                    <thead className="border-b-2 border-slate-900 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/60">
                      <tr>
                        {["Date", "Description", "Bill #", "Debit (Rs.)", "Credit (Rs.)", "Balance (Rs.)"].map((h, i) => (
                          <th
                            key={h}
                            className={`px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-700 dark:text-zinc-300 ${
                              i >= 3 ? "text-right" : "text-left"
                            }`}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                      {ledger.map((row, i) => (
                        <tr key={i} className={`hover:bg-slate-50/80 dark:hover:bg-zinc-800/40 transition-colors ${i % 2 === 1 ? "bg-slate-50/40 dark:bg-zinc-900/40" : ""}`}>
                          <td className="px-4 py-3 text-xs font-bold text-slate-600 dark:text-zinc-400 whitespace-nowrap">{fmtDate(row.date)}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-black ${
                              row.type === "sale" && row.debit > 0
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                                : row.type === "payment"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                                : "bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300"
                            }`}>
                              {row.description}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs font-bold text-slate-500 dark:text-zinc-400">{row.invoiceNumber ?? "—"}</td>
                          <td className="px-4 py-3 text-right font-black text-rose-600 dark:text-rose-400">
                            {row.debit > 0 ? `${row.debit.toLocaleString()}` : "—"}
                          </td>
                          <td className="px-4 py-3 text-right font-black text-emerald-600 dark:text-emerald-400">
                            {row.credit > 0 ? `${row.credit.toLocaleString()}` : "—"}
                          </td>
                          <td className={`px-4 py-3 text-right font-black ${row.balance > 0 ? "text-rose-700 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                            Rs. {row.balance.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Card List View (< sm) */}
              <div className="block sm:hidden space-y-2.5">
                {ledger.map((row, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`rounded-md px-2 py-0.5 text-[10px] font-black ${
                        row.type === "sale" && row.debit > 0
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                          : row.type === "payment"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : "bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300"
                      }`}>
                        {row.description}
                      </span>
                      <span className="text-[11px] font-bold text-slate-400 dark:text-zinc-500">{fmtDate(row.date)}</span>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between text-xs border-t border-slate-100 dark:border-zinc-800 pt-2">
                      <span className="font-mono text-slate-500 dark:text-zinc-400">{row.invoiceNumber ? `#${row.invoiceNumber}` : "Payment"}</span>
                      {row.debit > 0 ? (
                        <span className="font-black text-rose-600 dark:text-rose-400">+ Rs. {row.debit.toLocaleString()}</span>
                      ) : (
                        <span className="font-black text-emerald-600 dark:text-emerald-400">− Rs. {row.credit.toLocaleString()}</span>
                      )}
                    </div>

                    <div className="mt-1.5 flex items-center justify-between text-xs bg-slate-50 dark:bg-zinc-800/50 rounded-lg px-2.5 py-1.5">
                      <span className="text-[10px] font-black uppercase text-slate-400 dark:text-zinc-500">Balance</span>
                      <span className={`font-black ${row.balance > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                        Rs. {row.balance.toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── Tab 2: Purchases ─── */}
      {activeTab === "purchases" && (
        <div className="space-y-3">
          {sales.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white py-12 text-center dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-sm font-bold text-slate-400 dark:text-zinc-500">No purchases found for this customer.</p>
            </div>
          ) : (
            sales.map((s) => (
              <div
                key={s.invoiceNumber}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-800/40">
                  <div className="min-w-0">
                    <p className="font-mono text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate">{s.invoiceNumber}</p>
                    <p className="text-[11px] font-bold text-slate-400 dark:text-zinc-500">{fmtDate(s.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <span className={`rounded-full px-2 sm:px-2.5 py-0.5 text-[10px] font-black ${
                      s.paymentMethod === "credit"
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                        : s.paymentMethod === "cash"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                        : "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300"
                    }`}>
                      {pmLabel(s.paymentMethod)}
                    </span>
                    <span className={`rounded-full px-2 sm:px-2.5 py-0.5 text-[10px] font-black ${
                      s.paymentStatus === "paid"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                        : "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                    }`}>
                      {s.paymentStatus === "paid" ? "Paid" : "Pending"}
                    </span>
                  </div>
                </div>

                <div className="p-4 space-y-2">
                  <div className="divide-y divide-slate-100 dark:divide-zinc-800 text-xs">
                    {s.items.map((item, ii) => (
                      <div key={ii} className="flex items-start justify-between py-1.5 gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-800 dark:text-zinc-200 truncate">{item.productName}</p>
                          {item.productNameUrdu && (
                            <p className="font-urdu text-[11px] text-slate-500 dark:text-zinc-400" dir="rtl">{item.productNameUrdu}</p>
                          )}
                          <p className="text-[10px] text-slate-400 dark:text-zinc-500">
                            Qty: <span className="font-bold">{item.quantity}</span> × Rs. {item.unitPrice.toLocaleString()}
                          </p>
                        </div>
                        <span className="font-black text-slate-900 dark:text-white whitespace-nowrap">
                          Rs. {item.totalPrice.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-slate-100 dark:border-zinc-800 pt-2 space-y-1 text-xs">
                    {s.discountAmount > 0 && (
                      <div className="flex justify-between text-rose-500">
                        <span className="font-bold">Discount</span>
                        <span className="font-black">− Rs. {s.discountAmount.toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm sm:text-base font-black text-slate-900 dark:text-white pt-1">
                      <span>Total Amount</span>
                      <span className="text-violet-700 dark:text-violet-300">Rs. {s.totalAmount.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Payment modal */}
      {showPaymentModal && (
        <RecordPaymentModal
          customer={customer}
          onClose={() => setShowPaymentModal(false)}
          onSuccess={() => { setShowPaymentModal(false); load(); }}
        />
      )}
    </div>
  );
}

// ─── Add Customer Form ────────────────────────────────────────────────────────

function AddCustomerForm({ onSuccess, onCancel }: { onSuccess: (c: Customer) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [duplicate, setDuplicate] = useState<Customer | null>(null);

  const handleSubmit = async () => {
    if (!name.trim() || !phone.trim()) { setError("Name and phone are required."); return; }
    setLoading(true);
    setError("");
    setDuplicate(null);

    if (!navigator.onLine) {
      // Offline creation: check local cache for duplicate
      try {
        const localCustomers = (await searchCustomersLocal("")) as Customer[];
        const dup = localCustomers.find((c) => c.phone.trim() === phone.trim());
        if (dup) {
          setDuplicate(dup);
          setLoading(false);
          return;
        }

        const tempId = `CUST-OFFLINE-${uuidCM()}`;
        const newCust: Customer = {
          customerId:         tempId,
          name:               name.trim(),
          phone:              phone.trim(),
          address:            address.trim(),
          outstandingBalance: 0,
          createdAt:          new Date().toISOString(),
          updatedAt:          new Date().toISOString(),
        };

        await putCustomer(newCust);
        await addToSyncQueue({
          id:                  uuidCM(),
          type:                "create",
          entity:              "customer",
          customerId:          tempId,
          payload: {
            name:     newCust.name,
            phone:    newCust.phone,
            address:  newCust.address,
            clientId: tempId,
          },
          clientTransactionId: tempId,
          createdAt:           Date.now(),
          status:              "pending",
          retryCount:          0,
        });

        onSuccess(newCust);
      } catch {
        setError("Failed to save customer locally.");
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim(), address: address.trim() }),
      });
      const data = await res.json();
      if (res.status === 409 && data.existing) {
        await putCustomer(data.existing).catch(() => {});
        setDuplicate(data.existing);
        return;
      }
      if (!res.ok) { setError(data.error ?? "Failed to create customer"); return; }
      await putCustomer(data).catch(() => {});
      onSuccess(data);
    } catch { setError("Network error. Try again."); }
    finally { setLoading(false); }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="bg-gradient-to-r from-violet-600 to-indigo-700 px-5 py-4 sm:px-6 sm:py-5">
        <h2 className="text-base sm:text-lg font-black text-white">Add New Customer</h2>
        <p className="text-xs font-bold text-violet-200">Customer record will be saved permanently for future purchases & credit ledger</p>
      </div>
      <div className="space-y-4 p-5 sm:p-6">
        <div>
          <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-400">Full Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Muhammad Ali"
            className="block w-full rounded-xl border-2 border-slate-200 px-3.5 py-2.5 text-sm font-bold text-slate-900 focus:border-violet-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-400">Phone Number *</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. 0300-1234567"
            className="block w-full rounded-xl border-2 border-slate-200 px-3.5 py-2.5 text-sm font-bold text-slate-900 focus:border-violet-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-400">Address (Optional)</label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="e.g. Badami Bagh, Lahore"
            className="block w-full rounded-xl border-2 border-slate-200 px-3.5 py-2.5 text-sm font-bold text-slate-900 focus:border-violet-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
          />
        </div>

        {error && (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs sm:text-sm font-bold text-rose-600 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-400">
            {error}
          </p>
        )}

        {duplicate && (
          <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4 dark:border-amber-800/40 dark:bg-amber-950/20 space-y-2">
            <p className="text-xs font-black text-amber-700 dark:text-amber-400">⚠ A customer with this phone number already exists:</p>
            <div className="rounded-lg bg-white/80 p-2.5 dark:bg-zinc-800/80">
              <p className="font-black text-slate-900 dark:text-white">{duplicate.name}</p>
              <p className="text-xs font-bold text-slate-500 dark:text-zinc-400">📞 {duplicate.phone}</p>
            </div>
            <button
              onClick={() => onSuccess(duplicate)}
              className="w-full rounded-xl bg-amber-600 py-2 text-xs font-black text-white hover:bg-amber-500 transition-colors"
            >
              Select & Use Existing Customer
            </button>
          </div>
        )}

        <div className="flex gap-2 sm:gap-3 pt-2">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border-2 border-slate-200 py-2.5 sm:py-3 text-xs sm:text-sm font-bold text-slate-600 hover:bg-slate-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 py-2.5 sm:py-3 text-xs sm:text-sm font-black text-white shadow-lg shadow-violet-500/25 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-60 transition-all active:scale-[0.98]"
          >
            {loading ? "Saving…" : "Save Customer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main CustomerManager ─────────────────────────────────────────────────────

export default function CustomerManager() {
  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const loadCustomers = useCallback(async (q = "") => {
    setLoading(true);
    if (navigator.onLine) {
      try {
        const res = await fetch(`/api/customers?search=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data: Customer[] = await res.json();
          setCustomers(data);
          if (!q.trim()) {
            await saveCustomers(data).catch(() => {});
          } else {
            for (const c of data) {
              await putCustomer(c).catch(() => {});
            }
          }
          setLoading(false);
          return;
        }
      } catch {
        // Fall back to local storage
      }
    }

    // Offline / fallback: load from IndexedDB
    try {
      const local = (await searchCustomersLocal(q)) as Customer[];
      setCustomers(local);
    } catch (e) {
      console.warn("Failed to load local customers:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => loadCustomers(search), 300);
    return () => clearTimeout(t);
  }, [search, loadCustomers]);

  // Profile view
  if (selectedId) {
    return (
      <div className="mx-auto max-w-4xl px-3 py-4 pb-20 sm:px-6 sm:py-6 sm:pb-24 lg:px-8">
        <CustomerProfile customerId={selectedId} onBack={() => { setSelectedId(null); loadCustomers(search); }} />
      </div>
    );
  }

  // Add form view
  if (showAddForm) {
    return (
      <div className="mx-auto max-w-lg px-3 py-4 pb-20 sm:px-6 sm:py-6 sm:pb-24">
        <AddCustomerForm
          onSuccess={(c) => { setShowAddForm(false); setSelectedId(c.customerId); }}
          onCancel={() => setShowAddForm(false)}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 sm:space-y-5 px-3 py-4 pb-20 sm:px-6 sm:py-6 sm:pb-24 lg:px-8">

      {/* Header bar */}
      <div className="flex items-center justify-between gap-2 sm:gap-3">
        <div>
          <h2 className="text-lg sm:text-2xl font-black text-slate-900 dark:text-white">Customer Records</h2>
          <p className="text-xs font-bold text-slate-500 dark:text-zinc-400">
            {customers.length} customer{customers.length !== 1 ? "s" : ""} registered
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-1.5 sm:gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-black text-white shadow-lg shadow-violet-500/20 hover:from-violet-500 hover:to-indigo-500 active:scale-95 transition-all"
        >
          <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          <span className="hidden xs:inline">Add </span>Customer
        </button>
      </div>

      {/* Search Input */}
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
          <svg className="h-4 w-4 sm:h-5 sm:w-5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.637 10.637Z" />
          </svg>
        </div>
        <input
          type="text"
          placeholder="Search customers by name or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="block w-full rounded-2xl border-2 border-slate-200 bg-white py-2.5 sm:py-3 pl-10 sm:pl-12 pr-4 text-xs sm:text-sm font-bold text-slate-900 transition-colors focus:border-violet-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white shadow-sm"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        )}
      </div>

      {/* Customer list */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-200 border-t-violet-600" />
        </div>
      ) : customers.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white p-8 sm:p-12 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-violet-50 dark:bg-violet-950/20">
            <svg className="h-6 w-6 sm:h-7 sm:w-7 text-violet-500" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
            </svg>
          </div>
          <p className="mt-3 text-sm font-black text-slate-700 dark:text-zinc-300">
            {search ? `No customer found for "${search}"` : "No customers registered yet"}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-400 dark:text-zinc-500">
            {search ? "Try searching with a different name or phone number." : "Add a customer to track credit sales and complete purchase history."}
          </p>
          <button
            onClick={() => setShowAddForm(true)}
            className="mt-4 rounded-xl bg-violet-600 px-4 py-2 text-xs font-black text-white hover:bg-violet-500 transition-colors"
          >
            + Add New Customer
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {customers.map((c) => (
            <button
              key={c.customerId}
              onClick={() => setSelectedId(c.customerId)}
              className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4 text-left shadow-sm transition-all hover:border-violet-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-violet-700 active:scale-[0.99]"
            >
              <div className="min-w-0 flex-1 flex items-center gap-3">
                <div className="flex h-10 w-10 sm:h-11 sm:w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-sm sm:text-base font-black text-white shadow-sm">
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-black text-slate-900 dark:text-white truncate text-xs sm:text-sm">{c.name}</p>
                    <span className="hidden sm:inline font-mono text-[10px] text-slate-400 dark:text-zinc-500">#{c.customerId}</span>
                  </div>
                  <p className="text-xs font-bold text-slate-500 dark:text-zinc-400 mt-0.5">📞 {c.phone}</p>
                  {c.address && (
                    <p className="text-[11px] text-slate-400 dark:text-zinc-500 truncate mt-0.5">📍 {c.address}</p>
                  )}
                </div>
              </div>

              <div className="flex flex-shrink-0 flex-col items-end gap-1">
                {c.outstandingBalance > 0 ? (
                  <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] sm:text-xs font-black text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
                    Due Rs. {c.outstandingBalance.toLocaleString()}
                  </span>
                ) : (
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] sm:text-xs font-black text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                    Clear ✓
                  </span>
                )}
                <span className="text-[10px] font-bold text-slate-400 group-hover:text-violet-600 dark:group-hover:text-violet-400 flex items-center gap-0.5 transition-colors">
                  View Ledger →
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
