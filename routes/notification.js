import express from "express";
import {
  getMyNotifications,
  markNotificationAsRead,
  deleteNotification,
  getAllNotifications,
  getLatestNotifications,
  deleteMultipleNotifications
  ,deleteAllNotifications
} from "../controllers/notification.js";
import { isAuthenticated } from "../middlewares/auth.js";


const router = express.Router();

// Admin-only: Get all notifications
router.get("/all", getAllNotifications);

// Logged-in user: Get my notifications
router.get("/me", isAuthenticated, getMyNotifications);

router.get("/latest", isAuthenticated, getLatestNotifications);

router.delete("/notifications", isAuthenticated, deleteMultipleNotifications);
router.delete("/notifications/all", isAuthenticated, deleteAllNotifications);

// Logged-in user: Mark one notification as read
router.put("/read/:notificationId", isAuthenticated, markNotificationAsRead);

// Logged-in user: Delete one notification
router.delete("/:notificationId", isAuthenticated, deleteNotification);

export default router;
