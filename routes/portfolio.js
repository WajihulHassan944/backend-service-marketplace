import express from "express";
import upload from "../middlewares/upload.js";
import {
  createPortfolio,
  updatePortfolio,
  deletePortfolio,
  getPortfolioById,
  getUserPortfolios,
  getAllPortfolios,
} from "../controllers/portfolio.js";
import { isAuthenticated } from "../middlewares/auth.js";

const router = express.Router();

router.post("/create",  isAuthenticated, upload.single("previewImage"), createPortfolio);
router.put("/update/:portfolioId",  isAuthenticated ,upload.single("previewImage"), updatePortfolio);
router.delete("/delete/:portfolioId",  isAuthenticated, deletePortfolio);
router.get("/single/:portfolioId", getPortfolioById);
router.get("/user/:userId", getUserPortfolios);
router.get("/all", getAllPortfolios);

export default router;
