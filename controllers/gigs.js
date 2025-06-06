import streamifier from "streamifier";
import { Gig } from "../models/gigs.js";
import ErrorHandler from "../middlewares/error.js";
import { v4 as uuidv4 } from "uuid";
import cloudinary from "../utils/cloudinary.js";

// Helper function to upload buffer and return full result (secure_url + public_id)
const uploadToCloudinary = (buffer, folder = "gig_images", resource_type = "image") => {
  return new Promise((resolve, reject) => {
    const uniqueId = uuidv4();
    const isPdf = resource_type === "raw";
    const public_id = `${folder}/${uniqueId}${isPdf ? ".pdf" : ""}`;

    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type,
        type: "upload",
        public_id,
        use_filename: true,
        unique_filename: false,
        overwrite: true,
        format: isPdf ? "pdf" : undefined,
      },
      (error, result) => {
        if (result) {
          console.log(`✅ Uploaded to Cloudinary (${resource_type}):`, result.secure_url);
          resolve({
            url: result.secure_url,
            public_id: result.public_id,
          });
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
    let pdf = { url: "", public_id: "" };

    // Handle optional files
    if (req.files) {
      // Handle multiple image uploads
      if (Array.isArray(req.files.gigImages)) {
        for (const imageFile of req.files.gigImages) {
          if (imageFile?.buffer) {
            const result = await uploadToCloudinary(imageFile.buffer);
            images.push(result); // { url, public_id }
          }
        }
      }

      // Handle single PDF upload
      if (Array.isArray(req.files.gigPdf) && req.files.gigPdf[0]) {
        const pdfFile = req.files.gigPdf[0];
        if (pdfFile.size > 1 * 1024 * 1024) {
          return next(new ErrorHandler("PDF size exceeds 1MB limit", 400));
        }
        if (pdfFile?.buffer) {
          pdf = await uploadToCloudinary(pdfFile.buffer, "gig_pdfs", "raw"); // { url, public_id }
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
      pdf,
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


export const deleteGig = async (req, res, next) => {
  try {
    const { id } = req.params;

    const gig = await Gig.findById(id);
    if (!gig) return next(new ErrorHandler("Gig not found", 404));

    // Delete associated images from Cloudinary
    if (Array.isArray(gig.images)) {
      for (const image of gig.images) {
        if (image.public_id) {
          await cloudinary.uploader.destroy(image.public_id);
        }
      }
    }

    // Delete associated PDF from Cloudinary
    if (gig.pdf?.public_id) {
      await cloudinary.uploader.destroy(gig.pdf.public_id, { resource_type: "raw" });
    }

    await Gig.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Gig deleted successfully",
    });

  } catch (error) {
    console.error("❌ Error in deleteGigById:", error);
    next(error);
  }
};



export const updateGig = async (req, res, next) => {
  try {
    const { id } = req.params;

    const gig = await Gig.findById(id);
    if (!gig) return next(new ErrorHandler("Gig not found", 404));

    // Parse fields from req.body
    const {
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

    // Update images if new ones are uploaded
    let updatedImages = gig.images;
    if (req.files && Array.isArray(req.files.gigImages) && req.files.gigImages.length > 0) {
      // Delete old images from Cloudinary
      if (Array.isArray(gig.images)) {
        for (const image of gig.images) {
          if (image.public_id) {
            await cloudinary.uploader.destroy(image.public_id);
          }
        }
      }

      // Upload new images
      updatedImages = [];
      for (const imageFile of req.files.gigImages) {
        if (imageFile?.buffer) {
          const result = await uploadToCloudinary(imageFile.buffer);
          updatedImages.push(result);
        }
      }
    }

    // Update PDF if new one is uploaded
    let updatedPdf = gig.pdf;
    if (req.files && Array.isArray(req.files.gigPdf) && req.files.gigPdf.length > 0) {
      // Delete old PDF from Cloudinary
      if (gig.pdf?.public_id) {
        await cloudinary.uploader.destroy(gig.pdf.public_id, { resource_type: "raw" });
      }

      const pdfFile = req.files.gigPdf[0];
      if (pdfFile.size > 1 * 1024 * 1024) {
        return next(new ErrorHandler("PDF size exceeds 1MB limit", 400));
      }
      if (pdfFile?.buffer) {
        updatedPdf = await uploadToCloudinary(pdfFile.buffer, "gig_pdfs", "raw");
      }
    }

    // Update other fields
    gig.gigTitle = gigTitle || gig.gigTitle;
    gig.category = category || gig.category;
    gig.subcategory = subcategory || gig.subcategory;
    gig.searchTag = searchTag || gig.searchTag;
    gig.positiveKeywords = positiveKeywords ? JSON.parse(positiveKeywords) : gig.positiveKeywords;
    gig.packages = packages ? JSON.parse(packages) : gig.packages;
    gig.gigDescription = gigDescription || gig.gigDescription;
    gig.hourlyRate = hourlyRate !== undefined ? hourlyRate : gig.hourlyRate;
    gig.videoIframes = videoIframes ? JSON.parse(videoIframes) : gig.videoIframes;

    gig.images = updatedImages;
    gig.pdf = updatedPdf;

    await gig.save();

    res.status(200).json({
      success: true,
      message: "Gig updated successfully",
      gig,
    });

  } catch (error) {
    console.error("❌ Error in updateGigById:", error);
    next(error);
  }
};



export const getGigsByUserId = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const gigs = await Gig.find({ userId });

    if (!gigs || gigs.length === 0) {
      return next(new ErrorHandler("No gigs found for this user", 404));
    }

    res.status(200).json({
      success: true,
      gigs,
    });
  } catch (error) {
    console.error("❌ Error in getGigsByUserId:", error);
    next(error);
  }
};


export const getAllGigs = async (req, res, next) => {
  try {
    const gigs = await Gig.find();

    res.status(200).json({
      success: true,
      gigs,
    });
  } catch (error) {
    console.error("❌ Error in getAllGigs:", error);
    next(error);
  }
};