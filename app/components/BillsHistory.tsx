"use client";

import { useState, useEffect, useCallback } from "react";
import type { Sale, Customer, SaleItem } from "../types";
import EditBillModal from "./EditBillModal";
import ReceiptModal from "./ReceiptModal";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-PK", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true,
    });
  } catch { return iso; }
}



function pmLabel(pm: string | null | undefined): string {
  if (pm === "cash")   return "💵 Cash";
  if (pm === "credit") return "📋 Udhaar";
  if (pm === "card")   return "💳 Card";
  return pm ?? "—";
}

/**
 * Normalizes a raw sale object (from API or optimistic state update)
 * into the exact shape the UI expects. Guards every field against undefined/null.
 */
function normalizeSale(raw: Sale): Sale {
  const items: SaleItem[] = (Array.isArray(raw.items) ? raw.items : []).map((item) => ({
    productId:       String(item?.productId ?? ""),
    productName:     String(item?.productName ?? "Unknown Item"),
    productNameUrdu: String(item?.productNameUrdu ?? ""),
    productCode:     item?.productCode ?? undefined,
    quantity:        Number(item?.quantity ?? 1),
    unitPrice:       Number(item?.unitPrice ?? 0),
    totalPrice:      Number(item?.totalPrice ?? 0),
  }));
  return {
    _id:            raw._id ?? undefined,
    invoiceNumber:  raw.invoiceNumber ?? "—",
    customerId:     raw.customerId ?? undefined,
    customerName:   raw.customerName ?? undefined,
    items,
    subtotal:       Number(raw.subtotal ?? 0),
    discountAmount: Number(raw.discountAmount ?? 0),
    totalAmount:    Number(raw.totalAmount ?? 0),
    paymentMethod:  (raw.paymentMethod as "cash" | "card" | "credit") ?? "cash",
    paymentStatus:  (raw.paymentStatus as "paid" | "pending") ?? "paid",
    createdAt:      raw.createdAt ?? new Date().toISOString(),
    status:         raw.status ?? "active",
    replacedBy:     raw.replacedBy ?? undefined,
    replacedFrom:   raw.replacedFrom ?? undefined,
    editNote:       raw.editNote ?? undefined,
  };
}

// ─── Sale Receipt Modal — reuses the same ReceiptModal used after checkout ─────
//
// Converts a Sale (from DB / API) into the CartItem[]+props shape that
// ReceiptModal expects. This ensures normal bills AND edited bills produce
// an IDENTICAL view and print output.

function SaleReceiptModal({
  sale: rawSale,
  customers,
  onClose,
}: {
  sale: Sale;
  customers: Customer[];
  onClose: () => void;
}) {
  const sale = normalizeSale(rawSale);

  // Convert SaleItem[] → CartItem[] shape expected by ReceiptModal
  const cart = sale.items.map((item) => ({
    product: {
      id:       item.productId,
      name:     item.productName,
      nameUrdu: item.productNameUrdu ?? "",
      price:    Number(item.unitPrice),
      category: "",
      code:     item.productCode,
    },
    quantity: Number(item.quantity),
  }));

  // Look up customer phone if we have a customerId
  const linkedCustomer = sale.customerId
    ? customers.find((c) => c.customerId === sale.customerId)
    : undefined;
  const customerPhone = linkedCustomer?.phone;

  return (
    <ReceiptModal
      isOpen={true}
      onClose={onClose}
      cart={cart}
      totalAmount={Number(sale.totalAmount)}
      discountAmount={Number(sale.discountAmount)}
      customerName={sale.customerName ?? ""}
      customerPhone={customerPhone}
      invoiceNumber={sale.invoiceNumber}
      paymentMethod={sale.paymentMethod}
      createdAt={sale.createdAt}
      status={sale.status}
      replacedFrom={sale.replacedFrom}
      replacedBy={sale.replacedBy}
      editNote={sale.editNote}
    />
  );
}

// ─── Bill Card ────────────────────────────────────────────────────────────────

function BillCard({
  sale,
  onView,
  onEdit,
  isOnline,
}: {
  sale: Sale;
  onView: (sale: Sale) => void;
  onEdit: (sale: Sale) => void;
  isOnline: boolean;
}) {
  const isReplaced = sale.status === "replaced";
  const isEdited   = !!sale.replacedFrom;

  return (
    <div className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition-all dark:bg-zinc-900 ${
      isReplaced
        ? "border-amber-200 dark:border-amber-800/50 opacity-75"
        : "border-slate-200 dark:border-zinc-800 hover:shadow-md hover:border-violet-200 dark:hover:border-violet-800/50"
    }`}>
      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-800/40">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-mono text-xs sm:text-sm font-black text-slate-900 dark:text-white">{sale.invoiceNumber}</p>
            {/* Status badges */}
            {isReplaced && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                Replaced
              </span>
            )}
            {isEdited && !isReplaced && (
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-black text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                Edited Bill
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] font-bold text-slate-400 dark:text-zinc-500">{fmtDate(sale.createdAt)}</p>
          {/* Chain links */}
          {sale.replacedBy && (
            <p className="mt-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-500">
              ↳ Replaced by: <span className="font-mono">{sale.replacedBy}</span>
            </p>
          )}
          {sale.replacedFrom && (
            <p className="mt-0.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
              ↳ Edited from: <span className="font-mono">{sale.replacedFrom}</span>
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black ${
            sale.paymentMethod === "credit"
              ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
              : sale.paymentMethod === "cash"
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300"
          }`}>
            {pmLabel(sale.paymentMethod)}
          </span>
          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black ${
            sale.paymentStatus === "paid"
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
          }`}>
            {sale.paymentStatus === "paid" ? "Paid" : "Pending"}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-2">
        {sale.customerName && (
          <div className="flex items-center gap-1.5 text-xs">
            <svg className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" /></svg>
            <span className="font-bold text-slate-700 dark:text-zinc-300">{sale.customerName}</span>
          </div>
        )}

        <div className="text-xs text-slate-500 dark:text-zinc-400">
          {sale.items.slice(0, 2).map((item, i) => (
            <span key={i}>{i > 0 ? ", " : ""}{item.productName} ×{item.quantity}</span>
          ))}
          {sale.items.length > 2 && <span className="font-bold"> +{sale.items.length - 2} more</span>}
        </div>

        {sale.editNote && (
          <p className="text-[10px] italic text-slate-400 dark:text-zinc-500">Note: {sale.editNote}</p>
        )}

        <div className="flex items-center justify-between border-t border-slate-100 dark:border-zinc-800 pt-2">
          <span className="text-sm font-black text-slate-900 dark:text-white">
            Rs. {sale.totalAmount.toLocaleString()}
            {sale.discountAmount > 0 && (
              <span className="ml-1 text-[10px] font-bold text-rose-500">(-Rs. {sale.discountAmount.toLocaleString()})</span>
            )}
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onView(sale)}
              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-slate-600 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 transition-colors"
            >
              <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
              View
            </button>
            {!isReplaced && (
              <button
                onClick={() => isOnline ? onEdit(sale) : alert("Editing bills requires an internet connection.")}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-black transition-colors ${
                  isOnline
                    ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-500 hover:to-indigo-500"
                    : "border border-slate-200 bg-slate-100 text-slate-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500 cursor-not-allowed"
                }`}
                title={isOnline ? "Edit this bill" : "Requires internet connection"}
              >
                <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" /></svg>
                Edit Bill
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main BillsHistory Component ──────────────────────────────────────────────

interface BillsHistoryProps {
  isOnline: boolean;
  customers: Customer[];
  products: import("../types").Product[];
}

export default function BillsHistory({ isOnline, customers, products }: BillsHistoryProps) {
  const [sales, setSales]               = useState<Sale[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState("");
  const [filter, setFilter]             = useState<"all" | "active" | "replaced">("all");
  const [searchTerm, setSearchTerm]     = useState("");
  const [viewingSale, setViewingSale]   = useState<Sale | null>(null);
  const [editingSale, setEditingSale]   = useState<Sale | null>(null);

  const loadSales = useCallback(async () => {
    if (!isOnline) {
      setError("Bills History requires an internet connection.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");

    // Helper: single fetch attempt
    const tryFetch = async (): Promise<Response> => {
      return fetch("/api/sales", { cache: "no-store" });
    };

    try {
      let res = await tryFetch();

      // If the route is still compiling (Turbopack dev) or a transient error,
      // wait 1.5 s and try once more before giving up.
      if (!res.ok) {
        await new Promise((r) => setTimeout(r, 1500));
        res = await tryFetch();
      }

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.error ?? `HTTP ${res.status}`);
      }

      const raw: Sale[] = await res.json();
      // Normalize every sale so items/fields are always safe
      setSales(raw.map(normalizeSale));
    } catch (err) {
      console.error("[BillsHistory] loadSales error:", err);
      setError("Failed to load bills. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [isOnline]);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  const filteredSales = sales.filter((s) => {
    if (filter === "active"   && s.status === "replaced") return false;
    if (filter === "replaced" && s.status !== "replaced") return false;
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      return (
        s.invoiceNumber.toLowerCase().includes(q) ||
        (s.customerName ?? "").toLowerCase().includes(q) ||
        s.totalAmount.toString().includes(q)
      );
    }
    return true;
  });

  const activeCount   = sales.filter((s) => s.status !== "replaced").length;
  const replacedCount = sales.filter((s) => s.status === "replaced").length;

  return (
    <div className="mx-auto max-w-4xl space-y-4 sm:space-y-5 px-3 py-4 pb-20 sm:px-6 sm:py-6 sm:pb-24 lg:px-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-2xl font-black text-slate-900 dark:text-white">Bills History</h2>
          <p className="text-xs font-bold text-slate-500 dark:text-zinc-400">
            {sales.length} bill{sales.length !== 1 ? "s" : ""} · {activeCount} active · {replacedCount} replaced
          </p>
        </div>
        <button
          onClick={loadSales}
          disabled={loading || !isOnline}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 transition-colors shadow-sm"
        >
          <svg className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
          Refresh
        </button>
      </div>

      {/* Offline warning */}
      {!isOnline && (
        <div className="rounded-2xl border-2 border-dashed border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-900/40 dark:bg-amber-950/20">
          <p className="text-sm font-black text-amber-700 dark:text-amber-400">📡 Bills History requires internet</p>
          <p className="mt-1 text-xs font-bold text-amber-600 dark:text-amber-500">Connect to the internet to view and manage bills.</p>
        </div>
      )}

      {isOnline && (
        <>
          {/* Search */}
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
              <svg className="h-4 w-4 sm:h-5 sm:w-5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.637 10.637Z" /></svg>
            </div>
            <input
              type="text"
              placeholder="Search by bill number, customer name or amount..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full rounded-2xl border-2 border-slate-200 bg-white py-2.5 sm:py-3 pl-10 sm:pl-12 pr-4 text-xs sm:text-sm font-bold text-slate-900 transition-colors focus:border-violet-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white shadow-sm"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm("")} className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-slate-600">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>

          {/* Filter tabs */}
          <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800">
            {([
              { key: "all",      label: `All (${sales.length})` },
              { key: "active",   label: `Active (${activeCount})` },
              { key: "replaced", label: `Replaced (${replacedCount})` },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`flex-1 rounded-lg py-2 text-xs sm:text-sm font-black transition-all ${
                  filter === tab.key
                    ? "bg-white text-violet-700 shadow-sm dark:bg-zinc-800 dark:text-violet-300"
                    : "text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-200 border-t-violet-600" />
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center dark:border-rose-900/40 dark:bg-rose-950/20">
              <p className="text-sm font-black text-rose-600 dark:text-rose-400">{error}</p>
              <button onClick={loadSales} className="mt-3 rounded-xl bg-rose-600 px-4 py-2 text-xs font-black text-white hover:bg-rose-500">Retry</button>
            </div>
          ) : filteredSales.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white p-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-sm font-black text-slate-700 dark:text-zinc-300">
                {searchTerm ? `No bills matching "${searchTerm}"` : "No bills found"}
              </p>
              <p className="mt-1 text-xs text-slate-400 dark:text-zinc-500">
                {searchTerm ? "Try a different search." : "Bills will appear here after checkout."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSales.map((sale) => (
                <BillCard
                  key={sale.invoiceNumber}
                  sale={sale}
                  onView={setViewingSale}
                  onEdit={setEditingSale}
                  isOnline={isOnline}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* View / print modal — uses the SAME ReceiptModal as post-checkout */}
      {viewingSale && (
        <SaleReceiptModal
          sale={viewingSale}
          customers={customers}
          onClose={() => setViewingSale(null)}
        />
      )}

      {/* Edit bill modal */}
      {editingSale && (
        <EditBillModal
          sale={editingSale}
          customers={customers}
          products={products}
          isOnline={isOnline}
          onClose={() => setEditingSale(null)}
          onSuccess={(newSale) => {
            setEditingSale(null);
            // Normalize the new sale before adding to state
            const normalized = normalizeSale(newSale as Sale);
            setSales((prev) => {
              const updated = prev.map((s) =>
                s.invoiceNumber === editingSale.invoiceNumber
                  ? { ...s, status: "replaced" as const, replacedBy: normalized.invoiceNumber }
                  : s
              );
              return [normalized, ...updated];
            });
          }}
        />
      )}
    </div>
  );
}
