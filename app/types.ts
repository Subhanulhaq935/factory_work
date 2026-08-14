export interface Product {
  id: string;
  name: string;      // English translated name
  nameUrdu: string;  // Original Urdu name
  price: number;
  category: string;
  code?: string;     // Short code or index number from sheet
}

export interface Category {
  id: string;
  name: string;
  nameUrdu: string;
}

// ── Customer ──────────────────────────────────────────────────────────────────

export interface Customer {
  customerId: string;
  name: string;
  phone: string;
  address: string;
  outstandingBalance: number;
  createdAt: string;
  updatedAt: string;
}

// ── Sale / Purchase History ───────────────────────────────────────────────────

export interface SaleItem {
  productId: string;
  productName: string;
  productNameUrdu?: string;
  productCode?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export type PaymentMethod = "cash" | "card" | "credit";
export type PaymentStatus = "paid" | "pending";

export interface Sale {
  _id?: string;
  invoiceNumber: string;
  customerId?: string;
  customerName?: string;
  items: SaleItem[];
  subtotal: number;
  discountAmount: number;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  createdAt: string;
}

// ── Customer Payment (ledger entry) ───────────────────────────────────────────

export interface CustomerPayment {
  _id?: string;
  customerId: string;
  amount: number;
  paymentMethod: "cash" | "card";
  notes?: string;
  createdAt: string;
}

// ── Ledger Row (computed, for display) ───────────────────────────────────────

export interface LedgerRow {
  date: string;
  description: string;
  invoiceNumber?: string;
  debit: number;   // Amount owed (credit sale)
  credit: number;  // Amount paid
  balance: number; // Running balance
  type: "sale" | "payment";
}

// ── Customer Summary Stats ────────────────────────────────────────────────────

export interface CustomerStats {
  totalPurchases: number;
  totalAmount: number;
  totalPaid: number;
  outstanding: number;
}
