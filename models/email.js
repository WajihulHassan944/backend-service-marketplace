import mongoose from 'mongoose';

const emailSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Usually the admin
    required: true,
  },
  recipients: [
    {
      type: mongoose.Schema.Types.Mixed, // Can be ObjectId or email string
      required: true,
    }
  ],
  subject: {
    type: String,
    required: true,
  },
  body: {
    type: String,
    required: true,
  },
  folder: {
    type: String,
    enum: ['Inbox', 'Sent', 'Draft', 'Trash'],
    default: 'Inbox',
  },
  readBy: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }
  ],
  isStarred: {
    type: Boolean,
    default: false,
  },
  isImportant: {
    type: Boolean,
    default: false,
  },
  isContactForm: {
    type: Boolean,
    default: false, // true = submitted via contact form
  },
  sentAt: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

export const Email = mongoose.model('Email', emailSchema);
