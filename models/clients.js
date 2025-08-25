import mongoose from "mongoose";

const clientSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  country: {
    type: String,
    required: true,
    trim: true,
  },
  profileUrl: {
    type: String,
    required: true,
  },
    workMonth: {
      type: String, // Example: "January", "Feb", or "01"
      required: true,
      trim: true,
    },
    workYear: {
      type: Number, // Example: 2025
      required: true,
    },
    description: {
      type: String,
      trim: true,
    },
}, { timestamps: true });

export const Client = mongoose.model("Client", clientSchema);
