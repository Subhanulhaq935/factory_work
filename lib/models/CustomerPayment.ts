import { Schema, model, models, Document } from "mongoose";

export interface ICustomerPayment extends Document {
  customerId: string;
  amount: number;
  paymentMethod: "cash" | "card";
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CustomerPaymentSchema = new Schema<ICustomerPayment>(
  {
    customerId: {
      type: String,
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: [1, "Payment amount must be at least 1"],
    },
    paymentMethod: {
      type: String,
      enum: ["cash", "card"],
      required: true,
      default: "cash",
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
    collection: "customerPayments",
  }
);

const CustomerPayment =
  models.CustomerPayment ||
  model<ICustomerPayment>("CustomerPayment", CustomerPaymentSchema);

export default CustomerPayment;
