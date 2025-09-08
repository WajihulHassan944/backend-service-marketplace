import { Message } from "../models/messages.js";
import { Conversation } from "../models/conversation.js";
import { User } from "../models/user.js";
import ErrorHandler from "../middlewares/error.js";
import { pusher } from "../utils/pusher.js";
import streamifier from "streamifier";
import cloudinary from "../utils/cloudinary.js";
import mongoose from "mongoose";
const uploadToCloudinary = (buffer, originalName = "file") => {
  return new Promise((resolve, reject) => {
    const resource_type = "auto";

    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "chat_attachments",
        resource_type,
        use_filename: true,
        unique_filename: true,
        overwrite: false,
      },
      (error, result) => {
        if (result) {
          resolve({ url: result.secure_url, public_id: result.public_id });
        } else {
          reject(error);
        }
      }
    );

    streamifier.createReadStream(buffer).pipe(stream);
  });
};

export const postMessage = async (req, res, next) => {
  try {
    const { senderId, receiverId, message } = req.body;

    if (!senderId || !receiverId || !message) {
      return next(
        new ErrorHandler("senderId, receiverId, and message are required", 400)
      );
    }

    const sender = await User.findById(senderId);
    const receiver = await User.findById(receiverId);

    if (!sender || !receiver) {
      return next(new ErrorHandler("Invalid sender or receiver", 404));
    }

    const [participantOne, participantTwo] =
      senderId.toString() < receiverId.toString()
        ? [senderId, receiverId]
        : [receiverId, senderId];

    let conversation = await Conversation.findOne({ participantOne, participantTwo });

    if (!conversation) {
      conversation = await Conversation.create({ participantOne, participantTwo });
    }

    const attachments = [];

    if (req.files && req.files.length > 0) {
      if (req.files.length > 3) {
        return next(new ErrorHandler("Maximum of 3 attachments allowed", 400));
      }

      for (const file of req.files) {
        if (file.size > 5 * 1024 * 1024) {
          return next(new ErrorHandler("Each file must be under 5MB", 400));
        }

        const uploaded = await uploadToCloudinary(file.buffer, file.originalname);
        attachments.push(uploaded);
      }
    }

    const newMessage = await Message.create({
      conversationId: conversation._id,
      senderId,
      receiverId,
      message,
      attachments,
    });

    const populatedMessage = await Message.findById(newMessage._id)
      .populate("senderId", "firstName lastName profileUrl")
      .populate("receiverId", "firstName lastName profileUrl");

    conversation.lastMessage = message;
    conversation.lastUpdated = new Date();
    await conversation.save();

    // ✅ ORIGINAL PUSHER LOGIC
    const channelName = 'marketplace';
    const pusherResponse = await pusher.trigger(channelName, "new-message", {
      message: populatedMessage,
    });

    return res.status(201).json({
      success: true,
      message: "Message sent successfully",
      data: populatedMessage,
      pusherTriggered: pusherResponse === null,
    });
  } catch (error) {
    return next(error);
  }
};




export const getMessagesByConversationId = async (req, res, next) => {
  try {
    const { conversationId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return next(new ErrorHandler("Invalid conversationId", 400));
    }

    // Check if the conversation exists
    const conversation = await Conversation.findById(conversationId)
      .populate("participantOne", "firstName lastName profileUrl")
      .populate("participantTwo", "firstName lastName profileUrl");

    if (!conversation) {
      return next(new ErrorHandler("Conversation not found", 404));
    }

    // Fetch all messages in this conversation
    const messages = await Message.find({ conversationId })
      .sort({ createdAt: 1 })
      .populate("senderId", "firstName lastName profileUrl")
      .populate("receiverId", "firstName lastName profileUrl");

    res.status(200).json({
      success: true,
      data: messages,
    });
  } catch (error) {
    next(error);
  }
};


export const getConversationPartners = async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return next(new ErrorHandler("Invalid userId", 400));
    }

    // Get all conversations where the user is either participantOne or participantTwo
    const conversations = await Conversation.find({
      $or: [{ participantOne: userId }, { participantTwo: userId }],
    })
      .sort({ lastUpdated: -1 })
      .populate("participantOne", "firstName lastName profileUrl")
      .populate("participantTwo", "firstName lastName profileUrl");

    const results = conversations.map((convo) => {
      const isUserParticipantOne = convo.participantOne._id.toString() === userId;
      const otherParticipant = isUserParticipantOne ? convo.participantTwo : convo.participantOne;

      return {
        conversationId: convo._id,
        participant: otherParticipant,
        lastMessage: convo.lastMessage || "",
        lastMessageCreatedAt: convo.lastUpdated,
      };
    });

    res.status(200).json({
      success: true,
      data: results,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteMessage = async (req, res, next) => {
  try {
    const { messageId, userId } = req.body;

    if (!messageId || !userId) {
      return next(new ErrorHandler("Message ID and User ID are required", 400));
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return next(new ErrorHandler("Message not found", 404));
    }

    // Only sender can delete permanently (adjust rules if needed)
    if (message.senderId.toString() !== userId) {
      return next(new ErrorHandler("Unauthorized", 403));
    }

    const conversation = await Conversation.findById(message.conversationId);

    // Delete the message
    await message.deleteOne();

    // ✅ Update conversation if this was the last message
    if (conversation && conversation.lastMessage === message.message) {
      // Find the new latest message in this conversation
      const latestMessage = await Message.findOne({ conversationId: conversation._id })
        .sort({ createdAt: -1 });

      if (latestMessage) {
        conversation.lastMessage = latestMessage.message;
        conversation.lastUpdated = latestMessage.createdAt;
      } else {
        // No messages left in this conversation
        conversation.lastMessage = "";
        conversation.lastUpdated = new Date();
      }

      await conversation.save();
    }

    // Notify clients via Pusher
    await pusher.trigger("marketplace", "delete-message", { messageId });

    res.status(200).json({
      success: true,
      message: "Message deleted permanently",
    });
  } catch (error) {
    next(error);
  }
};

export const updateMessageContent = async (req, res, next) => {
  try {
    const { messageId, newContent } = req.body;

    if (!messageId || !newContent) {
      return next(new ErrorHandler("messageId and newContent are required", 400));
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return next(new ErrorHandler("Message not found", 404));
    }

    // Update message content
    message.message = newContent;
    await message.save();

    // ✅ Update conversation if this is the lastMessage
    const conversation = await Conversation.findById(message.conversationId);
    if (conversation) {
      conversation.lastMessage = newContent;
      conversation.lastUpdated = new Date();
      await conversation.save();
    }

    // Populate for frontend updates
    const populatedMessage = await Message.findById(message._id)
      .populate("senderId", "firstName lastName profileUrl")
      .populate("receiverId", "firstName lastName profileUrl");

    // Notify clients
    await pusher.trigger("marketplace", "message-updated", {
      message: populatedMessage,
    });

    res.status(200).json({
      success: true,
      message: "Message updated successfully",
      data: populatedMessage,
    });
  } catch (error) {
    next(error);
  }
};


export const deleteMessagesByConversationId = async (req, res, next) => {
   try {
    const { conversationId } = req.params;

    if (!conversationId) {
      return next(new ErrorHandler("conversationId is required", 400));
    }

    // Check if conversation exists
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return next(new ErrorHandler("Conversation not found", 404));
    }

    // Delete all messages of this conversation
    await Message.deleteMany({ conversationId });

    // Delete the conversation itself
    await Conversation.findByIdAndDelete(conversationId);

    // Notify clients (optional via Pusher / Socket.io)
    await pusher.trigger("marketplace", "conversation-deleted", {
      conversationId,
    });

    res.status(200).json({
      success: true,
      message: "Conversation and all messages deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};