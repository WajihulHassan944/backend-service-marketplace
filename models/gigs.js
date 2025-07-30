import mongoose from "mongoose";

const gigSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  // Gig Overview
  gigTitle: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    required: true,
  },
  subcategory: {
    type: String,
    required: true,
  },
  
  subcategorychild: {
    type: String,
    required: true,
  },
  searchTag: {
    type: String,
    required: true,
  },
  positiveKeywords: {
    type: [String],
    default: [],
  },

 packages: {
  basic: {
    type: mongoose.Schema.Types.Mixed,
    required: false,
    default: undefined,
  },
  standard: {
    type: mongoose.Schema.Types.Mixed,
    required: false,
    default: undefined,
  },
  premium: {
    type: mongoose.Schema.Types.Mixed,
    required: false,
    default: undefined,
  },
},
offerPackages: {
  type: Boolean,
  default: true,
},

  status: {
    type: String,
    enum: ["pending", "active", "rejected"],
    default: "pending",
  },

  // Description
  gigDescription: {
    type: String,
    required: true,
  },
  hourlyRate: {
    type: Number,
  },

  // Gig Gallery
  images: {
    type: [
      {
        url: String,         // Cloudinary secure URL
        public_id: String,   // Cloudinary public ID (used to delete)
      }
    ],
    validate: [arrayLimit, '{PATH} exceeds the limit of 3'],
  },
  videoIframes: {
    type: [String],
    default: [],
  },
  pdf: {
    url: {
      type: String,
      default: "",
    },
    public_id: {
      type: String,
      default: "",
    },
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

function arrayLimit(val) {
  return val.length <= 3;
}

export const Gig = mongoose.model("Gig", gigSchema);
