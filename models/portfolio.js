import mongoose from "mongoose";

const portfolioSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  previewType: {
    type: String,
    enum: ["image", "link"],
    required: true,
  },
  imageUrl: {
    type: String, // Store Cloudinary URL or local path
    required: function () {
      return this.previewType === "image";
    },
  },
  websiteLink: {
    type: String,
    required: function () {
      return this.previewType === "link";
    },
  },
  description: {
    type: String,
    required: true,
    trim: true,
  },
}, { timestamps: true });

export const Portfolio = mongoose.model("Portfolio", portfolioSchema);
