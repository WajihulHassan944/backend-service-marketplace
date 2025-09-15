import express from "express";
import { isAuthenticated, isAuthenticatedSuperAdmin } from "../middlewares/auth.js";
import gigUpload from "../middlewares/gigUpload.js";
import {
  changeGigStatus,
  createGig,
  deleteGig,
  getAllActiveGigs,
  getAllGigs,
  getAllPendingGigs,
  getAllRejectedGigs,
  getGigById,
  getGigsByUserId,
  pauseGig,
  unpauseGig,
  updateGig,
} from "../controllers/gigs.js";

const router = express.Router();

// Create a new gig
router.post(
  "/create",
  isAuthenticated,
  gigUpload.fields([
    { name: "gigImages", maxCount: 3 },
    { name: "gigPdf", maxCount: 1 },
  ]),
  createGig
);

// Update an existing gig by ID (with file + field handling)
router.put(
  "/update/:id",
  isAuthenticated,
  gigUpload.fields([
    { name: "gigImages", maxCount: 3 },
    { name: "gigPdf", maxCount: 1 },
  ]),
  updateGig
);

router.put("/pause/:id", isAuthenticated, pauseGig);
router.put("/unpause/:id", isAuthenticated, unpauseGig);

router.delete("/delete/:id",isAuthenticated, deleteGig);

router.get("/all/:userId", getGigsByUserId);

router.get("/getGigById/:id", getGigById);

router.get("/all", getAllGigs);

router.get("/active", getAllActiveGigs);

router.get("/pending", getAllPendingGigs);

router.get("/rejected", getAllRejectedGigs);

router.get("/status/:action/:id", changeGigStatus);

export default router;
