import mongoose, { Schema, model, models, Document } from "mongoose";

export interface IProduct extends Document {
  id: string;
  name: string;
  nameUrdu: string;
  price: number;
  category: string;
  code?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ProductSchema = new Schema<IProduct>(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
    },
    nameUrdu: {
      type: String,
      default: "",
      trim: true,
    },
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: [0, "Price cannot be negative"],
      default: 0,
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      trim: true,
    },
    code: {
      type: String,
      default: undefined,
      trim: true,
    },
  },
  {
    timestamps: true,
    collection: "products",
  }
);

const Product = models.Product || model<IProduct>("Product", ProductSchema);

export default Product;
