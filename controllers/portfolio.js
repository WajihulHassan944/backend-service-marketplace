
import ErrorHandler from "../middlewares/error.js";
import { Notification } from "../models/notification.js";
import { Portfolio } from "../models/portfolio.js";
import cloudinary from "../utils/cloudinary.js";
import streamifier from "streamifier";

export const createPortfolio = async (req, res, next) => {
  try {
    const { title, description, previewType, websiteLink } = req.body;
const userId = req.user._id;
    if (!userId || !title || !description || !previewType) {
      return next(new ErrorHandler("All required fields must be provided", 400));
    }

    let imageUrl = "";

    if (previewType === "image") {
      if (!req.file) {
        return next(new ErrorHandler("Image file is required for image preview", 400));
      }

      const bufferStream = streamifier.createReadStream(req.file.buffer);
      const cloudinaryUpload = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "portfolios" },
          (error, result) => {
            if (result) resolve(result);
            else reject(error);
          }
        );
        bufferStream.pipe(stream);
      });

      imageUrl = cloudinaryUpload.secure_url;
    }

    if (previewType === "link" && !websiteLink) {
      return next(new ErrorHandler("Website link is required for link preview", 400));
    }

    const portfolio = await Portfolio.create({
      user: userId,
      title,
      description,
      previewType,
      imageUrl: previewType === "image" ? imageUrl : undefined,
      websiteLink: previewType === "link" ? websiteLink : undefined,
    });
 await Notification.create({
        user: req.user._id,
      title: "Portfolio Created",
      description: `Your portfolio titled "${title}" was successfully created.`,
      type: "portfolio",
      targetRole: "seller",
      link: `https://dotask-service-marketplace.vercel.app/seller/portfolio-details?portfolioId=${portfolio._id}`,
    });

    res.status(201).json({
      success: true,
      message: "Portfolio created successfully",
      portfolio,
    });
  } catch (error) {
    next(error);
  }
};

export const updatePortfolio = async (req, res, next) => {
  try {
    const { portfolioId } = req.params;
    const { title, description, previewType, websiteLink } = req.body;

    const portfolio = await Portfolio.findById(portfolioId);
    if (!portfolio) return next(new ErrorHandler("Portfolio not found", 404));

    // Handle image replacement if new file provided
    if (previewType === "image" && req.file) {
      // Delete old image
      if (portfolio.imageUrl) {
        const publicId = portfolio.imageUrl.split("/").pop().split(".")[0];
        await cloudinary.uploader.destroy(`portfolios/${publicId}`);
      }

      // Upload new image
      const bufferStream = streamifier.createReadStream(req.file.buffer);
      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "portfolios" },
          (error, result) => {
            if (result) resolve(result);
            else reject(error);
          }
        );
        bufferStream.pipe(stream);
      });

      portfolio.imageUrl = uploadResult.secure_url;
    }

    // Update other fields
    portfolio.title = title || portfolio.title;
    portfolio.description = description || portfolio.description;
    portfolio.previewType = previewType || portfolio.previewType;
    portfolio.websiteLink = previewType === "link" ? websiteLink : undefined;

    await portfolio.save();

 await Notification.create({
      user: req.user._id,
      title: "Portfolio Updated",
      description: `Your portfolio titled "${portfolio.title}" was updated successfully.`,
      type: "portfolio",
      targetRole: "seller",
      link: `http://dotask-service-marketplace.vercel.app/seller/portfolio-details?portfolioId=${portfolio._id}`,
    });


    res.status(200).json({
      success: true,
      message: "Portfolio updated successfully",
      portfolio,
    });
  } catch (error) {
    next(error);
  }
};


export const deletePortfolio = async (req, res, next) => {
  try {
    const { portfolioId } = req.params;
    const portfolio = await Portfolio.findById(portfolioId);

    if (!portfolio) return next(new ErrorHandler("Portfolio not found", 404));
 const deletedTitle = portfolio.title;
    // Delete image from Cloudinary if it exists
    if (portfolio.imageUrl) {
      const publicId = portfolio.imageUrl.split("/").pop().split(".")[0];
      await cloudinary.uploader.destroy(`portfolios/${publicId}`);
    }

    await portfolio.deleteOne();
 await Notification.create({
      user: req.user._id,
      title: "Portfolio Deleted",
      description: `Your portfolio titled "${deletedTitle}" was deleted.`,
      type: "portfolio",
      targetRole: "seller",
      link: "", // no link since it's deleted
    });
    res.status(200).json({
      success: true,
      message: "Portfolio deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};



export const getPortfolioById = async (req, res, next) => {
  try {
    const { portfolioId } = req.params;
    const portfolio = await Portfolio.findById(portfolioId).populate("user", "firstName lastName profileUrl");

    if (!portfolio) return next(new ErrorHandler("Portfolio not found", 404));

    res.status(200).json({
      success: true,
      portfolio,
    });
  } catch (error) {
    next(error);
  }
};


export const getUserPortfolios = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const portfolios = await Portfolio.find({ user: userId }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: portfolios.length,
      portfolios,
    });
  } catch (error) {
    next(error);
  }
};


export const getAllPortfolios = async (req, res, next) => {
  try {
    const portfolios = await Portfolio.find().populate("user", "firstName lastName profileUrl").sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: portfolios.length,
      portfolios,
    });
  } catch (error) {
    next(error);
  }
};
