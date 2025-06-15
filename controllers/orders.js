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
      .populate("sellerId", "firstName lastName email")
      .populate("coworkers.sellerId", "firstName lastName email profileUrl _id");

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



export const approveFinalDelivery = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return next(new ErrorHandler("Order ID is required", 400));
    }

    const order = await Order.findById(orderId)
      .populate("sellerId")
      .populate("gigId");

    if (!order) {
      return next(new ErrorHandler("Order not found", 404));
    }

    // Mark order as completed
    order.status = "completed";
    await order.save();

    // Notify Seller
    const seller = order.sellerId;
    if (seller?.email) {
      const html = generateEmailTemplate({
        firstName: seller.firstName,
        subject: "Your Order Has Been Approved",
        content: `
          <p>Hi ${seller.firstName},</p>
          <p>The buyer has approved your final delivery for <strong>${order.gigId.gigTitle}</strong>.</p>
          <p>The order has now been marked as <strong>completed</strong>.</p>
        `,
      });

      await transporter.sendMail({
        from: `"Marketplace" <${process.env.ADMIN_EMAIL}>`,
        to: seller.email,
        subject: "Order Completed",
        html,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Final delivery approved. Order marked as completed.",
      order,
    });

  } catch (error) {
    console.error("❌ Error in approveFinalDelivery:", error);
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

    // Validate all ratings
    if (
      !overallRating ||
      overallRating < 1 || overallRating > 5 ||
      !communicationLevel ||
      communicationLevel < 1 || communicationLevel > 5 ||
      !serviceAsDescribed ||
      serviceAsDescribed < 1 || serviceAsDescribed > 5 ||
      !recommendToFriend ||
      recommendToFriend < 1 || recommendToFriend > 5
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
      recommendToFriend, // store number as-is now
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





// PATCH /api/orders/:orderId/invite-coworkers
export const inviteCoworkersToOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { coworkers } = req.body;

    if (!Array.isArray(coworkers) || coworkers.length === 0) {
      return next(new ErrorHandler("At least one coworker must be provided.", 400));
    }

    const order = await Order.findById(orderId).populate("buyerId sellerId gigId");
    if (!order) return next(new ErrorHandler("Order not found", 404));

    for (const coworker of coworkers) {
      const { sellerId, priceType, rate, maxHours } = coworker;

      if (!sellerId || !["hourly", "fixed"].includes(priceType) || typeof rate !== "number") {
        return next(new ErrorHandler("Invalid coworker data format.", 400));
      }

      if (priceType === "hourly" && (typeof maxHours !== "number" || maxHours <= 0)) {
        return next(new ErrorHandler("Hourly coworker must have a valid maxHours.", 400));
      }

      const user = await User.findById(sellerId);
      if (!user || !user.role.includes("seller")) {
        return next(new ErrorHandler(`Seller with ID ${sellerId} not found or invalid.`, 404));
      }

      // Add to order
      order.coworkers.push({
        sellerId,
        priceType,
        rate,
        maxHours: priceType === "hourly" ? maxHours : undefined,
        status: "pending",
      });

      if (user.email) {
        const acceptUrl = `https://backend-service-marketplace.vercel.app/api/orders/response-to-cowork-action/${order._id}/coworker-response?sellerId=${sellerId}&action=accept`;
        const rejectUrl = `https://backend-service-marketplace.vercel.app/api/orders/response-to-cowork-action/${order._id}/coworker-response?sellerId=${sellerId}&action=reject`;

        const html = generateEmailTemplate({
          firstName: user.firstName,
          subject: "You've Been Invited to Collaborate on an Order",
          content: `
            <p>Hello ${user.firstName},</p>
            <p>You’ve been invited by <strong>${order.sellerId.firstName}</strong> to collaborate on the order for <strong>${order.gigId.gigTitle}</strong>.</p>
            <p><strong>Compensation:</strong> ${
              priceType === "hourly" 
              ? `$${rate}/hr for up to ${maxHours} hour(s)` 
              : `$${rate} (fixed)`
            }</p>
            <p>Please respond to this invitation:</p>
            <div>
              <a href="${acceptUrl}" style="background:#22c55e;color:#fff;padding:10px 16px;text-decoration:none;border-radius:6px;margin-right:10px;">
                Accept
              </a>
              <a href="${rejectUrl}" style="background:#ef4444;color:#fff;padding:10px 16px;text-decoration:none;border-radius:6px;">
                Reject
              </a>
            </div>
          `,
        });

        await transporter.sendMail({
          from: `"Marketplace" <${process.env.ADMIN_EMAIL}>`,
          to: user.email,
          subject: "Coworker Invitation",
          html,
        });
      }
    }

    await order.save();

    res.status(200).json({
      success: true,
      message: "Coworker(s) invited successfully.",
      order,
    });

  } catch (error) {
    console.error("❌ Error inviting coworkers:", error);
    next(error);
  }
};


export const handleCoworkerResponse = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { sellerId, action } = req.query;

    if (!["accept", "reject"].includes(action)) {
      return next(new ErrorHandler("Invalid action", 400));
    }

    const order = await Order.findById(orderId).populate("buyerId sellerId gigId");
    if (!order) return next(new ErrorHandler("Order not found", 404));

    const coworker = order.coworkers.find(
      (c) => c.sellerId.toString() === sellerId
    );

    if (!coworker) {
      return next(new ErrorHandler("Coworker not found in this order", 404));
    }

    // Only allow update if status is still "pending"
    if (coworker.status !== "pending") {
      return res.redirect("https://dotask-service-marketplace.vercel.app/login");
    }

    // Update status
    coworker.status = action === "accept" ? "accepted" : "rejected";
    await order.save();

    // Notify main seller
    const coworkerUser = await User.findById(sellerId);
    const mainSeller = order.sellerId;

    if (mainSeller?.email) {
      const html = generateEmailTemplate({
        firstName: mainSeller.firstName,
        subject: "Coworker Response Notification",
        content: `
          <p>Hello ${mainSeller.firstName},</p>
          <p><strong>${coworkerUser?.firstName}</strong> has <strong style="text-transform:uppercase;">${action}ED</strong> your invitation to collaborate on the order for <strong>${order.gigId?.gigTitle}</strong>.</p>
          <p>This was part of your order with the buyer <strong>${order.buyerId?.firstName}</strong>.</p>
          <p>You may take further actions from your dashboard as needed.</p>
        `,
      });

      await transporter.sendMail({
        from: `"Marketplace" <${process.env.ADMIN_EMAIL}>`,
        to: mainSeller.email,
        subject: `Coworker ${action === "accept" ? "Accepted" : "Rejected"} the Invitation`,
        html,
      });
    }

    // Redirect to login
    return res.redirect("https://dotask-service-marketplace.vercel.app/login");

  } catch (error) {
    console.error("❌ Coworker response error:", error);
    next(error);
  }
};
