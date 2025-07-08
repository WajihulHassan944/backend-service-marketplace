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

// Create portfolio (with optional image upload)
router.post("/create",  isAuthenticated, upload.single("previewImage"), createPortfolio);

// Update portfolio (replace image if new one uploaded)
router.put("/update/:portfolioId",  isAuthenticated ,upload.single("previewImage"), updatePortfolio);

// Delete a portfolio
router.delete("/delete/:portfolioId",  isAuthenticated, deletePortfolio);

// Get portfolio by ID
router.get("/single/:portfolioId", getPortfolioById);

// Get all portfolios of a specific user
router.get("/user/:userId", getUserPortfolios);

// Get all portfolios (admin or public feed)
router.get("/all", getAllPortfolios);

export default router;
