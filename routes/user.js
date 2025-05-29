import express from "express";
import { deleteUserById, getAllUsers, getMyProfile, login, logout, register } from "../controllers/user.js";
import { isAuthenticated, isAuthenticatedSuperAdmin } from "../middlewares/auth.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/logout", logout);
router.get("/userdetails", isAuthenticated, getMyProfile);
router.get("/all", isAuthenticatedSuperAdmin, getAllUsers);
router.delete("/admin/delete-user/:id", isAuthenticatedSuperAdmin, deleteUserById);

export default router;
