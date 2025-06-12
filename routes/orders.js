import express from "express";
import { isAuthenticated } from "../middlewares/auth.js";
import orderUpload from "../middlewares/orderUpload.js";

import {
  createOrder,
  getOrdersByUser,
  getOrderById,
  updateOrderStatus,
  deleteOrder,
} from "../controllers/orders.js";

const router = express.Router();

// Create a new order (optionally with 1 file)
router.post("/create",  orderUpload.single("file"), createOrder);

// Get all orders for a user (as buyer or seller)
router.get("/user/:userId/:role",  getOrdersByUser);

// Get specific order by ID
router.get("/:id",  getOrderById);

// Update order status (e.g., mark as delivered, completed, cancelled)
router.put("/status/:id",  updateOrderStatus);

// Delete an order and its files from Cloudinary
router.delete("/delete/:id",  deleteOrder);

export default router;
