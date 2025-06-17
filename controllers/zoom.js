import fetch from 'node-fetch';
import { Meeting } from '../models/Meeting.js';
import { User } from "../models/user.js"
import { getZoomAccessToken } from '../utils/zoom.js';
import { transporter } from '../utils/mailer.js';
import generateEmailTemplate from "../utils/emailTemplate.js";

export const createZoomMeeting = async (req, res) => {
  const { topic, duration, userId, participantId } = req.body;

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
        type: 1,
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

    // Save to DB
    const savedMeeting = await Meeting.create({
      topic,
      meeting_id: data.id,
      join_url: data.join_url,
      start_url: data.start_url,
      password: data.password,
      createdBy: userId,
      participant: participantId,
    });
 console.log("📌 Meeting Created:");
    console.log("👤 Host:", {
      id: creator?._id,
      name: `${creator?.firstName} ${creator?.lastName}`,
      email: creator?.email,
    });
    console.log("👥 Participant:", {
      id: receiver?._id,
      name: `${receiver?.firstName} ${receiver?.lastName}`,
      email: receiver?.email,
    });
    // Notify both users
    const [creator, receiver] = await Promise.all([
      User.findById(userId),
      User.findById(participantId),
    ]);

    const subject = `Zoom Meeting Scheduled: ${topic}`;
    const emailContent = (user, role) => `
      <p>Dear ${user.firstName},</p>
      <p>A new Zoom meeting has been scheduled where you are the <strong>${role}</strong>.</p>
      <p><strong>Topic:</strong> ${topic}</p>
      <p><strong>Join Link:</strong> <a href="${data.join_url}" target="_blank">${data.join_url}</a></p>
      <p><strong>Password:</strong> ${data.password}</p>
      <p>Meeting is active now. You can join anytime.</p>
    `;

    if (creator?.email) {
      await transporter.sendMail({
        from: `"Service Marketplace" <${process.env.ADMIN_EMAIL}>`,
        to: creator.email,
        subject,
        html: generateEmailTemplate({
          firstName: creator.firstName,
          subject,
          content: emailContent(creator, "host"),
        }),
      });
    }

    if (receiver?.email) {
      await transporter.sendMail({
        from: `"Service Marketplace" <${process.env.ADMIN_EMAIL}>`,
        to: receiver.email,
        subject,
        html: generateEmailTemplate({
          firstName: receiver.firstName,
          subject,
          content: emailContent(receiver, "participant"),
        }),
      });
    }

    res.status(201).json(savedMeeting);
  } catch (err) {
    console.error("Meeting error:", err);
    res.status(500).json({ error: "Internal server error" });
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

export const getUserMeetings = async (req, res) => {
  const userId = req.params.userId || req.user?._id;

  try {
    const meetings = await Meeting.find({ createdBy: userId })
      .populate("createdBy", "firstName lastName email profileUrl")
      .populate("participant", "firstName lastName email profileUrl")
      .sort({ createdAt: -1 });

    res.status(200).json(meetings);
  } catch (err) {
    console.error("Error fetching meetings:", err);
    res.status(500).json({ error: "Failed to fetch meetings" });
  }
};
export const getAllMeetings = async (req, res) => {
  try {
    const meetings = await Meeting.find({})
      .populate("createdBy", "firstName lastName email profileUrl")
      .populate("participant", "firstName lastName email profileUrl")
      .sort({ createdAt: -1 });

    res.status(200).json(meetings);
  } catch (err) {
    console.error("Error fetching all meetings:", err);
    res.status(500).json({ error: "Failed to fetch meetings" });
  }
};
