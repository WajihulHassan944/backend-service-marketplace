import express from "express";
import {
  createClient,
  getAllClients,
  getClientById,
  updateClient,
  deleteClient,
} from "../controllers/clients.js";

import upload from "../middlewares/upload.js";
import { isAuthenticated } from "../middlewares/auth.js";

const router = express.Router();

// 🔒 All routes require authentication

// Create a new client (with profile image)
router.post(
  "/",
  isAuthenticated,
  upload.single("profileImage"),
  createClient
);

// Get all clients for authenticated user
router.get("/", isAuthenticated, getAllClients);

// Get a single client by ID
router.get("/:id", isAuthenticated, getClientById);

// Update client (optional new profile image)
router.put(
  "/:id",
  isAuthenticated,
 upload.single("profileImage"),
  updateClient
);

// Delete client
router.delete("/:id", isAuthenticated, deleteClient);

export default router;
