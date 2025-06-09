import express from "express";
import {
  createCategory,
  getAllCategories,
  updateCategory,
  deleteCategory,
} from "../controllers/category.js";

import { isAuthenticatedSuperAdmin } from "../middlewares/auth.js";
import upload from "../middlewares/upload.js";

const router = express.Router();

router.post("/create", isAuthenticatedSuperAdmin, upload.single("image"), createCategory);

router.get("/all", getAllCategories);

router.put("/update/:id", isAuthenticatedSuperAdmin, upload.single("image"), updateCategory);

router.delete("/delete/:id", isAuthenticatedSuperAdmin, deleteCategory);

export default router;
