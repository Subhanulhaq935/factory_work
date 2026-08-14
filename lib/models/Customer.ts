import { Schema, model, models, Document } from "mongoose";

export interface ICustomer extends Document {
  customerId: string;
  name: string;
  phone: string;
  address: string;
  outstandingBalance: number;
  createdAt: Date;
  updatedAt: Date;
}

const CustomerSchema = new Schema<ICustomer>(
  {
    customerId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Customer name is required"],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
      unique: true,
      index: true,
    },
    address: {
      type: String,
      default: "",
      trim: true,
    },
    outstandingBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    collection: "customers",
  }
);

// Text index for fast name/phone search
CustomerSchema.index({ name: "text", phone: "text" });

const Customer = models.Customer || model<ICustomer>("Customer", CustomerSchema);

export default Customer;
