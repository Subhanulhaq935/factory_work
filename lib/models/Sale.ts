import { Schema, model, models, Document } from "mongoose";

export interface ISaleItem {
  productId: string;
  productName: string;
  productNameUrdu?: string;
  productCode?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface ISale extends Document {
  invoiceNumber: string;
  customerId?: string;      // Optional ref to Customer.customerId
  customerName?: string;    // Denormalized for display
  items: ISaleItem[];
  subtotal: number;
  discountAmount: number;
  totalAmount: number;
  paymentMethod: "cash" | "card" | "credit";
  paymentStatus: "paid" | "pending";
  createdAt: Date;
  updatedAt: Date;
}

const SaleItemSchema = new Schema<ISaleItem>(
  {
    productId:        { type: String, required: true },
    productName:      { type: String, required: true, trim: true },
    productNameUrdu:  { type: String, default: "" },
    productCode:      { type: String, default: undefined },
    quantity:         { type: Number, required: true, min: 1 },
    unitPrice:        { type: Number, required: true, min: 0 },
    totalPrice:       { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const SaleSchema = new Schema<ISale>(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    customerId: {
      type: String,
      default: undefined,
      index: true,
    },
    customerName: {
      type: String,
      default: undefined,
      trim: true,
    },
    items: {
      type: [SaleItemSchema],
      required: true,
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: {
      type: String,
      enum: ["cash", "card", "credit"],
      required: true,
      default: "cash",
    },
    paymentStatus: {
      type: String,
      enum: ["paid", "pending"],
      required: true,
      default: "paid",
    },
  },
  {
    timestamps: true,
    collection: "sales",
  }
);

const Sale = models.Sale || model<ISale>("Sale", SaleSchema);

export default Sale;
