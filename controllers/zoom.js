import fetch from 'node-fetch';
import { getZoomAccessToken } from '../utils/zoom.js';
import { Meeting } from '../models/Meeting.js';

export const createZoomMeeting = async (req, res) => {
  const { topic = "My Zoom Meeting", duration = 30 } = req.body;
  const userId = req.user?._id || req.body.userId; // Use from auth middleware or manually passed

  try {
    const token = await getZoomAccessToken();

    const zoomRes = await fetch("https://api.zoom.us/v2/users/me/meetings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        topic,
        type: 1, // Instant meeting
        duration,
        settings: {
          join_before_host: true,
        },
      }),
    });

    if (!zoomRes.ok) {
      const error = await zoomRes.json();
      console.error("Zoom API error:", error);
      return res.status(500).json({ error: error.message || "Zoom meeting creation failed" });
    }

    const data = await zoomRes.json();

    // Save to MongoDB
    const savedMeeting = await Meeting.create({
      topic,
      meeting_id: data.id,
      join_url: data.join_url,
      start_url: data.start_url,
      password: data.password,
      createdBy: userId,
    });

    res.status(201).json(savedMeeting);
  } catch (err) {
    console.error("Meeting error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getUserMeetings = async (req, res) => {
  const userId = req.params.userId || req.user?._id;

  try {
    const meetings = await Meeting.find({ createdBy: userId }).sort({ createdAt: -1 });

    res.status(200).json(meetings);
  } catch (err) {
    console.error("Error fetching meetings:", err);
    res.status(500).json({ error: "Failed to fetch meetings" });
  }
};

export const deleteZoomMeeting = async (req, res) => {
  const { meetingId } = req.params;
  const userId = req.user?._id || req.body.userId;

  try {
    const meeting = await Meeting.findOne({ meeting_id: meetingId, createdBy: userId });

    if (!meeting) {
      return res.status(404).json({ error: "Meeting not found or unauthorized" });
    }

    const token = await getZoomAccessToken();

    const zoomRes = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!zoomRes.ok && zoomRes.status !== 404) {
      const error = await zoomRes.text();
      console.error("Zoom deletion failed:", error);
      return res.status(500).json({ error: "Failed to delete meeting on Zoom" });
    }

    await Meeting.findOneAndDelete({ meeting_id: meetingId });

    res.status(200).json({ message: "Meeting deleted from Zoom and database" });
  } catch (err) {
    console.error("Delete meeting error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};


export const getAllMeetings = async (req, res) => {
  try {
    const meetings = await Meeting.find({})
      .populate("createdBy", "name email") // optional: show user info
      .sort({ createdAt: -1 });

    res.status(200).json(meetings);
  } catch (err) {
    console.error("Error fetching all meetings:", err);
    res.status(500).json({ error: "Failed to fetch meetings" });
  }
};