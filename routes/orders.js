import express from "express";
import { isAuthenticated } from "../middlewares/auth.js";
import orderUpload from "../middlewares/orderUpload.js";

import {
  createOrder,
  getOrdersByUser,
  getOrderById,
  deleteOrder,
  getAllOrders,
  deliverOrder,
  addBuyerReview,
  addSellerReview,
  approveFinalDelivery,
  inviteCoworkersToOrder,
  handleCoworkerResponse,
  getCoworkerOrders,
  raiseResolutionRequest,
  respondToResolutionRequest,
  getDisputedOrders,
  requestRevision,
  markRequirementsReviewed,
} from "../controllers/orders.js";

const router = express.Router();

router.post("/create",  orderUpload.single("file"), createOrder);

router.get("/user/:userId/:role",  getOrdersByUser);

router.get("/order-by-id/:id",  getOrderById);

router.delete("/delete/:id",  deleteOrder);

router.get("/all", getAllOrders);

router.patch("/deliver/:orderId", orderUpload.single("file"), deliverOrder);

router.post("/revision/:orderId", isAuthenticated, requestRevision);

router.patch("/buyer-review/:orderId", addBuyerReview);

router.patch("/seller-review/:orderId", addSellerReview);

router.post("/approve/:orderId", approveFinalDelivery);

router.patch("/invite-coworkers/:orderId", inviteCoworkersToOrder);

router.get("/response-to-cowork-action/:orderId/coworker-response", handleCoworkerResponse);

router.get("/coworker-orders/:sellerId", getCoworkerOrders);

router.post("/resolution/:orderId", raiseResolutionRequest);

router.get("/resolution-response/:orderId", respondToResolutionRequest);

router.get("/disputed", getDisputedOrders);

router.put("/requirements-reviewed/:orderId", markRequirementsReviewed);

export default router;
