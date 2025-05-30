import mongoose from "mongoose";

const schema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true,
  },
  lastName: {
    type: String,
    required: false,
  },
   profileUrl: {
    type: String,
    required: false,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    required: true,
    type: String,
    select: false,
  },
  country: {
    type: String,
  },
  role: {
    type: [String],
    enum: ["buyer", "seller", "admin"], // ⛔ superadmin removed
    default: ["buyer"],
  },
  verified: {
    type: Boolean,
    default: false,
  },
   blocked: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Automatically set `verified` status before saving
schema.pre("save", function (next) {
  if (!this.isModified("role")) return next();

  // Allow verified=true if existing role includes superadmin
  if (
    this.role.includes("superadmin") || // support for existing superadmin
    (this.role.length === 1 && this.role[0] === "buyer")
  ) {
    this.verified = true;
  } else {
    this.verified = false;
  }

  next();
});

export const User = mongoose.model("User", schema);
