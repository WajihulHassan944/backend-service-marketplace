import mongoose from "mongoose";

const subcategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  subcategories: {
    type: [String], // You can later replace with nested subcategory objects if deep nesting needed
    default: [],
  }
}, { _id: false });

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  },
  icon: {
    type: String,
    required: true,
  },
  image: {
    type: String,
    required: true,
  },
  subcategories: {
    type: [subcategorySchema],
    default: [],
  },
});

export const Category = mongoose.model("Category", categorySchema);
