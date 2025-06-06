import express from "express";
import { isAuthenticated } from "../middlewares/auth.js";
import gigUpload from "../middlewares/gigUpload.js";
import {
  createGig,
  deleteGig,
  getAllGigs,
  getGigsByUserId,
  updateGig,
} from "../controllers/gigs.js";

const router = express.Router();

// Create a new gig
router.post(
  "/create",
  gigUpload.fields([
    { name: "gigImages", maxCount: 3 },
    { name: "gigPdf", maxCount: 1 },
  ]),
  createGig
);

// Update an existing gig by ID (with file + field handling)
router.put(
  "/update/:id",
  gigUpload.fields([
    { name: "gigImages", maxCount: 3 },
    { name: "gigPdf", maxCount: 1 },
  ]),
  updateGig
);

// Delete a gig by ID
router.delete("/delete/:id", deleteGig);

// Get all gigs for a specific user
router.get("/all/:userId", getGigsByUserId);

// Get all gigs
router.get("/all", getAllGigs);

export default router;
