import mongoose from "mongoose";

const walletSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    unique: true,
    required: true,
  },
  stripeCard: {
    cardNumber: {
      type: String,
      default: "4242 4242 4242 4242",
    },
    expiryMonth: {
      type: String,
      default: "12",
    },
    expiryYear: {
      type: String,
      default: "2030",
    },
    cvc: {
      type: String,
      default: "123",
    },
    postalCode: {
      type: String,
      default: "12345",
    },
  },
  balance: {
    type: Number,
    default: 1000.0,
  },
  transactions: [
    {
      type: {
        type: String,
        enum: ["credit", "debit"],
      },
      amount: Number,
      description: String,
      createdAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
});
export const Wallet = mongoose.model("Wallet", walletSchema);