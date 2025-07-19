import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true, // Who the notification is for
  },
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  link: {
    type: String,
    default: "", // Optional URL for redirection
  },
  read: {
    type: Boolean,
    default: false, // Track if the user has read it
  },
  type: {
    type: String,
    enum: ["system", "order", "custom", "note", "portfolio", "gig", "coworker", "debit", "review", "resolution", "credit"],
    default: "custom",
  },
   targetRole: {
    type: String,
    enum: ["buyer", "seller", "admin", "superadmin"],
    default: "buyer",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  }
});

export const Notification = mongoose.model("Notification", notificationSchema);
