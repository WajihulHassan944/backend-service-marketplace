import mongoose from "mongoose";

const notepadSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  title: {
    type: String,
    required: true,
    maxlength: 200,
  },

  description: {
    type: String,
    required: false,
    maxlength: 5000,
  },

  date: {
    type: Date,
    required: false,
  },

  isImportant: {
    type: Boolean,
    default: false,
  },

  status: {
    type: String,
    enum: ["pending", "completed"],
    default: "pending",
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },

  updatedAt: {
    type: Date,
  },
});

// Auto-update updatedAt
notepadSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

export const Notepad = mongoose.model("Notepad", notepadSchema);
