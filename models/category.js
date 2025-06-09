import mongoose from "mongoose";

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  },
  icon: {
    type: String, // You can use an icon name or URL
    required: true,
  },
  image: {
    type: String, // URL of the image (e.g., from Cloudinary)
    required: true,
  },
});

export const Category = mongoose.model("Category", categorySchema);
