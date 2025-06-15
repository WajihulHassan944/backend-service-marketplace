import { Gig } from "../models/gigs.js";
import { User } from "../models/user.js";
import { Order } from "../models/orders.js";
import ErrorHandler from "../middlewares/error.js";
import { transporter } from "../utils/mailer.js";
import generateEmailTemplate from "../utils/emailTemplate.js";
import streamifier from "streamifier";
import cloudinary from "../utils/cloudinary.js";

// Helper to upload any type of file to Cloudinary
const uploadToCloudinary = (buffer, originalName = "file") => {
  return new Promise((resolve, reject) => {
    const fileType = originalName.split('.').pop().toLowerCase();
    let resource_type = "auto"; // handles image, pdf, zip, docx, etc.

    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "order_files",
        resource_type,
        use_filename: true,
        unique_filename: true,
        overwrite: false,
      },
      (error, result) => {
        if (result) {
          console.log("✅ Uploaded file:", result.secure_url);
          resolve({
            url: result.secure_url,
            public_id: result.public_id,
          });
        } else {
          console.error("❌ Cloudinary file upload error:", error);
          reject(error);
        }
      }
    );

    streamifier.createReadStream(buffer).pipe(stream);
  });
};

// POST /api/orders
export const createOrder = async (req, res, next) => {
  try {
    const { gigId, buyerId, sellerId, packageType, requirements, totalAmount } = req.body;

    if (!gigId || !buyerId || !sellerId || !packageType || !requirements || !totalAmount) {
      return next(new ErrorHandler("Missing required fields", 400));
    }

    // Fetch gig
    const gig = await Gig.findById(gigId);
    if (!gig) return next(new ErrorHandler("Gig not found", 404));

     if (gig.userId.toString() !== sellerId) {
      return next(new ErrorHandler("Seller ID does not match the gig's owner", 403));
    }

    const selectedPackage = gig.packages[packageType];
    if (!selectedPackage) return next(new ErrorHandler("Invalid package type", 400));

    // Fetch users
    const buyer = await User.findById(buyerId);
    const seller = await User.findById(sellerId);
    if (!buyer || !seller) {
      return next(new ErrorHandler("Buyer or seller not found", 404));
    }

    // Handle file upload (optional, 1 file max)
    let uploadedFiles = [];
    if (req.file && req.file.buffer) {
      try {
        const fileResult = await uploadToCloudinary(req.file.buffer, req.file.originalname);
        uploadedFiles.push(fileResult);
      } catch (uploadErr) {
        return next(new ErrorHandler("File upload failed", 500));
      }
    }

    const order = await Order.create({
      gigId,
      buyerId,
      sellerId,
      packageType,
      packageDetails: {
        packageName: selectedPackage.packageName,
        description: selectedPackage.description,
        price: selectedPackage.price,
        deliveryTime: selectedPackage.deliveryTime,
        revisions: selectedPackage.revisions,
        numberOfPages: selectedPackage.numberOfPages,
        afterProjectSupport: selectedPackage.afterProjectSupport,
      },
      requirements,
      totalAmount,
      files: uploadedFiles,
      isPaid: true, // Adjust this if integrating payment gateway
      paidAt: new Date(),
    });

    // Notify Buyer
    if (buyer?.email) {
      const html = generateEmailTemplate({
        firstName: buyer.firstName,
        subject: "Order Placed Successfully",
        content: `
          <p>Hi ${buyer.firstName},</p>
          <p>Your order for <strong>${gig.gigTitle}</strong> (${packageType} package) has been placed successfully.</p>
          <p>We’ve notified the seller <strong>${seller.firstName}</strong> and work should begin shortly.</p>
        `,
      });

      await transporter.sendMail({
        from: `"Marketplace" <${process.env.ADMIN_EMAIL}>`,
        to: buyer.email,
        subject: "Order Confirmation",
        html,
      });
    }

    // Notify Seller
    if (seller?.email) {
      const html = generateEmailTemplate({
        firstName: seller.firstName,
        subject: "New Order Received",
        content: `
          <p>Hello ${seller.firstName},</p>
          <p>You’ve received a new order for <strong>${gig.gigTitle}</strong> (${packageType} package).</p>
          <p>Please log in and start work as soon as possible.</p>
        `,
      });

      await transporter.sendMail({
        from: `"Marketplace" <${process.env.ADMIN_EMAIL}>`,
        to: seller.email,
        subject: "You've Got a New Order",
        html,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Order placed successfully.",
      order,
    });

  } catch (error) {
    console.error("❌ Error in createOrder:", error);
    next(error);
  }
};


export const getOrdersByUser = async (req, res, next) => {
  try {
    const { userId, role } = req.params; // ✅ Fix here

    if (!userId || !["buyer", "seller"].includes(role)) {
      return next(new ErrorHandler("Invalid or missing user ID or role", 400));
    }

    const filter = role === "buyer" ? { buyerId: userId } : { sellerId: userId };

    const orders = await Order.find(filter)
      .populate("gigId")
      .populate("buyerId", "firstName lastName email")
      .populate("sellerId", "firstName lastName email")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });

  } catch (error) {
    console.error("❌ Error in getOrdersByUser:", error);
    next(error);
  }
};

export const getAllOrders = async (req, res, next) => {
  try {
    const orders = await Order.find()
      .populate("gigId")
      .populate("buyerId", "firstName lastName email")
      .populate("sellerId", "firstName lastName email")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.error("❌ Error in getAllOrders:", error);
    next(error);
  }
};


export const getOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id)
      .populate("gigId")
      .populate("buyerId", "firstName lastName email")
      .populate("sellerId", "firstName lastName email");

    if (!order) {
      return next(new ErrorHandler("Order not found", 404));
    }

    res.status(200).json({
      success: true,
      order,
    });

  } catch (error) {
    console.error("❌ Error in getOrderById:", error);
    next(error);
  }
};




export const deleteOrder = async (req, res, next) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id);

    if (!order) {
      return next(new ErrorHandler("Order not found", 404));
    }

    // Delete associated files from Cloudinary
    if (order.files && order.files.length > 0) {
      for (const file of order.files) {
        if (file.public_id) {
          try {
            await cloudinary.uploader.destroy(file.public_id, {
              resource_type: "auto", // handles image, video, raw (zip/pdf/etc.)
            });
          } catch (cloudErr) {
            console.error(`⚠️ Cloudinary deletion failed for ${file.public_id}:`, cloudErr);
            // Continue even if one file fails to delete
          }
        }
      }
    }

    // Delete order from database
    await Order.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Order and associated files deleted successfully.",
    });

  } catch (error) {
    console.error("❌ Error in deleteOrder:", error);
    next(error);
  }
};







export const deliverOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { message } = req.body;

    if (!orderId || !message) {
      return next(new ErrorHandler("Order ID and message are required", 400));
    }

    const order = await Order.findById(orderId)
      .populate("buyerId")
      .populate("gigId");

    if (!order) {
      return next(new ErrorHandler("Order not found", 404));
    }

    let deliveryFiles = [];

    if (req.file) {
      console.log("📁 Received file from frontend:", req.file.originalname);
      const uploadResult = await uploadToCloudinary(req.file.buffer, req.file.originalname);
      deliveryFiles.push(uploadResult);
    }

    // ⬇️ Push new delivery object to the deliveries array
    order.deliveries = order.deliveries || [];
    order.deliveries.push({
      files: deliveryFiles,
      message,
      deliveredAt: new Date(),
    });

    order.status = "delivered";
    await order.save();

    // Notify Buyer
    const buyer = order.buyerId;
    if (buyer?.email) {
      const html = generateEmailTemplate({
        firstName: buyer.firstName,
        subject: "Your Order Has Been Delivered",
        content: `
          <p>Hi ${buyer.firstName},</p>
          <p>Your seller has delivered the order for <strong>${order.gigId.gigTitle}</strong>.</p>
          <p>Please log in to review and accept the delivery or request a revision.</p>
        `,
      });

      await transporter.sendMail({
        from: `"Marketplace" <${process.env.ADMIN_EMAIL}>`,
        to: buyer.email,
        subject: "Order Delivered",
        html,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Order delivered successfully.",
      order,
    });

  } catch (error) {
    console.error("❌ Error in deliverOrder:", error);
    next(error);
  }
};


// PATCH /api/orders/:orderId/buyer-review
export const addBuyerReview = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const {
      overallRating,
      communicationLevel,
      serviceAsDescribed,
      recommendToFriend,
      review,
    } = req.body;

    if (
      !overallRating ||
      overallRating < 1 ||
      overallRating > 5 ||
      !communicationLevel ||
      communicationLevel < 1 ||
      communicationLevel > 5 ||
      !serviceAsDescribed ||
      serviceAsDescribed < 1 ||
      serviceAsDescribed > 5
    ) {
      return next(new ErrorHandler("All ratings must be between 1 and 5", 400));
    }

    const order = await Order.findById(orderId);
    if (!order) return next(new ErrorHandler("Order not found", 404));

    if (order.status !== "completed") {
      return next(new ErrorHandler("Review can only be added after order is completed", 400));
    }

    if (order.buyerReview?.overallRating) {
      return next(new ErrorHandler("Buyer has already submitted a review", 400));
    }

    order.buyerReview = {
      overallRating,
      communicationLevel,
      serviceAsDescribed,
      recommendToFriend: !!recommendToFriend, // Ensure boolean
      review,
    };

    await order.save();

    res.status(200).json({
      success: true,
      message: "Buyer review submitted successfully.",
    });
  } catch (err) {
    next(err);
  }
};


// PATCH /api/orders/:orderId/seller-review
export const addSellerReview = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { rating, review } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return next(new ErrorHandler("Rating must be between 1 and 5", 400));
    }

    const order = await Order.findById(orderId);
    if (!order) return next(new ErrorHandler("Order not found", 404));

    if (order.status !== "completed") {
      return next(new ErrorHandler("Review can only be added after order is completed", 400));
    }

    if (order.sellerReview?.rating) {
      return next(new ErrorHandler("Seller has already submitted a review", 400));
    }

    order.sellerReview = { rating, review };
    await order.save();

    res.status(200).json({
      success: true,
      message: "Seller review submitted successfully.",
    });
  } catch (err) {
    next(err);
  }
};
