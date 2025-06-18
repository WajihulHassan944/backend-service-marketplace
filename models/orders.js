import mongoose from "mongoose";
import { Counter } from "./counter.js";

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
coworkers: [ 
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    priceType: {
      type: String,
      enum: ["hourly", "fixed"],
      required: true,
    },
    rate: {
      type: Number,
      required: true,
    },
    maxHours: {
      type: Number,
      required: function () {
        return this.priceType === "hourly";
      }
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    }
  }
],

resolutionRequest: {
  ticketId: {
    type: String,
    unique: true,
    sparse: true, 
  },
  reason: {
    type: String,
   
  },
  status: {
  type: String,
  enum: ["open", "resolved", "rejected"],
 },
  message: {
    type: String,
    maxlength: 500,
  },
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  requestedAt: {
    type: Date,
    default: Date.now,
  },
  status: {
    type: String,
    enum: ["open", "resolved", "rejected"],
    default: "open",
  },
  adminResponse: {
    type: String,
  },
  respondedBy: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "User",
},
  resolvedAt: Date,
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
  deliveryDueDate: {
  type: Date,
},

});

orderSchema.pre("save", async function (next) {
  this.updatedAt = Date.now();

  if (!this.deliveryDueDate && this.packageDetails?.deliveryTime) {
    const deliveryDays = this.packageDetails.deliveryTime;
    this.deliveryDueDate = new Date(this.createdAt.getTime() + deliveryDays * 24 * 60 * 60 * 1000);
  }
 if (
    this.isModified("resolutionRequest") &&
    this.resolutionRequest &&
    !this.resolutionRequest.ticketId
  ) {
    const counter = await Counter.findOneAndUpdate(
      { name: "resolutionTicket" },
      { $inc: { value: 1 } },
      { new: true, upsert: true }
    );

    this.resolutionRequest.ticketId = `RSL-${counter.value}`;
  }
  next();
});

export const Order = mongoose.model("Order", orderSchema);
