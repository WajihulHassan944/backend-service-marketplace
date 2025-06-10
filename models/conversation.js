import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema({
  participants: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    }
  ],
  lastMessage: {
    type: String,
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
});

conversationSchema.index({ participants: 1 }, { unique: true });

export const Conversation = mongoose.model("Conversation", conversationSchema);
