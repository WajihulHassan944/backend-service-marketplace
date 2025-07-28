import express from "express";
import {
  postMessage,
  getUserConversations,
  getMessagesByConversationId,
  markMessagesAsRead,
  deleteMessage,
  getAllConversationsWithMessages,
  getConversationPartners,
  updateMessageContent,
} from "../controllers/messages.js";
import orderUpload from "../middlewares/orderUpload.js"; // 👈 import multer middleware

const router = express.Router();

// 👇 apply file upload middleware for posting messages (max 3 files)
router.post("/add", orderUpload.array("attachments", 3), postMessage);

router.get("/conversations/:userId", getUserConversations);
router.get("/conversation/:conversationId", getMessagesByConversationId);
router.put("/mark-read", markMessagesAsRead);
router.post("/delete", deleteMessage);
router.put("/update", updateMessageContent);
router.get("/all-conversations/:userId", getAllConversationsWithMessages);
router.get("/user-conversations/:userId", getConversationPartners);

export default router;
