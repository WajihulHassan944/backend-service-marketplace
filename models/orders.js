import mongoose from "mongoose";

const orderSchema = new mongoose.Schema({
  gigId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Gig",
    required: true,
  },
  buyerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  packageType: {
    type: String,
    enum: ["basic", "standard", "premium"],
    required: true,
  },
  packageDetails: {
    packageName: String,
    description: String,
    price: Number,
    deliveryTime: Number,
    revisions: Number,
    numberOfPages: Number,
    afterProjectSupport: Boolean,
  },
  requirements: {
    type: String,
    required: true,
  },
  files: {
    type: [
      {
        url: String,
        public_id: String,
      },
    ],
    default: [],
  },
  status: {
    type: String,
    enum: ["pending", "in progress", "delivered", "completed", "cancelled", "disputed"],
    default: "pending",
  },
 deliveries: [
  {
    deliveredAt: Date,
    files: [
      {
        url: String,
        public_id: String,
      },
    ],
    message: String,
  }
],

buyerReview: {
  overallRating: {
    type: Number,
    min: 1,
    max: 5,
  },
  communicationLevel: {
    type: Number,
    min: 1,
    max: 5,
  },
  serviceAsDescribed: {
    type: Number,
    min: 1,
    max: 5,
  },
  recommendToFriend: {
    type: Number,
    min: 1,
    max: 5,
  },
  review: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
},
  
sellerReview: {
    rating: {
      type: Number,
      min: 1,
      max: 5,
    },
    review: String,
  },
  isPaid: {
    type: Boolean,
    default: false,
  },
  paidAt: Date,
  totalAmount: {
    type: Number,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: Date,
});

orderSchema.pre("save", function (next) {
  this.updatedAt = Date.now();

  if (!this.deliveryDueDate && this.packageDetails?.deliveryTime) {
    const deliveryDays = this.packageDetails.deliveryTime;
    this.deliveryDueDate = new Date(this.createdAt.getTime() + deliveryDays * 24 * 60 * 60 * 1000);
  }

  next();
});

export const Order = mongoose.model("Order", orderSchema);
