import express from "express";
import { isAuthenticated } from "../middlewares/auth.js";
import orderUpload from "../middlewares/orderUpload.js";

import {
  createOrder,
  getOrdersByUser,
  getOrderById,
  updateOrderStatus,
  deleteOrder,
  getAllOrders,
} from "../controllers/orders.js";

const router = express.Router();

router.post("/create",  orderUpload.single("file"), createOrder);

router.get("/user/:userId/:role",  getOrdersByUser);

router.get("/:id",  getOrderById);

router.put("/status/:id",  updateOrderStatus);

router.delete("/delete/:id",  deleteOrder);

router.get("/all", getAllOrders);

export default router;
