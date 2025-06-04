import { Gig } from "../models/gigs.js";
import ErrorHandler from "../middlewares/error.js";
import cloudinary from "../utils/cloudinary.js";
import streamifier from "streamifier";

const uploadToCloudinary = (buffer, folder = "gig_images", resource_type = "image") => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type },
      (error, result) => {
        if (result) resolve(result.secure_url);
        else reject(error);
      }
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
};

export const createGig = async (req, res, next) => {
  try {
    const {
      userId,
      gigTitle,
      category,
      subcategory,
      searchTag,
      positiveKeywords,
      packages,
      gigDescription,
      hourlyRate,
      videoIframes,
    } = req.body;

    if (!userId || !gigTitle || !category || !subcategory || !packages) {
      return next(new ErrorHandler("Missing required fields", 400));
    }

    const images = [];
    let pdfUrl = "";

    // Handle uploaded files (images + optional PDF)
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        if (file.mimetype === "application/pdf") {
          if (file.size > 1 * 1024 * 1024) {
            return next(new ErrorHandler("PDF size exceeds 1MB limit", 400));
          }
          pdfUrl = await uploadToCloudinary(file.buffer, "gig_pdfs", "raw");
        } else {
          const imageUrl = await uploadToCloudinary(file.buffer);
          images.push(imageUrl);
        }
      }
    }

    const newGig = await Gig.create({
      userId,
      gigTitle,
      category,
      subcategory,
      searchTag,
      positiveKeywords: JSON.parse(positiveKeywords || "[]"),
      packages: JSON.parse(packages),
      gigDescription,
      hourlyRate,
      images,
      videoIframes: JSON.parse(videoIframes || "[]"),
      pdf: pdfUrl,
    });

    res.status(201).json({
      success: true,
      message: "Gig created successfully",
      gig: newGig,
    });
  } catch (error) {
    next(error);
  }
};
