import express from "express";
import {
  sendEmail,
  saveDraft,
  getEmailsByFolder,
  markAsRead,
  moveToTrash,
  deleteEmail,
  submitContactForm,
  replyToEmail,
  markAsImportant,
  markAsStarred,
} from "../controllers/email.js";

const router = express.Router();

// Admin sends email to users
router.post("/send", sendEmail);

// Save a draft (not sent yet)
router.post("/draft", saveDraft);

// Get emails by folder (Inbox, Sent, Draft, Trash)
router.get("/", getEmailsByFolder);

// Mark an email as read
router.patch("/read", markAsRead);
router.patch('/important/:emailId', markAsImportant);
router.patch('/starred/:emailId', markAsStarred);

// Reply to an email
router.post("/reply/:recipientEmail", replyToEmail);

// Move email to trash
router.patch("/trash/:emailId", moveToTrash);

// Delete permanently
router.delete("/:emailId", deleteEmail);

// Handle contact form submissions (from registered or guest users)
router.post("/contact-form", submitContactForm);

export default router;
