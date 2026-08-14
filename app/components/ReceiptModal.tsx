"use client";

import { useRef } from "react";
import type { Product } from "../types";
import MKSLogo from "./MKSLogo";

interface CartItem {
  product: Product;
  quantity: number;
}

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  totalAmount: number;
  discountAmount?: number;
  customerName?: string;
  customerPhone?: string;
  invoiceNumber: string;
  paymentMethod?: "cash" | "card" | "credit";
}

const SHOP = {
  name: "Shabbir Khan Auto Body Parts",
  nameUrdu: "شبیر خان آٹو باڈی پارٹس",
  address: "Bara Sandha Stop, T 4, Band Road, Lahore",
  phones: ["0300-4254118", "0300-4177275", "0334-0450186"],
};

export default function ReceiptModal({
  isOpen,
  onClose,
  cart,
  totalAmount,
  discountAmount = 0,
  customerName = "",
  customerPhone,
  invoiceNumber,
  paymentMethod = "cash",
}: ReceiptModalProps) {
  const printRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const subtotal = totalAmount + discountAmount;

  const currentDate = new Date().toLocaleDateString("en-PK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const currentTime = new Date().toLocaleTimeString("en-PK", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 backdrop-blur-sm sm:items-center sm:p-4 print:relative print:inset-auto print:bg-transparent print:p-0 print:backdrop-blur-none">
      <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl dark:bg-zinc-900 sm:rounded-2xl print:rounded-none print:shadow-none print:max-w-none max-h-[96vh] sm:max-h-[92vh] print:max-h-none">

        {/* ── Screen-only top bar ── */}
        <div className="flex items-center justify-between bg-gradient-to-r from-zinc-900 to-zinc-800 px-4 py-3 sm:px-6 print:hidden">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
              <svg className="h-4 w-4 text-amber-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            <span className="truncate text-sm font-black text-white">Invoice Generated</span>
            <span className="hidden flex-shrink-0 rounded-full bg-zinc-700 px-2 py-0.5 font-mono text-[10px] font-bold text-zinc-300 sm:inline">
              {invoiceNumber}
            </span>
          </div>
          <button
            onClick={onClose}
            className="ml-2 flex-shrink-0 rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-white"
            aria-label="Close invoice"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── INVOICE BODY ── */}
        <div
          ref={printRef}
          className="min-h-0 flex-1 overflow-y-auto bg-white scrollbar-thin print:overflow-visible print:bg-white"
        >
          {/* HEADER: stacked on mobile, side-by-side on sm+ */}
          <div className="border-b-4 border-zinc-900 px-4 pb-4 pt-5 sm:px-8 print:px-6 print:pt-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">

              {/* Logo + company info */}
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="flex-shrink-0 print:scale-90 print:origin-left">
                  <MKSLogo size={80} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-black text-zinc-900 sm:text-base">{SHOP.name}</p>
                  <p className="font-urdu text-xs font-black text-zinc-800 sm:text-sm" dir="rtl">{SHOP.nameUrdu}</p>
                  <p className="mt-1 text-xs font-bold text-zinc-600">{SHOP.address}</p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    {SHOP.phones.map((p) => (
                      <span key={p} className="text-[11px] font-bold text-zinc-700">
                        📞 {p}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* INVOICE title — right-aligned on sm+, left-aligned on mobile */}
              <div className="sm:text-right">
                <p className="text-2xl font-black uppercase tracking-widest text-zinc-900 sm:text-3xl">
                  Invoice
                </p>
                <div className="mt-2 space-y-0.5 text-xs text-zinc-500 sm:text-right">
                  <p>
                    <span className="font-semibold text-zinc-700">Bill No.:</span>{" "}
                    <span className="font-mono font-black text-zinc-900">{invoiceNumber}</span>
                  </p>
                  <p>
                    <span className="font-semibold text-zinc-700">Date:</span> {currentDate}
                  </p>
                  <p>
                    <span className="font-semibold text-zinc-700">Time:</span> {currentTime}
                  </p>
                  {customerName && (
                    <p className="mt-1 border-t border-zinc-200 pt-1">
                      <span className="font-semibold text-zinc-700">Customer:</span>{" "}
                      <span className="font-black text-zinc-900">{customerName}</span>
                    </p>
                  )}
                  {customerPhone && (
                    <p>
                      <span className="font-semibold text-zinc-700">Phone:</span>{" "}
                      <span className="font-black text-zinc-900">{customerPhone}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* META BOX */}
          <div className="bg-zinc-100 px-4 py-2 sm:px-8 print:px-6">
            <div className="flex flex-wrap items-center gap-4 text-xs sm:gap-6">
              <div>
                <p className="font-black uppercase tracking-wider text-zinc-400">Items</p>
                <p className="mt-0.5 font-bold text-zinc-800">{cart.length} product{cart.length !== 1 ? "s" : ""}</p>
              </div>
              <div className="h-6 w-px bg-zinc-300" />
              <div>
                <p className="font-black uppercase tracking-wider text-zinc-400">Total Units</p>
                <p className="mt-0.5 font-bold text-zinc-800">
                  {cart.reduce((s, i) => s + i.quantity, 0)}
                </p>
              </div>
              <div className="h-6 w-px bg-zinc-300" />
              <div>
                <p className="font-black uppercase tracking-wider text-zinc-400">Invoice Amount</p>
                <p className="mt-0.5 font-black text-zinc-900">Rs. {totalAmount.toLocaleString()}</p>
              </div>
              <div className="h-6 w-px bg-zinc-300" />
              <div>
                <p className="font-black uppercase tracking-wider text-zinc-400">Payment</p>
                <p className={`mt-0.5 font-black ${
                  paymentMethod === "cash" ? "text-emerald-700" : paymentMethod === "credit" ? "text-amber-700" : "text-indigo-700"
                }`}>
                  {paymentMethod === "cash" ? "💵 Cash" : paymentMethod === "credit" ? "📋 Credit / Udhaar" : "💳 Credit Card"}
                </p>
              </div>
            </div>
          </div>

          {/* ITEMS TABLE — horizontally scrollable on very small screens */}
          <div className="overflow-x-auto px-4 py-2 sm:px-8 print:px-6">
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-zinc-900">
                  <th className="py-2 text-left text-[11px] font-black uppercase tracking-widest text-zinc-900">#</th>
                  <th className="py-2 text-left text-[11px] font-black uppercase tracking-widest text-zinc-900">Product / Item</th>
                  <th className="py-2 text-right text-[11px] font-black uppercase tracking-widest text-zinc-900">Qty</th>
                  <th className="py-2 text-right text-[11px] font-black uppercase tracking-widest text-zinc-900">Rate</th>
                  <th className="py-2 text-right text-[11px] font-black uppercase tracking-widest text-zinc-900">Amount</th>
                </tr>
              </thead>
              <tbody>
                {cart.map((item, index) => (
                  <tr
                    key={item.product.id}
                    className={`border-b ${index % 2 === 1 ? "bg-zinc-50" : "bg-white"}`}
                  >
                    <td className="py-2 pr-2 text-xs font-bold text-zinc-400">{index + 1}</td>
                    <td className="py-2 pr-4">
                      <p className="font-bold leading-snug text-zinc-900">{item.product.name}</p>
                      {item.product.nameUrdu && (
                        <p className="text-right text-xs font-bold text-zinc-900 font-urdu" dir="rtl"
                          style={{ fontWeight: 700, textShadow: "0 0 0.4px currentColor" }}>
                          {item.product.nameUrdu}
                        </p>
                      )}
                      {item.product.code && (
                        <span className="inline-block rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-mono text-[9px] font-black text-amber-700">
                          Code #{item.product.code}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right font-black text-zinc-900">{item.quantity}</td>
                    <td className="py-2 text-right font-black text-zinc-900">Rs. {item.product.price.toLocaleString()}</td>
                    <td className="py-2 text-right font-black text-zinc-900">
                      Rs. {(item.product.price * item.quantity).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* FOOTER: stacked on mobile, side-by-side on sm+ */}
          <div className="border-t-2 border-zinc-200 px-4 py-4 sm:px-8 print:px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">

              {/* Left: thank-you note */}
              <div className="space-y-1">
                <p className="text-xs font-black uppercase tracking-wider text-zinc-400">Note</p>
                <p className="text-sm font-bold text-zinc-800">Thank you for your business!</p>
                <p className="font-urdu text-sm font-bold text-zinc-700" dir="rtl">آپ کا شکریہ</p>
                <p className="mt-2 text-[10px] text-zinc-400">Powered by Antigravity POS</p>
              </div>

              {/* Right: totals breakdown — full width on mobile */}
              <div className="w-full space-y-1.5 text-sm sm:w-auto sm:min-w-56">
                {discountAmount > 0 && (
                  <div className="flex justify-between gap-8 text-zinc-900">
                    <span className="font-bold text-zinc-700">Subtotal</span>
                    <span className="font-black text-zinc-900">Rs. {subtotal.toLocaleString()}</span>
                  </div>
                )}
                {discountAmount > 0 && (
                  <div className="flex justify-between gap-8 text-rose-600">
                    <span className="font-bold text-rose-600">Discount</span>
                    <span className="font-black text-rose-600">− Rs. {discountAmount.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between gap-8 border-t-2 border-zinc-900 pt-2 text-base">
                  <span className="font-black text-zinc-900">TOTAL</span>
                  <span className="font-black text-zinc-900 text-lg">Rs. {totalAmount.toLocaleString()}</span>
                </div>
                <div className="mt-2 flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <span className="text-xs font-black uppercase tracking-wider text-zinc-400">Payment Method</span>
                  <span className={`text-sm font-black ${
                    paymentMethod === "cash" ? "text-emerald-700" : paymentMethod === "credit" ? "text-amber-700" : "text-indigo-700"
                  }`}>
                    {paymentMethod === "cash" ? "💵 Cash" : paymentMethod === "credit" ? "📋 Credit / Udhaar" : "💳 Credit Card"}
                  </span>
                </div>
                {paymentMethod === "credit" && (
                  <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center dark:border-amber-800/50 dark:bg-amber-950/20">
                    <p className="text-xs font-black text-amber-700">⚠ Credit Sale — Amount Added to Customer Balance</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bottom strip — wraps gracefully on small screens */}
          <div className="bg-zinc-900 px-4 py-3 text-center sm:px-8 print:px-6">
            <p className="text-xs font-bold leading-relaxed tracking-wide text-zinc-200 sm:text-sm">
              <span className="font-black text-white">{SHOP.name}</span> · <span className="font-extrabold text-white underline decoration-amber-500/50 underline-offset-2">{SHOP.address}</span>
            </p>
            <p className="mt-1 text-xs font-bold tracking-wide text-zinc-300 sm:text-xs">
              {SHOP.phones.join(" · ")}
            </p>
          </div>
        </div>

        {/* ── Action buttons (screen only) ── */}
        <div className="flex gap-3 border-t border-zinc-100 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-800/30 sm:px-6 sm:py-4 print:hidden pb-safe">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border-2 border-zinc-200 bg-white py-3 text-sm font-bold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
          >
            New Sale
          </button>
          <button
            onClick={() => window.print()}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-zinc-800 to-zinc-900 py-3 text-sm font-bold text-white shadow-lg transition-all hover:from-zinc-700 hover:to-zinc-800"
          >
            <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.821V21h10.56v-7.179m-10.56 0A2.25 2.25 0 0 1 4.5 11.58V8.25a2.25 2.25 0 0 1 2.25-2.25h10.56A2.25 2.25 0 0 1 19.5 8.25v3.33a2.25 2.25 0 0 1-2.22 2.241m-10.56 0h10.56M9 3h6m-6 3h6m-9 9h.008v.008H3.75V15Zm1.5 0h.008v.008H5.25V15Z" />
            </svg>
            Print Invoice
          </button>
        </div>

      </div>
    </div>
  );
}
