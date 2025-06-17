import express from 'express';
import { createZoomMeeting, getUserMeetings } from '../controllers/zoom.js';

const router = express.Router();

router.post('/create-meeting', createZoomMeeting);
router.get('/user/:userId/meetings', getUserMeetings);
export default router;
