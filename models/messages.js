import mongoose from "mongoose";

function attachmentLimit(val) {
  return val.length <= 3;
}

const messageSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Conversation",
    required: true,
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
   receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  message: {
    type: String,
    required: true,
  },
   attachments: {
    type: [
      {
        url: String,
        public_id: String,
      }
    ],
    validate: [attachmentLimit, '{PATH} exceeds the limit of 3'],
  },
  isRead: {
    type: Boolean,
    default: false,
  },
  isDeletedBySender: {
    type: Boolean,
    default: false,
  },
  isDeletedByReceiver: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export const Message = mongoose.model("Message", messageSchema);
