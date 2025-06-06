import express from "express";
import { isAuthenticated } from "../middlewares/auth.js";
import gigUpload from "../middlewares/gigUpload.js";
import { createGig, deleteGig, getAllGigs, getGigsByUserId, updateGig } from "../controllers/gigs.js";

const router = express.Router();

router.post(
  "/create",
  gigUpload.fields([
    { name: "gigImages", maxCount: 3 },
    { name: "gigPdf", maxCount: 1 },
  ]),
  createGig
);

router.delete("/delete/:id", deleteGig);
router.put("/update/:id", updateGig);
router.get("/all/:userId", getGigsByUserId);
router.get("/all", getAllGigs);


export default router;
