import streamifier from "streamifier";
import { Gig } from "../models/gigs.js";
import ErrorHandler from "../middlewares/error.js";
import { v4 as uuidv4 } from "uuid";
import cloudinary from "../utils/cloudinary.js";
import { User } from "../models/user.js"; // Make sure this is already at the top
import { Order } from "../models/orders.js";
import { formatDistanceToNow } from 'date-fns'; // Make sure date-fns is installed
import { transporter } from "../utils/mailer.js";
import generateEmailTemplate from "../utils/emailTemplate.js";
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

const userId = req.user._id;

 if (req.body.isDraft !== "true") {
    if (!userId || !gigTitle || !category || !subcategory || !subcategorychild || !gigDescription || !packages) {
  const missingFields = [];
  if (!userId) missingFields.push("userId");
  if (!gigTitle) missingFields.push("gigTitle");
  if (!category) missingFields.push("category");
  if (!subcategory) missingFields.push("subcategory");
  if (!subcategorychild) missingFields.push("subcategorychild");
  if (!gigDescription) missingFields.push("gigDescription");
  if (!packages) missingFields.push("packages");

  return next(
    new ErrorHandler(
      `Missing required fields: ${missingFields.join(", ")}`,
      400
    )
  );
}
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
      status: req.body.isDraft === "true" ? "draft" : "pending",
    });

    // ✅ Fetch user from DB using userId
    const user = await User.findById(userId);

// ✅ Notify user based on draft or publish
if (user?.email) {
  if (req.body.isDraft === "true") {
    // Draft confirmation email
    const draftHtml = generateEmailTemplate({
      firstName: user.firstName,
      subject: "Gig Saved as Draft",
      content: `
        <h2>Your gig is saved as draft, ${user.firstName}!</h2>
        <p>Your gig titled <strong>${gigTitle}</strong> has been saved as a draft.</p>
        <p>You can continue editing and publish it whenever you’re ready.</p>
      `,
    });

    await transporter.sendMail({
      from: `"Service Marketplace" <${process.env.ADMIN_EMAIL}>`,
      to: user.email,
      subject: "Your Gig is Saved as Draft",
      html: draftHtml,
    });
  } else {
    // Under review email
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
}

      if (req.body.isDraft !== "true") {
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
               <div style="margin-top:20px;display:flex;gap:8px;flex-wrap:wrap;">
  <a href="https://backend-service-marketplace.vercel.app/api/gigs/status/approve/${newGig._id}" 
     style="background-color:#28a745;color:#fff;padding:8px 12px;font-size:14px;font-weight:600;
     text-decoration:none;border-radius:6px;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
    Approve
  </a>

  <a href="https://backend-service-marketplace.vercel.app/api/gigs/status/reject/${newGig._id}" 
     style="background-color:#dc3545;color:#fff;padding:8px 12px;font-size:14px;font-weight:600;
     text-decoration:none;border-radius:6px;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
    Reject
  </a>

  <a href="https://dotask-service-marketplace.vercel.app/admin/manageservices" 
     style="background-color:#ffc107;color:#000;padding:8px 12px;font-size:14px;font-weight:600;
     text-decoration:none;border-radius:6px;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
   requiresmodification
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
   }
 await Notification.create({
      user: userId,
      title: req.body.isDraft === "true" ? "Gig Saved as Draft" : "Gig Submitted",
      description:
        req.body.isDraft === "true"
          ? `Your gig titled "${gigTitle}" was saved as draft.`
          : `Your gig titled "${gigTitle}" was submitted and is under review.`,
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

    // ✅ Validate required fields if not a draft
    if (req.body.isDraft !== "true") {
      const {
        gigTitle,
        category,
        subcategory,
        subcategorychild,
        packages,
        gigDescription,
      } = req.body;

      const missingFields = [];
      if (!gigTitle) missingFields.push("gigTitle");
      if (!category) missingFields.push("category");
      if (!subcategory) missingFields.push("subcategory");
      if (!subcategorychild) missingFields.push("subcategorychild");
      if (!packages) missingFields.push("packages");
      if (!gigDescription) missingFields.push("gigDescription");

      if (missingFields.length > 0) {
        return next(
          new ErrorHandler(
            `Missing required fields: ${missingFields.join(", ")}`,
            400
          )
        );
      }
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
    
    
if (req.body.imagesToRemove) {
  const toRemove = JSON.parse(req.body.imagesToRemove); 
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
    gig.status = req.body.isDraft === "true" ? "draft" : "pending";
    await gig.save();


    const user = await User.findById(gig.userId);
    const adminEmail = process.env.ADMIN_EMAIL;
      if (req.body.isDraft !== "true") {
   const adminHtml = `
  <h2>Gig Updated & Pending Review</h2>
  <p><strong>Gig Title:</strong> ${gig.gigTitle}</p>
  <p><strong>User:</strong> ${user?.firstName} ${user?.lastName} (${user?.email})</p>
  <p><strong>Description:</strong><br>${gig.gigDescription}</p>
  <p><strong>Hourly Rate:</strong> $${gig.hourlyRate}</p>
  <br/>
  <div style="margin-top:20px;display:flex;gap:12px; justify-content:center; align-items:center;">
    <a href="https://backend-service-marketplace.vercel.app/api/gigs/status/approve/${gig._id}" 
       style="background-color:#28a745;color:#fff;padding:7px 12px;font-size:12px;font-weight:500;
       text-decoration:none;border-radius:6px;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
      Approve
    </a>

    <a href="https://backend-service-marketplace.vercel.app/api/gigs/status/reject/${gig._id}" 
       style="background-color:#dc3545;color:#fff;padding:7px 12px;font-size:12px;font-weight:500;
       text-decoration:none;border-radius:6px;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
      Reject
    </a>

    <a href="https://dotask-service-marketplace.vercel.app/admin/manageservices" 
       style="background-color:#ffc107;color:#000;padding:7px 12px;font-size:12px;font-weight:500;
       text-decoration:none;border-radius:6px;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
      requiresmodification
    </a>
  </div>
`;


    await transporter.sendMail({
      from: `"Gig Platform" <${adminEmail}>`,
      to: 'wajih786hassan@gmail.com',
      subject: "A gig has been updated - Review Required",
      html: generateEmailTemplate({
        firstName: "Admin",
        subject: "A gig was updated and is awaiting approval",
        content: adminHtml,
      }),
    });
}
 if (user?.email) {
      const userHtml =
        req.body.isDraft === "true"
          ? `
            <p>Hi ${user.firstName},</p>
            <p>Your gig "<strong>${gig.gigTitle}</strong>" has been saved as draft successfully.</p>
          `
          : `
            <p>Hi ${user.firstName},</p>
            <p>Your gig "<strong>${gig.gigTitle}</strong>" has been updated and is now pending approval.</p>
            <p>You’ll receive another email once it’s approved or rejected by the admin.</p>
          `;

      await transporter.sendMail({
        from: `"Gig Platform" <${adminEmail}>`,
        to: user.email,
        subject:
          req.body.isDraft === "true"
            ? "💾 Your gig was saved as draft"
            : "🕒 Your gig is pending approval",
        html: generateEmailTemplate({
          firstName: user.firstName,
          subject:
            req.body.isDraft === "true"
              ? "Gig Saved as Draft"
              : "Your gig update is under review",
          content: userHtml,
        }),
      });
    }

    await Notification.create({
      user: gig.userId,
      title: req.body.isDraft === "true" ? "Gig Saved as Draft" : "Gig Updated",
      description:
        req.body.isDraft === "true"
          ? `Your gig titled "${gig.gigTitle}" was saved as draft.`
          : `Your gig titled "${gig.gigTitle}" was updated and is pending approval.`,
      type: "gig",
      targetRole: "seller",
      link: "http://dotask-service-marketplace.vercel.app/seller/services",
    });

    res.status(200).json({
      success: true,
      message:
        req.body.isDraft === "true"
          ? "Gig saved as draft successfully."
          : "Gig updated successfully. Now pending approval.",
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
    const { reason } = req.body; // Only used if requiresmodification
    const statusMap = {
      approve: "active",
      reject: "rejected",
      pending: "pending",
      requiresmodification: "requiresmodification",
    };

    const status = statusMap[action];
    if (!status) {
      return res.status(400).send(renderHtml("Invalid action provided", "danger"));
    }

    const gig = await Gig.findById(id);
    if (!gig) {
      return res.status(404).send(renderHtml("Gig not found", "danger"));
    }

    // ✅ If requiresmodification, ensure reason provided
    if (status === "requiresmodification") {
  const { modifications } = req.body; // [{ field: "title", reason: "Too vague" }, ...]

  if (!modifications || !Array.isArray(modifications) || modifications.length === 0) {
    return res
      .status(400)
      .send(renderHtml("At least one modification request is required", "danger"));
  }
gig.modificationRequests = [];
  modifications.forEach(mod => {
    if (mod.field && mod.reason) {
      gig.modificationRequests.push({
        field: mod.field,
        reason: mod.reason.trim(),
      });
    }
  });
}


    gig.status = status;
    await gig.save();

    const user = await User.findById(gig.userId);
    if (user?.email) {
      let subject = "";
      let content = "";

      if (status === "active") {
        subject = "Your Gig Has Been Approved!";
        content = `<p>Congratulations <strong>${user.firstName}</strong>! 🎉</p>
                   <p>Your gig titled <strong>${gig.gigTitle}</strong> has been <span style="color:green;"><strong>approved</strong></span>.</p>`;
      } else if (status === "rejected") {
        subject = "Your Gig Has Been Rejected";
        content = `<p>Dear <strong>${user.firstName}</strong>,</p>
                   <p>Your gig titled <strong>${gig.gigTitle}</strong> was <span style="color:red;"><strong>rejected</strong></span>.</p>`;
      } else if (status === "requiresmodification") {
  subject = "Your Gig requiresmodification";
  const reasonsHtml = gig.modificationRequests
    .map(req => `<li><strong>${req.field}:</strong> ${req.reason}</li>`)
    .join("");

  content = `<p>Dear <strong>${user.firstName}</strong>,</p>
             <p>Your gig titled <strong>${gig.gigTitle}</strong> requiresmodification.</p>
             <ul>${reasonsHtml}</ul>`;
}  else {
        subject = "Your Gig Status Has Been Updated";
        content = `<p>Dear <strong>${user.firstName}</strong>,</p>
                   <p>The status of your gig titled <strong>${gig.gigTitle}</strong> has been updated to: <strong>${status}</strong>.</p>`;
      }

      const html = generateEmailTemplate({
        firstName: user.firstName,
        subject,
        content,
      });

      transporter
        .sendMail({
          from: `"Service Marketplace" <${process.env.ADMIN_EMAIL}>`,
          to: user.email,
          subject,
          html,
        })
        .catch((err) => {
          console.error("❌ Email sending failed:", err);
        });
    }

    let message = "";
    if (status === "active") message = "Gig approved successfully!";
    else if (status === "rejected") message = "Gig rejected successfully.";
    else if (status === "requiresmodification") message = "Gig marked as requiring modification.";
    else message = "Gig status set to pending.";

    await Notification.create({
      user: gig.userId,
      title:
        status === "active"
          ? "Gig Approved"
          : status === "rejected"
          ? "Gig Rejected"
          : status === "requiresmodification"
          ? "Gig requiresmodification"
          : "Gig Status Updated",
      description:
        status === "active"
          ? `Your gig "${gig.gigTitle}" was approved and is now live.`
          : status === "rejected"
          ? `Your gig "${gig.gigTitle}" was rejected by the admin.`
         : status === "requiresmodification"
? `Your gig "${gig.gigTitle}" requiresmodification. Fields: ${gig.modificationRequests.map(r => r.field).join(", ")}`

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
    const { onlyActiveGigs, email } = req.query;
    const gig = await Gig.findById(id).populate("userId").lean();
    if (!gig) {
      return res.status(404).json({
        success: false,
        message: "Gig not found",
      });

    }
    
   if (
      onlyActiveGigs === "true" &&
      ["draft", "pause","pending","rejected","requiresmodification"].includes(gig.status) &&
      email !== gig.userId?.email && email !== "contact@dotask.io"
    ) {
      console.warn("⚠️ Gig blocked due to status:", gig.status);
      return res.status(403).json({
        success: false,
        message: `Gig is in ${gig.status} state`,
      });
    }  const sellerId = gig.userId._id.toString();

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



export const pauseGig = async (req, res, next) => {
  try {
    const { id } = req.params;

    const gig = await Gig.findById(id);
    if (!gig) return next(new ErrorHandler("Gig not found", 404));

    // Ensure user owns the gig
    if (req.user._id.toString() !== gig.userId.toString()) {
      return next(new ErrorHandler("Unauthorized", 401));
    }

    // Only active gigs can be paused
    if (gig.status !== "active") {
      return next(new ErrorHandler("Only active gigs can be paused", 400));
    }

    gig.status = "pause";
    await gig.save();

    await Notification.create({
      user: gig.userId,
      title: "Gig Paused",
      description: `Your gig titled "${gig.gigTitle}" has been paused successfully.`,
      type: "gig",
      targetRole: "seller",
      link: "http://dotask-service-marketplace.vercel.app/seller/services",
    });

    const user = await User.findById(gig.userId);
    const adminEmail = process.env.ADMIN_EMAIL;

    if (user?.email) {
      const userHtml = `
        <p>Hi ${user.firstName},</p>
        <p>Your gig "<strong>${gig.gigTitle}</strong>" has been paused successfully.</p>
        <p>You can unpause it anytime from your seller dashboard.</p>
      `;

      await transporter.sendMail({
        from: `"Gig Platform" <${adminEmail}>`,
        to: user.email,
        subject: "⏸️ Your gig has been paused",
        html: generateEmailTemplate({
          firstName: user.firstName,
          subject: "Gig Paused",
          content: userHtml,
        }),
      });
    }


    res.status(200).json({
      success: true,
      message: "Gig has been paused successfully.",
      gig,
    });
  } catch (error) {
    console.error("❌ Error in pauseGig:", error);
    next(error);
  }
};


export const unpauseGig = async (req, res, next) => {
  try {
    const { id } = req.params;

    const gig = await Gig.findById(id);
    if (!gig) return next(new ErrorHandler("Gig not found", 404));

    // Ensure user owns the gig
    if (req.user._id.toString() !== gig.userId.toString()) {
      return next(new ErrorHandler("Unauthorized", 401));
    }

    // Only paused gigs can be unpaused
    if (gig.status !== "pause") {
      return next(new ErrorHandler("Only paused gigs can be unpaused", 400));
    }

    gig.status = "active";
    await gig.save();

    await Notification.create({
      user: gig.userId,
      title: "Gig Reactivated",
      description: `Your gig titled "${gig.gigTitle}" has been reactivated and is live again.`,
      type: "gig",
      targetRole: "seller",
      link: "http://dotask-service-marketplace.vercel.app/seller/services",
    });
    const user = await User.findById(gig.userId);
    const adminEmail = process.env.ADMIN_EMAIL;

    if (user?.email) {
      const userHtml = `
        <p>Hi ${user.firstName},</p>
        <p>Your gig "<strong>${gig.gigTitle}</strong>" has been reactivated and is now live again.</p>
        <p>Good luck with your upcoming orders!</p>
      `;

      await transporter.sendMail({
        from: `"Gig Platform" <${adminEmail}>`,
        to: user.email,
        subject: "✅ Your gig is live again",
        html: generateEmailTemplate({
          firstName: user.firstName,
          subject: "Gig Reactivated",
          content: userHtml,
        }),
      });
    }

    res.status(200).json({
      success: true,
      message: "Gig has been unpaused successfully.",
      gig,
    });
  } catch (error) {
    console.error("❌ Error in unpauseGig:", error);
    next(error);
  }
};
