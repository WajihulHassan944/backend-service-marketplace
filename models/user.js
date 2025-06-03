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
    required: false,
    type: String,
    select: false,
  },
  country: {
    type: String,
  },
  role: {
    type: [String],
    enum: ["buyer", "seller", "admin"],
    default: ["buyer"],
  },
  sellerStatus: {
  type: Boolean,
  default: false,
},
 sellerDetails: {
    linkedUrl: {
      type: String,
      required: false,
    },
    speciality: {
      type: String,
      required: false,
    },
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

export const User = mongoose.model("User", schema);
