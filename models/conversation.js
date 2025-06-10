import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema({
  participantOne: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  participantTwo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  lastMessage: {
    type: String,
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
});

conversationSchema.index(
  { participantOne: 1, participantTwo: 1 },
  { unique: true }
);

export const Conversation = mongoose.model("Conversation", conversationSchema);
