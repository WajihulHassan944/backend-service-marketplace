import express from "express";
import { isAuthenticated } from "../middlewares/auth.js";
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


router.delete("/delete/:id", deleteGig);

router.get("/all/:userId", getGigsByUserId);

router.get("/getGigById/:id", getGigById);

router.get("/all", getAllGigs);

router.get("/active", getAllActiveGigs);

router.get("/pending", getAllPendingGigs);

router.get("/rejected", getAllRejectedGigs);

router.patch("/status/:id", changeGigStatus);

// Approve gig via GET
router.get("/status/approve/:id", async (req, res, next) => {
  req.body.status = "active"; // set status manually
  req.headers["content-type"] = ""; // make sure HTML response is returned
  req.params.id = req.params.id;
  changeGigStatus(req, res, next);
});

// Reject gig via GET
router.get("/status/reject/:id", async (req, res, next) => {
  req.body.status = "rejected"; // set status manually
  req.headers["content-type"] = ""; // make sure HTML response is returned
  req.params.id = req.params.id;
  changeGigStatus(req, res, next);
});


export default router;
