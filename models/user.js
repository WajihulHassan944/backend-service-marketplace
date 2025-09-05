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
   userName: {
    type: String,
    unique: true,
    index: true,
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
  availabilityStatus: {
  type: Boolean,
  default: true,
},
  stripeAccountId: {
  type: String,
  required: false, // set to true if every seller must onboard
},
  role: {
    type: [String],
    enum: ["buyer", "seller", "admin", "superadmin"],
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
  level: {
    type: String,
    enum: ["New Seller", "Level 1", "Level 2", "Top Rated"],
    default: "New Seller",
  },
  completedOrdersCount: {
    type: Number,
    default: 0,
  },
  description: {
    type: String,
    required: false,
  },
  skills: {
    type: [String],
    default: [],
  },
   languages: {
    type: [String],
    default: [],
  },
   personalPortfolio: {
    type: String,
    required: false,
  },
  resume: {
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
  referrer: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "User",
  default: null,
},

wishlist: [
  {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Gig",
  },
],
verificationCreatedAt: {
  type: Date,
  default: Date.now,
},

  createdAt: {
    type: Date,
    default: Date.now,
  },
  
});



schema.pre("save", async function (next) {
  if (this.isNew || this.isModified("firstName") || this.isModified("lastName")) {
    const first = this.firstName?.trim().toLowerCase().replace(/\s+/g, "") || "";
    const last = this.lastName?.trim().toLowerCase().replace(/\s+/g, "") || "";
    const base = `${first}${last}`;
    let handle = `@${base}`;

    const User = mongoose.model("User");
    let suffix = 0;

    // Loop to find a unique handle
    while (true) {
      const existing = await User.findOne({ userName: handle });

      // ✅ Unique or same user? Accept it
      if (!existing || existing._id.equals(this._id)) break;

      // 🚫 Already taken by someone else — try next suffix
      suffix += 1;
      handle = `@${base}${suffix}`;
    }

    // Only update if it's changed (avoid re-saving same username)
    if (this.userName !== handle) {
      this.userName = handle;
    }
  }

  next();
});


export const User = mongoose.model("User", schema);
