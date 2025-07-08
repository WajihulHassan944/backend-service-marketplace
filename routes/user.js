import express from "express";
import { allAvailableSellers, blockUser, deleteUserById, getAllAdmins, getAllBuyers, getAllSellers, getAllUsers, getMyProfile, getAllPublicSellerProfiles, getSellerProfileData, getUserById, getWishlistGigs, googleLogin, googleRegister, login, logout, register, requestSellerRole, resetPasswordConfirm, resetPasswordRequest, sellerRequest, toggleWishlist, unblockUser, updateAvailabilityStatus, updateProfile, verifyEmail, verifyUser, searchUsers, changePasswordDirectly } from "../controllers/user.js";
import { isAuthenticated, isAuthenticatedSuperAdmin } from "../middlewares/auth.js";
import upload from "../middlewares/upload.js";

const router = express.Router();

router.post('/register', upload.single('profileImage'), register);
router.post("/google-login", googleLogin);
router.post("/google-register", googleRegister);
router.post("/login", login);
router.get("/logout", logout);
router.get("/userdetails", isAuthenticated, getMyProfile);
router.get("/all", getAllUsers);
router.delete("/admin/delete-user/:id", deleteUserById);
router.get("/buyers", isAuthenticatedSuperAdmin, getAllBuyers);
router.get("/sellers", isAuthenticatedSuperAdmin, getAllSellers);
router.get("/admins", isAuthenticatedSuperAdmin, getAllAdmins);
router.put("/:id/block", isAuthenticatedSuperAdmin, blockUser);
router.put("/:id/unblock", isAuthenticatedSuperAdmin, unblockUser);
router.get("/verify/:id", verifyUser);
router.get("/verify-email", verifyEmail);
router.post("/request-seller", isAuthenticated, requestSellerRole);
router.put("/:id/seller-request", sellerRequest);
router.get("/getUserById/:userId", getUserById);
router.get("/getSellersForCowork", allAvailableSellers);
router.get("/getSellerProfileData/:userId", getSellerProfileData);
router.post("/reset-password-request", resetPasswordRequest);
router.post("/reset-password-confirm", resetPasswordConfirm);
router.put("/update-profile", upload.single("profileImg"), updateProfile);
router.put("/update/:userId/availability", updateAvailabilityStatus);
router.post("/toggle-wishlist", isAuthenticated, toggleWishlist);
router.get("/wishlisted-gigs", isAuthenticated, getWishlistGigs);
router.get("/seller-homepage-profile", getAllPublicSellerProfiles);
router.get('/search-users', searchUsers);
router.post("/change-password", changePasswordDirectly);


export default router;
