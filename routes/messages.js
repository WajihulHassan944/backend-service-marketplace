import express from "express";
import {
  postMessage,
  getMessagesByConversationId,
  deleteMessage,
  getConversationPartners,
  updateMessageContent,
  deleteMessagesByConversationId,
} from "../controllers/messages.js";
import orderUpload from "../middlewares/orderUpload.js"; // 👈 import multer middleware

const router = express.Router();

// 👇 apply file upload middleware for posting messages (max 3 files)
router.post("/add", orderUpload.array("attachments", 3), postMessage);
router.get("/conversation/:conversationId", getMessagesByConversationId);
router.delete("/delete", deleteMessage);
router.put("/update", updateMessageContent);
router.get("/user-conversations/:userId", getConversationPartners);
router.delete("/conversation/:conversationId", deleteMessagesByConversationId);
export default router;
