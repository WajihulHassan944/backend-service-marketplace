import express from "express";
import { isAuthenticated } from "../middlewares/auth.js";
import gigUpload from "../middlewares/gigUpload.js";
import { createGig } from "../controllers/gigs.js";

const router = express.Router();

router.post(
  "/create",
  isAuthenticated,
  gigUpload.fields([
    { name: "gigImages", maxCount: 3 },
    { name: "gigPdf", maxCount: 1 },
  ]),
  createGig
);

export default router;
