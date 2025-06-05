import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";
import { Gig } from "../models/gigs.js";
import ErrorHandler from "../middlewares/error.js";

cloudinary.config({
  cloud_name: "dxhvhuclm",
  api_key: "698647745175389",
  api_secret: "fZRW13reHqz_TkvH9jMAH7azLZ4",
});

const uploadToCloudinary = (buffer, folder = "gig_images", resource_type = "image") => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type },
      (error, result) => {
        if (result) {
          console.log(`✅ Uploaded to Cloudinary (${resource_type}):`, result.secure_url);
          resolve(result.secure_url);  // 🔥 USE ONLY THIS LINE — works for both images and PDFs
        } else {
          console.error(`❌ Cloudinary upload error (${resource_type}):`, error);
          reject(error);
        }
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

    console.log("🔍 req.body:", req.body);
    console.log("📦 req.files:", req.files);

    if (!userId || !gigTitle || !category || !subcategory || !packages) {
      return next(new ErrorHandler("Missing required fields", 400));
    }

    const images = [];
    let pdfUrl = "";

    // Handle optional files gracefully
    if (req.files) {
      if (Array.isArray(req.files.gigImages)) {
        for (const imageFile of req.files.gigImages) {
          if (imageFile?.buffer) {
            const imageUrl = await uploadToCloudinary(imageFile.buffer);
            images.push(imageUrl);
          }
        }
      }

      if (Array.isArray(req.files.gigPdf) && req.files.gigPdf[0]) {
        const pdfFile = req.files.gigPdf[0];
        if (pdfFile.size > 1 * 1024 * 1024) {
          return next(new ErrorHandler("PDF size exceeds 1MB limit", 400));
        }
        if (pdfFile?.buffer) {
          pdfUrl = await uploadToCloudinary(pdfFile.buffer, "gig_pdfs", "raw");
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
    console.error("❌ Error in createGig:", error);

    if (error.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({
        success: false,
        message: `Unexpected file field: ${error.field}. Ensure frontend only sends 'gigImages' and 'gigPdf'.`,
      });
    }

    next(error);
  }
};
