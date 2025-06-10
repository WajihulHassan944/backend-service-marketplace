import express from "express";
import {
  postMessage,
  getUserConversations,
  getMessagesByConversationId,
  markMessagesAsRead,
  deleteMessage,
  getAllConversationsWithMessages,
} from "../controllers/messages.js";

const router = express.Router();

router.post("/add", postMessage);
router.get("/conversations/:userId", getUserConversations);
router.get("/conversation/:conversationId", getMessagesByConversationId);
router.put("/mark-read", markMessagesAsRead);
router.delete("/delete", deleteMessage);
router.get("/all-conversations/:userId", getAllConversationsWithMessages);

export default router;
