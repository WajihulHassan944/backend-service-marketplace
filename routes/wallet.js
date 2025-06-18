import express from 'express';
import { addBillingMethod, addFundsToWallet, initializeWalletsForAllUsers } from '../controllers/wallet.js';


const router = express.Router();

router.post('/add-billing-method', addBillingMethod);
router.post('/add-funds', addFundsToWallet);




router.get('/user-wallets', initializeWalletsForAllUsers);

export default router;
