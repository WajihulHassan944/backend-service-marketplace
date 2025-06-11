import { Message } from "../models/messages.js";
import { Conversation } from "../models/conversation.js";
import { User } from "../models/user.js";
import ErrorHandler from "../middlewares/error.js";
import mongoose from "mongoose";


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

    let conversation = await Conversation.findOne({
      participantOne,
      participantTwo,
    });

    if (!conversation) {
      conversation = await Conversation.create({
        participantOne,
        participantTwo,
      });
    }

    // Create and then populate the new message
    const newMessage = await Message.create({
      conversationId: conversation._id,
      senderId,
      receiverId,
      message,
    });

    // Populate senderId and receiverId before sending response
    const populatedMessage = await Message.findById(newMessage._id)
      .populate("senderId", "firstName lastName profileUrl")
      .populate("receiverId", "firstName lastName profileUrl");

    conversation.lastMessage = message;
    conversation.lastUpdated = new Date();
    await conversation.save();

    return res.status(201).json({
      success: true,
      message: "Message sent successfully",
      data: populatedMessage,
    });
  } catch (error) {
    if (error.code === 11000) {
      return next(
        new ErrorHandler("Duplicate conversation detected. Please try again.", 409)
      );
    }

    return next(error);
  }
};




export const getUserConversations = async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return next(new ErrorHandler("Invalid userId", 400));
    }

    // Find all conversations where user is either participantOne or participantTwo
    const conversations = await Conversation.find({
      $or: [
        { participantOne: userId },
        { participantTwo: userId }
      ],
    })
      .sort({ lastUpdated: -1 })
      .populate("participantOne", "firstName lastName profileUrl role")
      .populate("participantTwo", "firstName lastName profileUrl role");

    // Attach last message to each conversation
    const conversationsWithMessages = await Promise.all(
      conversations.map(async (conversation) => {
        const lastMessage = await Message.findOne({
          conversationId: conversation._id,
        })
          .sort({ createdAt: -1 })
          .select("message senderId createdAt isRead");

        return {
          ...conversation.toObject(),
          lastMessage,
        };
      })
    );

    res.status(200).json({
      success: true,
      data: conversationsWithMessages,
    });
  } catch (error) {
    next(error);
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
export const markMessagesAsRead = async (req, res, next) => {
  try {
    const { conversationId, userId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(conversationId) || !mongoose.Types.ObjectId.isValid(userId)) {
      return next(new ErrorHandler("Invalid IDs", 400));
    }

    await Message.updateMany(
      { conversationId, senderId: { $ne: userId }, isRead: false },
      { $set: { isRead: true } }
    );

    res.status(200).json({
      success: true,
      message: "Messages marked as read",
    });
  } catch (error) {
    next(error);
  }
};


export const deleteMessage = async (req, res, next) => {
  try {
    const { messageId, userId } = req.body;

    const message = await Message.findById(messageId);
    if (!message) return next(new ErrorHandler("Message not found", 404));

    if (message.senderId.toString() === userId) {
      message.isDeletedBySender = true;
    } else if (message.receiverId?.toString() === userId) {
      message.isDeletedByReceiver = true;
    } else {
      return next(new ErrorHandler("Unauthorized", 403));
    }

    await message.save();

    res.status(200).json({
      success: true,
      message: "Message deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};


export const getAllConversationsWithMessages = async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return next(new ErrorHandler("Invalid userId", 400));
    }

    // Step 1: Find all conversations for the user
    const conversations = await Conversation.find({
      participants: userId,
    })
      .sort({ lastUpdated: -1 })
      .populate("participants", "firstName lastName profileUrl role");

    // Step 2: For each conversation, get all messages
    const detailedConversations = await Promise.all(
      conversations.map(async (conversation) => {
        const messages = await Message.find({ conversationId: conversation._id })
          .sort({ createdAt: 1 }) // Oldest to newest
          .select("message senderId receiverId createdAt isRead");

        return {
          ...conversation.toObject(),
          messages,
        };
      })
    );

    res.status(200).json({
      success: true,
      data: detailedConversations,
    });
  } catch (error) {
    next(error);
  }
};