import { Email } from "../models/email.js";
import { User } from "../models/user.js";
import { transporter } from "../utils/mailer.js";
import generateEmailTemplate from "../utils/emailTemplate.js";
import mongoose from "mongoose";

// 1. Send new email (Admin to users)
export const sendEmail = async (req, res, next) => {
  try {
    const { senderId, recipientIds, subject, body } = req.body;

    if (!senderId || !recipientIds?.length || !subject || !body) {
      console.log("missing things");
      return res.status(400).json({ message: "Missing required fields" });
    }

    const email = new Email({
      sender: senderId,
      recipients: recipientIds,
      subject,
      body,
      folder: "Sent",
      readBy: [],
    });

    await email.save();

    // Send email to each recipient
    const recipients = await User.find({ _id: { $in: recipientIds } });

    for (const user of recipients) {
      const html = generateEmailTemplate({
        firstName: user.firstName || "",
        subject,
        content: body,
      });

      await transporter.sendMail({
        from: process.env.ADMIN_EMAIL,
        to: user.email,
        subject,
        html,
      });
    }

    res.status(200).json({ message: "Email sent and saved", email });
  } catch (error) {
    next(error);
  }
};

// 2. Save as draft (not sent)
export const saveDraft = async (req, res, next) => {
  try {
    const { senderId, recipientIds, subject, body } = req.body;

    const email = new Email({
      sender: senderId,
      recipients: recipientIds || [],
      subject,
      body,
      folder: "Draft",
    });

    await email.save();
    res.status(200).json({ message: "Draft saved", email });
  } catch (error) {
    next(error);
  }
};

// 3. Move email to trash
export const moveToTrash = async (req, res, next) => {
  try {
    const { emailId } = req.params;

    const email = await Email.findByIdAndUpdate(
      emailId,
      { folder: "Trash" },
      { new: true }
    );

    res.status(200).json({ message: "Email moved to trash", email });
  } catch (error) {
    next(error);
  }
};

// 4. Mark as read
export const markAsRead = async (req, res, next) => {
  try {
    const { emailId, userId } = req.body;

    await Email.findByIdAndUpdate(emailId, {
      $addToSet: { readBy: userId },
    });

    res.status(200).json({ message: "Email marked as read" });
  } catch (error) {
    next(error);
  }
};

// 5. Get all emails for admin (Inbox, Drafts, Sent, Trash)
export const getEmailsByFolder = async (req, res, next) => {
  try {
    const { folder = "Inbox" } = req.query;

    const emails = await Email.find({ folder }).sort({ createdAt: -1 }).populate("sender recipients", "firstName email");

    res.status(200).json(emails);
  } catch (error) {
    next(error);
  }
};

// 6. Submit contact form (can be unregistered user)
export const submitContactForm = async (req, res, next) => {
  try {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Email to admin
    const adminHtml = generateEmailTemplate({
      firstName: "Admin",
      subject,
      content: `<strong>Name:</strong> ${name}<br/>
                <strong>Email:</strong> ${email}<br/><br/>
                ${message}`,
    });

    await transporter.sendMail({
      from: email,
      to: process.env.ADMIN_EMAIL,
      subject: `[Contact Form] ${subject}`,
      html: adminHtml,
    });

    // Store message in DB
    const adminUser = await User.findOne({ role: "superadmin" });

    const emailDoc = new Email({
      sender: adminUser?._id || new mongoose.Types.ObjectId(), // fallback dummy ObjectId
      recipients: [adminUser?._id],
      subject: `[Contact Form] ${subject}`,
      body: `${name} (${email}):\n${message}`,
      isContactForm: true,
      folder: "Inbox",
    });

    await emailDoc.save();

    // Confirmation email to user
    const userHtml = generateEmailTemplate({
      firstName: name.split(" ")[0],
      subject: "Thanks for contacting doTask!",
      content: `
        <p>Dear ${name},</p>
        <p>Thank you for reaching out. We’ve received your message and will get back to you shortly.</p>
        <p><strong>Your Message:</strong><br/>${message}</p>
        <p>Regards,<br/>doTask Team</p>
      `,
    });

    await transporter.sendMail({
      from: process.env.ADMIN_EMAIL,
      to: email,
      subject: "We received your message - doTask",
      html: userHtml,
    });

    res.status(200).json({ message: "Message sent and confirmation email delivered" });
  } catch (error) {
    next(error);
  }
};

// 7. Delete email permanently
export const deleteEmail = async (req, res, next) => {
  try {
    const { emailId } = req.params;

    await Email.findByIdAndDelete(emailId);
    res.status(200).json({ message: "Email deleted permanently" });
  } catch (error) {
    next(error);
  }
};

export const replyToEmail = async (req, res, next) => {
  try {
    const { recipientEmail } = req.params;
    const { senderId, message } = req.body;

    if (!senderId || !message || !recipientEmail) {
      return res.status(400).json({ message: "Missing senderId, message, or recipientEmail" });
    }

    const replySubject = "Re: Message from Admin";

    // Save reply to DB with recipientEmail (not user ref)
    const reply = new Email({
      sender: senderId,
      recipients: [recipientEmail], // storing raw email
      subject: replySubject,
      body: message,
      folder: "Sent",
    });

    await reply.save();

    // Send reply email
    const html = generateEmailTemplate({
      firstName: "there",
      subject: replySubject,
      content: message,
    });

    await transporter.sendMail({
      from: process.env.ADMIN_EMAIL,
      to: recipientEmail,
      subject: replySubject,
      html,
    });

    res.status(200).json({ message: "Reply sent successfully", reply });
  } catch (error) {
    next(error);
  }
};



export const markAsImportant = async (req, res, next) => {
  try {
    const { emailId } = req.params;
    const email = await Email.findByIdAndUpdate(emailId, { isImportant: true }, { new: true });
    if (!email) return res.status(404).json({ message: "Email not found" });
    res.status(200).json({ message: "Marked as important", email });
  } catch (err) {
    next(err);
  }
};

export const markAsStarred = async (req, res, next) => {
  try {
    const { emailId } = req.params;
    const email = await Email.findByIdAndUpdate(emailId, { isStarred: true }, { new: true });
    if (!email) return res.status(404).json({ message: "Email not found" });
    res.status(200).json({ message: "Marked as starred", email });
  } catch (err) {
    next(err);
  }
};
