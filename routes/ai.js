import express from 'express';
import { chatTurn, generateBrief } from '../controllers/aiController.js';

const router = express.Router();

router.post('/brief', generateBrief);
router.post('/chat', chatTurn);

export default router;
