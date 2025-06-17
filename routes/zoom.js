import express from 'express';
import { createZoomMeeting, deleteZoomMeeting, getAllMeetings, getUserMeetings } from '../controllers/zoom.js';

const router = express.Router();

router.post('/create-meeting', createZoomMeeting);
router.get('/user/:userId/meetings', getUserMeetings);
router.delete('/meeting/:meetingId', deleteZoomMeeting);
router.get('/all-meetings', getAllMeetings);
export default router;
