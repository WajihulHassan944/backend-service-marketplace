
import mongoose from 'mongoose';

const meetingSchema = new mongoose.Schema({
  topic: String,
  meeting_id: Number,
  join_url: String,
  start_url: String,
  password: String,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  participant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export const Meeting = mongoose.model("Meeting", meetingSchema);
