import { Schema, model, models, Document } from "mongoose";

export interface ICategory extends Document {
  id: string;
  name: string;
  nameUrdu: string;
}

const CategorySchema = new Schema<ICategory>(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Category name is required"],
      trim: true,
    },
    nameUrdu: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
    collection: "categories",
  }
);

const Category = models.Category || model<ICategory>("Category", CategorySchema);

export default Category;
