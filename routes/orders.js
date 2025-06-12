import express from "express";
import { isAuthenticated } from "../middlewares/auth.js";
import orderUpload from "../middlewares/orderUpload.js";
import {
  createOrder,
} from "../controllers/orders.js";

const router = express.Router();

// Create a new order (optionally with 1 file)
router.post("/create", orderUpload.single("file"), createOrder);


export default router;
