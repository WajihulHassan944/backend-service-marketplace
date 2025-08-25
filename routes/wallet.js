import express from 'express';
import { addBillingMethod, addFundsToWallet,  removeCard, setPrimaryCard, withdrawFunds } from '../controllers/wallet.js';
import { isAuthenticated } from '../middlewares/auth.js';


const router = express.Router();

router.post('/add-billing-method',isAuthenticated, addBillingMethod);
router.post('/add-funds',isAuthenticated, addFundsToWallet);
router.put("/set-primary-card",isAuthenticated, setPrimaryCard);
router.delete("/remove-card",isAuthenticated, removeCard);
router.post("/withdraw", withdrawFunds);


export default router;
