import express from "express";
import { blockUser, deleteUserById, getAllAdmins, getAllBuyers, getAllSellers, getAllUsers, getMyProfile, googleLogin, googleRegister, login, logout, register, requestSellerRole, unblockUser, verifyEmail, verifyUser } from "../controllers/user.js";
import { isAuthenticated, isAuthenticatedSuperAdmin } from "../middlewares/auth.js";
import upload from "../middlewares/upload.js";

const router = express.Router();

router.post('/register', upload.single('profileImage'), register);
router.post("/google-login", googleLogin);
router.post("/google-register", googleRegister);
router.post("/login", login);
router.get("/logout", logout);
router.get("/userdetails", isAuthenticated, getMyProfile);
router.get("/all", isAuthenticatedSuperAdmin, getAllUsers);
router.delete("/admin/delete-user/:id", isAuthenticatedSuperAdmin, deleteUserById);
router.get("/buyers", isAuthenticatedSuperAdmin, getAllBuyers);
router.get("/sellers", isAuthenticatedSuperAdmin, getAllSellers);
router.get("/admins", isAuthenticatedSuperAdmin, getAllAdmins);
router.put("/:id/block", isAuthenticatedSuperAdmin, blockUser);
router.put("/:id/unblock", isAuthenticatedSuperAdmin, unblockUser);
router.get("/verify/:id", verifyUser);
router.get("/verify-email", verifyEmail);
router.post("/request-seller", isAuthenticated, requestSellerRole);



export default router;
