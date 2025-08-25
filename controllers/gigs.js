import streamifier from "streamifier";
import { Gig } from "../models/gigs.js";
import ErrorHandler from "../middlewares/error.js";
import { v4 as uuidv4 } from "uuid";
import cloudinary from "../utils/cloudinary.js";
import { User } from "../models/user.js"; // Make sure this is already at the top
import { Order } from "../models/orders.js";
import { formatDistanceToNow } from 'date-fns'; // Make sure date-fns is installed
import fetch from "node-fetch";
import jwt from "jsonwebtoken";
import { transporter } from "../utils/mailer.js";
import generateEmailTemplate from "../utils/emailTemplate.js";
import nodemailer from "nodemailer";
import { Notification } from "../models/notification.js";
import { Client } from "../models/clients.js";


const timeAgo = (date) => {
  if (!date) return null;
  return formatDistanceToNow(new Date(date), { addSuffix: true }); // e.g. "2 weeks ago"
};

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
      
      gigTitle,
      category,
      subcategory,
      subcategorychild,
      searchTag,
      positiveKeywords,
      packages,
      gigDescription,
      hourlyRate,
      videoIframes,
      offerPackages,
      faqs
    } = req.body;

    console.log("🔍 req.body:", req.body);
    console.log("📦 req.files:", req.files);
const userId = req.user._id;
    if (!userId || !gigTitle || !category || !subcategory || !packages || !subcategorychild) {
      return next(new ErrorHandler("Missing required fields", 400));
    }

    const images = [];
    let pdf = { url: "", public_id: "" };

    // Upload images
    if (req.files) {
      if (Array.isArray(req.files.gigImages)) {
        for (const imageFile of req.files.gigImages) {
          if (imageFile?.buffer) {
            const result = await uploadToCloudinary(imageFile.buffer);
            images.push(result);
          }
        }
      }

      if (Array.isArray(req.files.gigPdf) && req.files.gigPdf[0]) {
        const pdfFile = req.files.gigPdf[0];
        if (pdfFile.size > 1 * 1024 * 1024) {
          return next(new ErrorHandler("PDF size exceeds 1MB limit", 400));
        }
        if (pdfFile?.buffer) {
          pdf = await uploadToCloudinary(pdfFile.buffer, "gig_pdfs", "raw");
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
      subcategorychild,
      offerPackages,
      images,
      videoIframes: JSON.parse(videoIframes || "[]"),
      faqs: JSON.parse(faqs || "[]"),
      pdf,
      status: "pending",
    });

    // ✅ Fetch user from DB using userId
    const user = await User.findById(userId);

    // ✅ Notify user their gig is under review
    if (user?.email) {
      const userHtml = generateEmailTemplate({
        firstName: user.firstName,
        subject: "Gig Submitted for Review",
        content: `
          <h2>Thank you for submitting your gig, ${user.firstName}!</h2>
          <p>Your gig titled <strong>${gigTitle}</strong> has been successfully submitted and is currently under admin review.</p>
          <p>We’ll notify you once it’s approved or rejected.</p>
        `,
      });

      await transporter.sendMail({
        from: `"Service Marketplace" <${process.env.ADMIN_EMAIL}>`,
        to: user.email,
        subject: "Your Gig is Under Review",
        html: userHtml,
      });
    }

    // ✅ Send gig details to Admin with approve/reject buttons
    const adminHtml = generateEmailTemplate({
      firstName: "Admin",
      subject: "New Gig Submission",
      content: `
        <p>A new gig has been submitted by:</p>
        <ul>
          <li><strong>Name:</strong> ${user?.firstName || "Unknown"} ${user?.lastName || ""}</li>
          <li><strong>Email:</strong> ${user?.email || "Unknown"}</li>
        </ul>
        <p><strong>Gig Title:</strong> ${gigTitle}</p>
        <p><strong>Category:</strong> ${category} / ${subcategory}</p>
        <p><strong>Description:</strong> ${gigDescription.slice(0, 150)}...</p>
        <div style="margin-top:20px;">
        <a href="https://backend-service-marketplace.vercel.app/api/gigs/status/approve/${newGig._id}" 
   style="background-color:#28a745;color:#fff;padding:10px 15px;text-decoration:none;margin-right:10px;border-radius:5px;">
  Approve
</a>

<a href="https://backend-service-marketplace.vercel.app/api/gigs/status/reject/${newGig._id}" 
   style="background-color:#dc3545;color:#fff;padding:10px 15px;text-decoration:none;border-radius:5px;">
    Reject
</a>

        </div>
      `,
    });

    await transporter.sendMail({
      from: `"Service Marketplace Admin" <${process.env.ADMIN_EMAIL}>`,
      to: 'wajih786hassan@gmail.com',
      subject: "New Gig Pending Approval",
      html: adminHtml,
    });

await Notification.create({
  user: userId,
  title: "Gig Submitted",
  description: `Your gig titled "${gigTitle}" was submitted and is under review.`,
  type: "gig",
  targetRole: "seller",
  link: "http://dotask-service-marketplace.vercel.app/seller/services",
});


    res.status(201).json({
      success: true,
      message: "Gig created successfully and sent for admin review.",
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

 if (
      req.user._id.toString() !== gig.userId.toString() &&
      !(req.user.role && req.user.role.includes("superadmin"))
    ) {
      return next(new ErrorHandler("Unauthorized", 401));
    }
    
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
await Notification.create({
  user: gig.userId,
  title: "Gig Deleted",
  description: `Your gig titled "${gig.gigTitle}" was deleted.`,
  type: "gig",
  targetRole: "seller",
  link: "", // no link since the gig no longer exists
});

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
if (req.user._id.toString() !== gig.userId.toString()) {
  return next(new ErrorHandler("Unauthorized", 401));
}

    const {
      gigTitle,
      category,
      subcategory,
      searchTag,
      positiveKeywords,
      subcategorychild,
      packages,
      gigDescription,
      hourlyRate,
      videoIframes,
      offerPackages,
    } = req.body;
console.log(req.body.imagesToRemove);
   // Handle image deletions before adding new ones
if (req.body.imagesToRemove) {
  const toRemove = JSON.parse(req.body.imagesToRemove); // array of public_ids

  // Remove images from DB and Cloudinary
  gig.images = gig.images.filter(img => !toRemove.includes(img.public_id));

  for (const pid of toRemove) {
    await cloudinary.uploader.destroy(pid);
  }
}

// Handle new image uploads
if (req.files?.gigImages?.length > 0) {
  const currentImages = gig.images || [];
  const uploadedImages = [];

  for (const imageFile of req.files.gigImages) {
    if (imageFile.size > 1 * 1024 * 1024) {
      return next(new ErrorHandler("Each image must be 1MB or smaller", 400));
    }

    if (imageFile.buffer) {
      const newImage = await uploadToCloudinary(imageFile.buffer);
      uploadedImages.push(newImage);
    }
  }

  // Append new images, cap to 3
  gig.images = [...currentImages, ...uploadedImages].slice(0, 3);
}

// Handle PDF Upload/Replace/Remove
if (req.files?.gigPdf?.length > 0) {
  const pdfFile = req.files.gigPdf[0];

  // 1MB size limit
  if (pdfFile.size > 1 * 1024 * 1024) {
    return next(new ErrorHandler("PDF size exceeds 1MB limit", 400));
  }

  // Delete old PDF if exists
  const oldPdfPublicId = extractPublicId(gig.pdf);
  if (oldPdfPublicId) {
    await cloudinary.uploader.destroy(oldPdfPublicId, { resource_type: "raw" });
  }

  // Upload new PDF
  const newPdfUrl = await uploadToCloudinary(pdfFile.buffer, "gig_pdfs", "raw");
  gig.pdf = newPdfUrl;

} else if (req.body.removePdf === "true") {
  // Remove PDF if user explicitly removed it
  const oldPdfPublicId = extractPublicId(gig.pdf);
  if (oldPdfPublicId) {
    await cloudinary.uploader.destroy(oldPdfPublicId, { resource_type: "raw" });
  }
  gig.pdf = {
    url: "",
    public_id: "",
  };
}


    if (gigTitle !== undefined) gig.gigTitle = gigTitle;
    if (subcategorychild !== undefined) gig.subcategorychild = subcategorychild;
    if (offerPackages !== undefined) gig.offerPackages = offerPackages;
    if (category !== undefined) gig.category = category;
    if (subcategory !== undefined) gig.subcategory = subcategory;
    if (searchTag !== undefined) gig.searchTag = searchTag;
    if (positiveKeywords !== undefined) gig.positiveKeywords = JSON.parse(positiveKeywords);
    if (packages !== undefined) gig.packages = JSON.parse(packages);
    if (gigDescription !== undefined) gig.gigDescription = gigDescription;
    if (hourlyRate !== undefined) gig.hourlyRate = hourlyRate;
    if (videoIframes !== undefined) gig.videoIframes = JSON.parse(videoIframes);
    if (req.body.faqs !== undefined) gig.faqs = JSON.parse(req.body.faqs);
    // Set status to pending
    gig.status = "pending";
    await gig.save();

    const user = await User.findById(gig.userId);
    const adminEmail = process.env.ADMIN_EMAIL;
    
    const adminHtml = `
      <h2>🔄 Gig Updated & Pending Review</h2>
      <p><strong>Gig Title:</strong> ${gig.gigTitle}</p>
      <p><strong>User:</strong> ${user?.firstName} ${user?.lastName} (${user?.email})</p>
      <p><strong>Description:</strong><br>${gig.gigDescription}</p>
      <p><strong>Hourly Rate:</strong> $${gig.hourlyRate}</p>
      <br/>
      <div>
       <a href="https://backend-service-marketplace.vercel.app/api/gigs/status/approve/${gig._id}" 
   style="background-color:#28a745;color:#fff;padding:10px 15px;text-decoration:none;margin-right:10px;border-radius:5px;">
   Approve
</a>

<a href="https://backend-service-marketplace.vercel.app/api/gigs/status/reject/${gig._id}" 
   style="background-color:#dc3545;color:#fff;padding:10px 15px;text-decoration:none;border-radius:5px;">
   Reject
</a>
 </div>
    `;

    await transporter.sendMail({
      from: `"Gig Platform" <${adminEmail}>`,
      to: 'wajih786hassan@gmail.com',
      subject: "🔔 A gig has been updated - Review Required",
      html: generateEmailTemplate({
        firstName: "Admin",
        subject: "A gig was updated and is awaiting approval",
        content: adminHtml,
      }),
    });

    // Notify the user
    if (user?.email) {
      const userHtml = `
        <p>Hi ${user.firstName},</p>
        <p>Your gig "<strong>${gig.gigTitle}</strong>" has been updated and is now pending approval.</p>
        <p>You’ll receive another email once it’s approved or rejected by the admin.</p>
      `;

      await transporter.sendMail({
        from: `"Gig Platform" <${adminEmail}>`,
        to: user.email,
        subject: "🕒 Your gig is pending approval",
        html: generateEmailTemplate({
          firstName: user.firstName,
          subject: "Your gig update is under review",
          content: userHtml,
        }),
      });
    }
await Notification.create({
  user: gig.userId,
  title: "Gig Updated",
  description: `Your gig titled "${gig.gigTitle}" was updated and is pending approval.`,
  type: "gig",
  targetRole: "seller",
  link: "http://dotask-service-marketplace.vercel.app/seller/services",
});

    res.status(200).json({
      success: true,
      message: "Gig updated successfully. Now pending approval.",
      gig,
    });
  } catch (error) {
    console.error("❌ Error in updateGig:", error);
    next(error);
  }
};

// 🔧 Helper to extract Cloudinary public_id from a URL
function extractPublicId(url) {
  try {
    const parts = url.split("/");
    const fileWithExt = parts[parts.length - 1];
    const publicId = fileWithExt.substring(0, fileWithExt.lastIndexOf(".")); // Remove extension
    const folderPath = parts.slice(parts.length - 2, parts.length - 1)[0]; // e.g., gig_images
    return `${folderPath}/${publicId}`;
  } catch {
    return null;
  }
}


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
    const gigs = await Gig.find().populate('userId');

    res.status(200).json({
      success: true,
      gigs,
    });
  } catch (error) {
    console.error("❌ Error in getAllGigs:", error);
    next(error);
  }
};


export const getAllActiveGigs = async (req, res, next) => {
  try {
    const gigs = await Gig.find({ status: "active" });

    res.status(200).json({
      success: true,
      gigs,
    });
  } catch (error) {
    console.error("❌ Error in getAllActiveGigs:", error);
    next(error);
  }
};

export const getAllPendingGigs = async (req, res, next) => {
  try {
    const gigs = await Gig.find({ status: "pending" });

    res.status(200).json({
      success: true,
      gigs,
    });
  } catch (error) {
    console.error("❌ Error in getAllPendingGigs:", error);
    next(error);
  }
};

export const getAllRejectedGigs = async (req, res, next) => {
  try {
    const gigs = await Gig.find({ status: "rejected" });

    res.status(200).json({
      success: true,
      gigs,
    });
  } catch (error) {
    console.error("❌ Error in getAllRejectedGigs:", error);
    next(error);
  }
};

function renderHtml(message, type = "info") {
  const color = type === "success" ? "#28a745" : type === "danger" ? "#dc3545" : "#007bff";
  return `
    <div style="font-family:Arial;padding:20px;">
      <p style="padding:10px 15px;border-radius:5px;background-color:${color};color:white;">
        ${message}
      </p>
    </div>
  `;
}


export const changeGigStatus = async (req, res, next) => {
  try {
    const { action, id } = req.params;
    const validStatuses = ["active", "pending", "rejected"];
    const statusMap = {
      approve: "active",
      reject: "rejected",
      pending: "pending",
    };

    const status = statusMap[action];
    if (!status) {
      return res.status(400).send(renderHtml("Invalid action provided", "danger"));
    }

    const gig = await Gig.findById(id);
    if (!gig) {
      return res.status(404).send(renderHtml("Gig not found", "danger"));
    }

    gig.status = status;
    await gig.save();

    const user = await User.findById(gig.userId);
    if (user?.email) {
      const subject =
        status === "active"
          ? "Your Gig Has Been Approved!"
          : status === "rejected"
          ? "Your Gig Has Been Rejected"
          : "Your Gig Status Has Been Updated";

      const content =
        status === "active"
          ? `<p>Congratulations <strong>${user.firstName}</strong>! 🎉</p>
             <p>Your gig titled <strong>${gig.gigTitle}</strong> has been <span style="color:green;"><strong>approved</strong></span>.</p>`
          : status === "rejected"
          ? `<p>Dear <strong>${user.firstName}</strong>,</p>
             <p>Your gig titled <strong>${gig.gigTitle}</strong> was <span style="color:red;"><strong>rejected</strong></span>.</p>`
          : `<p>Dear <strong>${user.firstName}</strong>,</p>
             <p>The status of your gig titled <strong>${gig.gigTitle}</strong> has been updated to: <strong>${status}</strong>.</p>`;

      const html = generateEmailTemplate({
        firstName: user.firstName,
        subject,
        content,
      });

    transporter.sendMail({
  from: `"Service Marketplace" <${process.env.ADMIN_EMAIL}>`,
  to: user.email,
  subject,
  html,
}).catch(err => {
  console.error("❌ Email sending failed:", err);
});

    }

    const message =
      status === "active"
        ? "Gig approved successfully!"
        : status === "rejected"
        ? "Gig rejected successfully."
        : "Gig status set to pending.";

        await Notification.create({
  user: gig.userId,
  title:
    status === "active"
      ? "Gig Approved"
      : status === "rejected"
      ? "Gig Rejected"
      : "Gig Status Updated",
  description:
    status === "active"
      ? `Your gig "${gig.gigTitle}" was approved and is now live.`
      : status === "rejected"
      ? `Your gig "${gig.gigTitle}" was rejected by the admin.`
      : `Status of your gig "${gig.gigTitle}" was updated to "${status}".`,
  type: "gig",
  targetRole: "seller",
  link:
    status === "rejected"
      ? ""
      : "http://dotask-service-marketplace.vercel.app/seller/services",
});


    return res.status(200).send(renderHtml(message, "success"));
  } catch (error) {
    console.error("❌ Error in changeGigStatus:", error);
    return res.status(500).send(renderHtml("Internal server error", "danger"));
  }
};


export const getGigById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const gig = await Gig.findById(id).populate("userId").lean();
    if (!gig) {
      return res.status(404).json({
        success: false,
        message: "Gig not found",
      });
    }

    const sellerId = gig.userId._id.toString();

    // Fetch orders involving the seller
    const sellerOrders = await Order.find({ sellerId })
      .select("buyerId sellerId buyerReview sellerReview totalAmount status createdAt updatedAt")
      .populate("buyerId", "firstName lastName email profileUrl country")
      .lean();

    // Analytics computation
    let activeOrdersCount = 0;
    let sellerTotalValue = 0;
    let sellerCompletedCount = 0;
    let sellerWorkInProgress = 0;
    let sellerInReview = 0;
    let lastDelivery = null;
    const sellerReviews = [];

    for (const order of sellerOrders) {
      sellerTotalValue += order.totalAmount || 0;

      if (["pending", "in progress", "delivered"].includes(order.status)) {
        activeOrdersCount++;
      }

      if (order.status === "completed") {
        sellerCompletedCount++;
        const completedAt = new Date(order.updatedAt || order.createdAt);
        if (!lastDelivery || completedAt > lastDelivery) {
          lastDelivery = completedAt;
        }
      }

      if (["pending", "in progress"].includes(order.status)) {
        sellerWorkInProgress += order.totalAmount || 0;
      } else if (order.status === "delivered") {
        sellerInReview += order.totalAmount || 0;
      }

      if (order.sellerReview?.review) {
        sellerReviews.push({
          ...order.sellerReview,
          timeAgo: timeAgo(order.sellerReview.createdAt),
          reviewedGigBuyer: {
            _id: order.buyerId._id,
            firstName: order.buyerId.firstName,
            lastName: order.buyerId.lastName,
            email: order.buyerId.email,
            profileUrl: order.buyerId.profileUrl || null,
            country: order.buyerId.country || null,
          },
        });
      }
    }

    // Analytics object
    const sellerAnalytics = {
      activeOrdersCount,
      totalOrderValue: `$${sellerTotalValue}`,
      ordersCompletedCount: sellerCompletedCount,
      notificationsCount: 0,
      workInProgress: sellerWorkInProgress,
      inReview: sellerInReview,
      lastDelivery,
    };

    // Fetch buyer reviews for this gig
    const buyerReviewOrders = await Order.find({
      sellerId: gig.userId,
      "buyerReview.review": { $exists: true, $ne: "" },
    }).populate("buyerId", "firstName lastName email profileUrl country");

    const buyerReviews = buyerReviewOrders.map((order) => ({
      ...order.buyerReview,
      timeAgo: timeAgo(order.buyerReview.createdAt),
      reviewedByBuyer: {
        _id: order.buyerId._id,
        firstName: order.buyerId.firstName,
        lastName: order.buyerId.lastName,
        email: order.buyerId.email,
        profileUrl: order.buyerId.profileUrl || null,
        country: order.buyerId.country || null,
      },
    }));

    // Clients of this seller
    const clients = await Client.find({ user: sellerId }).select("name country profileUrl workMonth workYear description createdAt");

    res.status(200).json({
      success: true,
      gig,
      buyerReviews,
      sellerReviews,
      sellerAnalytics,
      clients,
    });
  } catch (error) {
    console.error("❌ Error in getGigById:", error);
    next(error);
  }
};
