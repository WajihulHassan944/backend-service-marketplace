import { Notification } from "../models/notification.js";

// ✅ Get notifications for the logged-in user based on optional role filter
export const getMyNotifications = async (req, res) => {
  try {
    const { role } = req.query;

    // Default: fetch for both "buyer" and "seller"
    let roleFilter = {};
    if (role) {
      // Role provided in query
      roleFilter.targetRole = role;
    } else {
      // No role provided: default to buyer + seller
      roleFilter.targetRole = { $in: ["buyer", "seller", "superadmin", "admin"] };
    }

    const notifications = await Notification.find({
      user: req.user._id,
      ...roleFilter,
    }).sort({ createdAt: -1 });

    res.status(200).json(notifications);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch your notifications." });
  }
};

// ✅ Mark a notification as read (owned by user)
export const markNotificationAsRead = async (req, res) => {
  try {
    const notificationId = req.params.notificationId;

    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, user: req.user._id },
      { read: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ error: "Notification not found or not yours." });
    }

    res.status(200).json({ message: "Marked as read", notification });
  } catch (err) {
    res.status(500).json({ error: "Failed to update notification." });
  }
};

// ✅ Delete a notification (only user's)
export const deleteNotification = async (req, res) => {
  try {
    const notificationId = req.params.notificationId;

    const deleted = await Notification.findOneAndDelete({
      _id: notificationId,
      user: req.user._id,
    });

    if (!deleted) {
      return res.status(404).json({ error: "Notification not found or not yours." });
    }

    res.status(200).json({ message: "Notification deleted." });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete notification." });
  }
};

// ✅ Delete multiple notifications (IDs in body)
export const deleteMultipleNotifications = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "No notification IDs provided." });
    }

    const deleted = await Notification.deleteMany({
      _id: { $in: ids },
      user: req.user._id,
    });

    res.status(200).json({ message: `${deleted.deletedCount} notifications deleted.` });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete notifications." });
  }
};

// ✅ Delete all user notifications
export const deleteAllNotifications = async (req, res) => {
  try {
    const deleted = await Notification.deleteMany({ user: req.user._id });
    res.status(200).json({ message: `${deleted.deletedCount} notifications deleted.` });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete all notifications." });
  }
};




// ✅ Admin: Get all notifications (for moderation or analytics)
export const getAllNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find()
      .sort({ createdAt: -1 })
      .populate("user", "userName email");
    res.status(200).json(notifications);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch all notifications." });
  }
};



export const getLatestNotifications = async (req, res, next) => {
  try {
    const { role } = req.query;

    let roleFilter = {};
    if (role) {
      roleFilter.targetRole = role;
    } else {
      roleFilter.targetRole = { $in: ["buyer", "seller", "superadmin", "admin"] };
    }

    const notifications = await Notification.find({
      user: req.user._id,
      ...roleFilter,
    })
      .sort({ createdAt: -1 })
      .limit(4);

    res.status(200).json(notifications);
  } catch (err) {
     next(err);
  }
};
