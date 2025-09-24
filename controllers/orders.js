import { Gig } from "../models/gigs.js";
import { User } from "../models/user.js";
import { Order } from "../models/orders.js";
import ErrorHandler from "../middlewares/error.js";
import { transporter } from "../utils/mailer.js";
import generateEmailTemplate from "../utils/emailTemplate.js";
import streamifier from "streamifier";
import cloudinary from "../utils/cloudinary.js";
import { Wallet } from "../models/wallet.js";
import stripe from "../utils/stripe.js";
import { Notification } from "../models/notification.js";
import mongoose from "mongoose";

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
   let gig;
  try {
   
   const { 
  gigId, 
  buyerId, 
  sellerId, 
  packageType, 
  requirements, 
  totalAmount, 
  paymentMethod, 
  customDescription, 
  customDeliveryTime ,
referrerId
} = req.body;
console.log(referrerId);

    if (!gigId || !buyerId || !sellerId || !packageType || !requirements || !totalAmount) {
      return next(new ErrorHandler("Missing required fields", 400));
    }

    // Fetch gig
    gig = await Gig.findById(gigId);
    if (!gig) return next(new ErrorHandler("Gig not found", 404));

    if (gig.userId.toString() !== sellerId) {
      return next(new ErrorHandler("Seller ID does not match the gig's owner", 403));
    }
 if (buyerId === sellerId) {
      return next(
        new ErrorHandler("You cannot purchase your own service.", 400)
      );
    }

 let selectedPackage;

if (packageType === 'custom') {
  if (!customDescription || !customDeliveryTime) {
    return next(new ErrorHandler("Missing custom offer details", 400));
  }

  selectedPackage = {
    packageName: 'Custom Offer',
    description: customDescription,
    price: totalAmount,
    deliveryTime: customDeliveryTime,
    revisions: 5
  };
} else {
  selectedPackage = gig.packages[packageType];
  if (!selectedPackage) return next(new ErrorHandler("Invalid package type", 400));
}


    // Fetch users
    const buyer = await User.findById(buyerId);
    const seller = await User.findById(sellerId);
    if (!buyer || !seller) {
      return next(new ErrorHandler("Buyer or seller not found", 404));
    }
 // 🔐 Fetch wallet
    const wallet = await Wallet.findOne({ userId: buyerId });
    if (!wallet) return next(new ErrorHandler("Wallet not found for buyer", 404));

    let stripeCharge = null;

    // 💳 Handle payment
    if (paymentMethod === 'balance') {
      if (wallet.balance < totalAmount) {
        await Notification.create({
    user: buyerId,
    title: "Payment Failed",
    description: `Wallet balance is insufficient to place order on "${gig.gigTitle}".`,
    type: "order",
    targetRole: "buyer",
  });

        return next(new ErrorHandler("Insufficient wallet balance", 402));
      }

      wallet.balance -= totalAmount;
      wallet.transactions.push({
        type: "debit",
        amount: totalAmount,
        description: `Payment for order on gig "${gig.gigTitle}"`,
      });

      await wallet.save();
    }
    else if (paymentMethod === 'card') {
  const primaryCard = wallet.cards.find(c => c.isPrimary);

  if (!primaryCard || !primaryCard.stripeCardId) {
    return next(new ErrorHandler("No primary card found for payment", 400));
  }

  // Create and confirm a PaymentIntent using the saved card
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(totalAmount * 100),
    currency: "usd",
    customer: wallet.stripeCustomerId,
    payment_method: primaryCard.stripeCardId, // ✅ Correct usage
    off_session: true,
    confirm: true,
    description: `Payment for gig: ${gig.gigTitle}`,
    metadata: {
      buyerId: buyerId,
      sellerId: sellerId,
      gigId: gigId,
      purpose: "gig_order",
    }
  });

  if (paymentIntent.status !== "succeeded") {
    await Notification.create({
    user: buyerId,
    title: "Payment Failed",
    description: `Your card payment for "${gig.gigTitle}" was unsuccessful.`,
    type: "order",
    targetRole: "buyer",
  });
    return next(new ErrorHandler("Stripe payment failed", 402));
  }

  // Log transaction in wallet
  wallet.transactions.push({
    type: "debit",
    amount: totalAmount,
    description: `Payment via card for order on gig "${gig.gigTitle}"`,
  });

  await wallet.save();

  // Attach payment details to order if needed
  stripeCharge = {
    id: paymentIntent.id,
    amount: paymentIntent.amount,
    currency: paymentIntent.currency,
    status: paymentIntent.status,
    payment_method: paymentIntent.payment_method,
    receipt_url: paymentIntent.charges?.data?.[0]?.receipt_url || null,
    created: paymentIntent.created,
  };
}


 else {
      return next(new ErrorHandler("Invalid payment method", 400));
    }



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
      referrer: referrerId,
      isPaid: true,
      paidAt: new Date(),
    });
// 🔔 Notify Buyer - Order Created
await Notification.create({
  user: buyerId,
  title: "Order Placed Successfully",
 description: `You placed an order for "${gig.gigTitle}" (${selectedPackage.packageName}).`,
  type: "order",
  targetRole: "buyer",
  link: `http://dotask-service-marketplace.vercel.app/order-details?id=${order._id}`,
});

// 🔔 Notify Seller - New Order Received
await Notification.create({
  user: sellerId,
  title: "New Order Received",
  description: `A new order has been placed on your gig "${gig.gigTitle}".`,
  type: "order",
  targetRole: "seller",
  link: `http://dotask-service-marketplace.vercel.app/order-details?id=${order._id}`,
});

// 💳 Notify Buyer - Payment Success (only if paid via card)
if (paymentMethod === 'card') {
  await Notification.create({
    user: buyerId,
    title: "Payment Successful",
    description: `Your card was charged $${totalAmount} for order on "${gig.gigTitle}".`,
    type: "order",
    targetRole: "buyer",
    link: `http://dotask-service-marketplace.vercel.app/settings/billing`,
  });
}

// 💳 Notify Buyer - Payment Success (wallet)
if (paymentMethod === 'balance') {
  await Notification.create({
    user: buyerId,
    title: "Payment from Wallet",
    description: `You paid $${totalAmount} from your wallet for the order "${gig.gigTitle}".`,
    type: "order",
    targetRole: "buyer",
    link: `http://dotask-service-marketplace.vercel.app/settings/billing`,
  });
}

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
  stripePayment: stripeCharge
    ? {
        id: stripeCharge.id,
        amount: stripeCharge.amount,
        currency: stripeCharge.currency,
        status: stripeCharge.status,
        payment_method: stripeCharge.payment_method,
        receipt_url: stripeCharge.receipt_url,
        created: stripeCharge.created,
      }
    : null,
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
      .populate("buyerId", "firstName lastName email country")
      .populate("sellerId", "firstName lastName email country")
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
      .populate("buyerId", "firstName lastName email country")
      .populate("sellerId", "firstName lastName email country")
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
      .populate("buyerId", "firstName lastName email country")
      .populate("sellerId", "firstName lastName email country")
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

      const uploadResult = await uploadToCloudinary(
        req.file.buffer,
        req.file.originalname
      );

      // ✅ attach originalname along with Cloudinary result
      deliveryFiles.push({
        url: uploadResult.url,
        public_id: uploadResult.public_id,
        originalname: req.file.originalname,
      });
    }

    // ⬇️ Push new delivery object to the deliveries array
    order.deliveries = order.deliveries || [];
    order.deliveries.push({
      files: deliveryFiles,
      message,
      deliveredAt: new Date(),
    });

   // Count how many revisions have been requested so far
const revisionCount = order.timeline.revisionRequests?.length || 0;

if (revisionCount === 0) {
  // First delivery → mark main deliveredAt
  order.timeline.deliveredAt = new Date();
} else {
  // Delivery of a specific revision → push into revisionDeliveries array
  order.timeline.revisionDeliveries = order.timeline.revisionDeliveries || [];
  order.timeline.revisionDeliveries.push({
    files: deliveryFiles,
    message,
    deliveredAt: new Date(),
    revisionNumber: revisionCount, // match last requested revision
  });
}

order.status = "delivered";
await order.save();


    // Notify Buyer
    const buyer = order.buyerId;

    await Notification.create({
      user: buyer._id,
      title: "Order Delivered",
      description: `Your order for "${order.gigId.gigTitle}" has been delivered.`,
      type: "order",
      targetRole: "buyer",
      link: `http://dotask-service-marketplace.vercel.app/order-details?id=${order._id}`,
    });

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
    order.timeline.approvedAt = new Date();   // ✅ Buyer approved
order.timeline.completedAt = new Date(); // ✅ Project closed
    await order.save();

    // Handle referral reward 👇
    if (order.referrer) {
      const Wallet = mongoose.model("Wallet");
      let wallet = await Wallet.findOne({ userId: order.referrer });

      if (!wallet) {
        wallet = new Wallet({ userId: order.referrer, balance: 0 });
      }

      const rewardAmount = 1; // $1 or 1 credit

      wallet.balance += rewardAmount;

      wallet.transactions.push({
        type: "credit",
        amount: rewardAmount,
        description: `Referral reward for order by user ${order.buyerId}`,
        createdAt: new Date(),
      });

      wallet.referrals.push({
        referredUser: { _id: order.buyerId },
        orderId: order._id,
        creditsEarned: rewardAmount,
        date: new Date(),
      });

      await wallet.save();
    }

    // Notify Seller
    const seller = order.sellerId;

    await Notification.create({
      user: seller._id,
      title: "Order Completed",
      description: `The buyer approved your final delivery for "${order.gigId.gigTitle}".`,
      type: "order",
      targetRole: "seller",
      link: `http://dotask-service-marketplace.vercel.app/order-details?id=${order._id}`,
    });

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


export const autoCompleteOrders = async (req, res, next) => {
  try {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 72 * 60 * 60 * 1000); // 72 hours ago

    // Find orders delivered but not completed/cancelled
    const orders = await Order.find({
      status: "delivered",
      "timeline.deliveredAt": { $exists: true },
      "timeline.completedAt": { $exists: false },
      "timeline.cancelledAt": { $exists: false },
    })
      .populate("sellerId")
      .populate("gigId");

    let updatedCount = 0;

    for (const order of orders) {
      // Get last delivery timestamp (check revisionDeliveries too)
      let lastDeliveryAt = order.timeline.deliveredAt;
      if (
        order.timeline.revisionDeliveries &&
        order.timeline.revisionDeliveries.length > 0
      ) {
        const lastRev =
          order.timeline.revisionDeliveries[
            order.timeline.revisionDeliveries.length - 1
          ];
        lastDeliveryAt = lastRev.deliveredAt;
      }

      // Skip if 72h not passed yet
      if (lastDeliveryAt > cutoff) continue;

      // Mark as completed automatically
      order.status = "completed";
      order.timeline.completedAt = now;
      order.timeline.approvedAt = now; // treat as approved
      order.timeline.autoCompletedAt = now; // new field for clarity

      // Add system note in timeline
      order.timeline.systemNote = `Order automatically completed by system (no buyer action within 3 days)`;

      await order.save();
      updatedCount++;

      // Notify Seller
      const seller = order.sellerId;
      await Notification.create({
        user: seller._id,
        title: "Order Auto-Completed",
        description: `Your order for "${order.gigId.gigTitle}" was automatically marked as completed (no buyer action within 3 days).`,
        type: "order",
        targetRole: "seller",
        link: `http://dotask-service-marketplace.vercel.app/order-details?id=${order._id}`,
      });

      if (seller?.email) {
        const html = generateEmailTemplate({
          firstName: seller.firstName,
          subject: "Order Automatically Completed",
          content: `
            <p>Hi ${seller.firstName},</p>
            <p>Your order for <strong>${order.gigId.gigTitle}</strong> has been automatically completed by the system because the buyer took no action within 3 days.</p>
            <p>You can now view this completed order in your dashboard.</p>
          `,
        });

        await transporter.sendMail({
          from: `"Marketplace" <${process.env.ADMIN_EMAIL}>`,
          to: seller.email,
          subject: "Order Automatically Completed",
          html,
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: `${updatedCount} orders auto-completed.`,
    });
  } catch (error) {
    console.error("❌ Error in autoCompleteOrders:", error);
    next(error);
  }
};




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
await Notification.create({
  user: order.sellerId,
  title: "New Review Received",
  description: `The buyer left a review on your gig "${order.gigId?.gigTitle || "Gig"}".`,
  type: "review",
  targetRole: "seller",
  link: `http://dotask-service-marketplace.vercel.app/order-details?id=${order._id}`,
});
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
await Notification.create({
  user: order.buyerId,
  title: "You've Received a Review",
  description: `The seller left a review for your order on "${order.gigId?.gigTitle || "Gig"}".`,
  type: "review",
  targetRole: "buyer",
  link: `http://dotask-service-marketplace.vercel.app/order-details?id=${order._id}`,
});
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

      // Check if this seller is already invited
      const existingIndex = order.coworkers.findIndex(
        (c) => c.sellerId.toString() === sellerId
      );

      if (existingIndex !== -1) {
        const existing = order.coworkers[existingIndex];

        if (existing.status === "rejected") {
          // Overwrite the rejected one
          order.coworkers[existingIndex] = {
            sellerId,
            priceType,
            rate,
            maxHours: priceType === "hourly" ? maxHours : undefined,
            status: "pending",
          };
        } else {
          // Already exists and not rejected, skip adding again
          continue;
        }
      } else {
        // Not invited before, so add
        order.coworkers.push({
          sellerId,
          priceType,
          rate,
          maxHours: priceType === "hourly" ? maxHours : undefined,
          status: "pending",
        });
      }

      // Send invite email
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

        await Notification.create({
  user: sellerId,
  title: "You've Been Invited to Collaborate",
  description: `You're invited to join the order for "${order.gigId.gigTitle}".`,
  type: "coworker",
  targetRole: "seller",
  link: "https://dotask-service-marketplace.vercel.app/seller/my-coworking-space",
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
      return req.headers.accept?.includes("application/json")
        ? res.status(200).json({ success: false, message: "Already responded." })
        : res.redirect("https://dotask-service-marketplace.vercel.app/login");
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
      await Notification.create({
  user: mainSeller._id,
  title: `Coworker ${action === "accept" ? "Accepted" : "Rejected"} Invitation`,
  description: `${coworkerUser?.firstName} has ${action}ed your request to join the order for "${order.gigId?.gigTitle}".`,
  type: "coworker",
  targetRole: "seller",
  link: "http://dotask-service-marketplace.vercel.app/seller/my-coworking-space",
});

    }

    // ➤ Handle based on request type
    if (req.headers.accept?.includes("application/json")) {
      // If it's an API call from frontend (e.g. fetch)
      return res.status(200).json({
        success: true,
        message: `Invitation ${action}ed successfully`,
        status: coworker.status,
      });
    } else {
      // If it's from email (browser hit)
      return res.redirect("https://dotask-service-marketplace.vercel.app/login");
    }

  } catch (error) {
    console.error("❌ Coworker response error:", error);
    next(error);
  }
};




export const getCoworkerOrders = async (req, res) => {
  try {
    const { sellerId } = req.params;

   
    const orders = await Order.find({
      "coworkers.sellerId": sellerId,
    })
      .populate("gigId", "gigTitle images")
      .populate("sellerId", "firstName lastName")
      .populate("coworkers.sellerId", "firstName lastName profileUrl country");

    const results = orders.map((order) => {
      const coworker = order.coworkers.find(
        (c) => c.sellerId?._id.toString() === sellerId
      );
      if (!coworker) return null;

      return {
        orderId: order._id.toString(),
        gigTitle: order.gigId?.gigTitle || "Untitled Gig",
        gigImage: order.gigId?.images?.[0]?.url || "/assets/gigs/default.png",
        sellerName: `${order.sellerId?.firstName || ""} ${order.sellerId?.lastName || ""}`.trim(),
        coworkerName: `${coworker.sellerId?.firstName || ""} ${coworker.sellerId?.lastName || ""}`.trim(),
        coworkerProfile: coworker.sellerId?.profileUrl || "",
        amount: `$${coworker.rate}`,
        type: coworker.priceType === "hourly" ? "Hourly" : "Fixed",
        maxHours: coworker.maxHours || null,
        status: coworker.status,
        isPaid: order.isPaid,
        paidAt: order.paidAt,
        deliveryDueDate: order.deliveryDueDate,
        createdAt: order.createdAt,
      };
    }).filter(Boolean);

    return res.status(200).json({
      success: true,
      count: results.length,
      orders: results,
    });

  } catch (error) {
    console.error("getCoworkerOrders error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const raiseResolutionRequest = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { reason, message, requestedBy } = req.body;

    if (!orderId || !reason || !message || !requestedBy) {
      return next(new ErrorHandler("Missing required fields", 400));
    }

    const order = await Order.findById(orderId)
      .populate("buyerId", "firstName email")
      .populate("sellerId", "firstName email");

    if (!order) return next(new ErrorHandler("Order not found", 404));

    // Update resolutionRequest
    order.resolutionRequest = {
      reason,
      message,
      requestedBy,
      requestedAt: new Date(),
      status: "open",
    };

    // Change order status to disputed
    order.status = "disputed";

    await order.save();

    const buyer = order.buyerId;
    const seller = order.sellerId;

    const isBuyerInitiator = requestedBy.toString() === buyer._id.toString();
    const initiator = isBuyerInitiator ? buyer : seller;
    const recipient = isBuyerInitiator ? seller : buyer;

    const subject = `Resolution Ticket Raised for Order ID ${order._id}`;
    const resolutionInfo = `
      <p><strong>Reason:</strong> ${reason}</p>
      <p><strong>Ticket ID:</strong> ${order.resolutionRequest.ticketId}</p>
    `;

    // Notify the initiator (confirmation)
    if (initiator?.email) {
      const html = generateEmailTemplate({
        firstName: initiator.firstName,
        subject,
        content: `
          <p>Dear ${initiator.firstName},</p>
          <p>Your resolution request for Order ID <strong>${order._id}</strong> has been submitted successfully.</p>
          ${resolutionInfo}
          <p>Our support team will review the case shortly.</p>
        `,
      });

      await transporter.sendMail({
        from: `"Marketplace Support" <${process.env.ADMIN_EMAIL}>`,
        to: initiator.email,
        subject,
        html,
      });
      await Notification.create({
  user: initiator._id,
  title: "Resolution Request Submitted",
  description: `You submitted a resolution request for Order ID ${order._id}.`,
  type: "resolution",
  targetRole: requestedBy.toString() === buyer._id.toString() ? "buyer" : "seller",
  link: `http://dotask-service-marketplace.vercel.app/order-details?id=${order._id}`,
});

    }

    // Notify the recipient (action needed)
    if (recipient?.email) {
      const html = generateEmailTemplate({
        firstName: recipient.firstName,
        subject,
        content: `
          <p>Dear ${recipient.firstName},</p>
          <p>A resolution request has been raised by the ${
            isBuyerInitiator ? "buyer" : "seller"
          } for Order ID <strong>${order._id}</strong>.</p>
          ${resolutionInfo}
          <p>Please review and take appropriate action:</p>
          <p style="margin-top: 16px;">
            <a href="https://backend-service-marketplace.vercel.app/api/orders/resolution-response/${order._id}?action=accept&userId=${recipient._id}"
               style="padding: 7px 20px; background-color: #28a745; color: #fff; text-decoration: none; border-radius: 5px; margin-right: 10px; font-size:12px;">
               Accept
            </a>
            <a href="https://backend-service-marketplace.vercel.app/api/orders/resolution-response/${order._id}?action=reject&userId=${recipient._id}"
               style="padding: 7px 20px; background-color: #dc3545; color: #fff; text-decoration: none; border-radius: 5px; font-size:12px;">
               Reject
            </a>
          </p>
          <p>If you do not respond, the support team will manually resolve the case after review.</p>
        `,
      });

      await transporter.sendMail({
        from: `"Marketplace Support" <${process.env.ADMIN_EMAIL}>`,
        to: recipient.email,
        subject,
        html,
      });
      await Notification.create({
  user: recipient._id,
  title: "Resolution Request Received",
  description: `A resolution request has been raised for Order ID ${order._id}. Your response is needed.`,
  type: "resolution",
  targetRole: requestedBy.toString() === buyer._id.toString() ? "seller" : "buyer",
  link: `http://dotask-service-marketplace.vercel.app/order-details?id=${order._id}`,
});

    }

    return res.status(200).json({
      success: true,
      message: "Resolution request submitted.",
      resolution: order.resolutionRequest,
    });
  } catch (error) {
    console.error("❌ Error in raiseResolutionRequest:", error);
    next(error);
  }
};


export const respondToResolutionRequest = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { userId, action, isAdmin } = req.query;

    if (!orderId || !userId || !["accept", "reject"].includes(action)) {
      return next(new ErrorHandler("Invalid input", 400));
    }

    const order = await Order.findById(orderId)
      .populate("buyerId", "firstName email")
      .populate("sellerId", "firstName email");

    if (!order) return next(new ErrorHandler("Order not found", 404));
    if (!order.resolutionRequest || order.resolutionRequest.status !== "open") {
      return next(new ErrorHandler("No active resolution request found", 400));
    }

    const buyer = order.buyerId;
    const seller = order.sellerId;

    const isBuyer = userId === buyer?._id?.toString();
    const isSeller = userId === seller?._id?.toString();

    if (!isBuyer && !isSeller && !isAdmin) {
      return next(new ErrorHandler("You are not authorized to respond to this resolution", 403));
    }

    // Update resolution details
    order.resolutionRequest.status = action === "accept" ? "resolved" : "rejected";
    order.resolutionRequest.respondedBy = userId;
    order.resolutionRequest.resolvedAt = new Date();
    order.resolutionRequest.adminResponse = isAdmin
      ? `Resolution ${action}ed by doTask team`
      : action === "accept"
        ? `${isBuyer ? "Buyer" : "Seller"} accepted the resolution request`
        : `${isBuyer ? "Buyer" : "Seller"} rejected the resolution request`;

        
  // Update order status
if (action === "accept") {
  order.status = "cancelled";
 order.timeline.cancelledAt = new Date(); 
} else {
  order.status = "pending";
}


    await order.save();

    const subject = isAdmin
      ? `Resolution ${action === "accept" ? "Resolved" : "Closed"} by doTask Team`
      : `Resolution Request ${action === "accept" ? "Accepted" : "Rejected"}`;

    const emailContent = `
      <p>Order ID: ${order._id}</p>
      <p><strong>Ticket ID:</strong> ${order.resolutionRequest.ticketId}</p>
      <p><strong>Resolved By:</strong> ${isAdmin ? "doTask Support Team" : isBuyer ? "Buyer" : "Seller"}</p>
      <p><strong>Status:</strong> ${order.resolutionRequest.status}</p>
      <p><strong>Action Taken:</strong> ${
        action === "accept" ? "Accepted and order cancelled" : "Rejected"
      }</p>
    `;

    // Notify both buyer and seller when admin resolves
    if (isAdmin) {
      for (const user of [buyer, seller]) {
        if (user?.email) {
          const html = generateEmailTemplate({
            firstName: user.firstName,
            subject,
            content: `
              <p>Dear ${user.firstName},</p>
              <p>The doTask support team has <strong>${action}</strong> the resolution request for Order ID: <strong>${order._id}</strong>.</p>
              ${emailContent}
            `,
          });

          await transporter.sendMail({
            from: `"Marketplace Support" <${process.env.ADMIN_EMAIL}>`,
            to: user.email,
            subject,
            html,
          });

          await Notification.create({
            user: user._id,
            title: subject,
            description: `The doTask team has ${action}ed the resolution request for Order ID ${order._id}.`,
            type: "resolution",
            targetRole: user._id.toString() === buyer._id.toString() ? "buyer" : "seller",
            link: `http://dotask-service-marketplace.vercel.app/order-details?id=${order._id}`,
          });
        }
      }
    } else {
      // Notify Opposite Party
      const notifyUser = isBuyer ? seller : buyer;
      if (notifyUser?.email) {
        const html = generateEmailTemplate({
          firstName: notifyUser.firstName,
          subject,
          content: `
            <p>Dear ${notifyUser.firstName},</p>
            <p>The ${isBuyer ? "buyer" : "seller"} has <strong>${action}</strong> the resolution request for Order ID: <strong>${order._id}</strong>.</p>
            ${emailContent}
          `,
        });

        await transporter.sendMail({
          from: `"Marketplace Support" <${process.env.ADMIN_EMAIL}>`,
          to: notifyUser.email,
          subject,
          html,
        });
      }
      await Notification.create({
        user: notifyUser._id,
        title: `Resolution ${action === "accept" ? "Accepted" : "Rejected"}`,
        description: `The ${isBuyer ? "buyer" : "seller"} has ${action}ed the resolution request for Order ID ${order._id}.`,
        type: "resolution",
        targetRole: isBuyer ? "seller" : "buyer",
        link: `http://dotask-service-marketplace.vercel.app/order-details?id=${order._id}`,
      });

      // Confirm to the responder
      const responder = isBuyer ? buyer : seller;
      if (responder?.email) {
        const html = generateEmailTemplate({
          firstName: responder.firstName,
          subject: "Resolution Response Submitted",
          content: `
            <p>Dear ${responder.firstName},</p>
            <p>You have successfully <strong>${action}</strong>ed the resolution request for Order ID: <strong>${order._id}</strong>.</p>
          `,
        });

        await transporter.sendMail({
          from: `"Marketplace Support" <${process.env.ADMIN_EMAIL}>`,
          to: responder.email,
          subject: "Resolution Request Response Confirmed",
          html,
        });
      }
      await Notification.create({
        user: responder._id,
        title: `You ${action === "accept" ? "Accepted" : "Rejected"} the Resolution`,
        description: `You ${action}ed the resolution request for Order ID ${order._id}.`,
        type: "resolution",
        targetRole: isBuyer ? "buyer" : "seller",
        link: `http://dotask-service-marketplace.vercel.app/order-details?id=${order._id}`,
      });
    }

    if (req.headers.accept?.includes("text/html")) {
      return res.send(`
        <div style="text-align: center; margin-top: 100px;">
          <h2>${subject}</h2>
          <p>This ticket has been marked as <strong>${order.resolutionRequest.status}</strong>.</p>
        </div>
      `);
    }

    // API response
    return res.status(200).json({
      success: true,
      message: isAdmin
        ? `Resolution ${action}ed successfully by doTask team.`
        : `Resolution ${action}ed successfully.`,
      orderStatus: order.status,
      resolution: order.resolutionRequest,
    });

  } catch (error) {
    console.error("❌ Error in respondToResolutionRequest:", error);
    next(error);
  }
};



// controllers/orderController.js
export const getDisputedOrders = async (req, res, next) => {
  try {
    const disputedOrders = await Order.find({
      "resolutionRequest.reason": { $exists: true, $ne: "" },
      "resolutionRequest.message": { $exists: true, $ne: "" },
      "resolutionRequest.ticketId": { $exists: true, $ne: "" },
    })
      .populate("buyerId", "firstName email country")
      .populate("sellerId", "firstName email country")
      .sort({ "resolutionRequest.requestedAt": -1 });

    const formatted = disputedOrders.map((order) => {
  const { resolutionRequest, totalAmount, buyerId, sellerId } = order;

  const buyerIdStr = buyerId?._id?.toString();
  const sellerIdStr = sellerId?._id?.toString();

  const countryOfDisputer =
    resolutionRequest?.requestedBy?.toString() === buyerIdStr
      ? buyerId?.country || null
      : sellerId?.country || null;

  return {
    _id: order._id,
    status: order.status,
    totalAmount,
    resolutionRequest,
    countryOfDisputer,
    buyer: buyerId || null,
    seller: sellerId || null,
  };
});


    res.status(200).json({
      success: true,
      count: formatted.length,
      disputedOrders: formatted,
    });
  } catch (err) {
    console.error("❌ getDisputedOrders error:", err);
    next(err);
  }
};









export const requestRevision = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { message } = req.body; // optional revision message from buyer

    if (!orderId) {
      return next(new ErrorHandler("Order ID is required", 400));
    }

    const order = await Order.findById(orderId)
      .populate("sellerId")
      .populate("buyerId")
      .populate("gigId");

    if (!order) {
      return next(new ErrorHandler("Order not found", 404));
    }

    if (order.status !== "delivered") {
      return next(new ErrorHandler("Revision can only be requested for delivered orders.", 400));
    }

    const revisionCount = order.timeline.revisionRequests?.length || 0;
if (revisionCount >= order.packageDetails.revisions) {
  return next(
    new ErrorHandler(
      "You have reached the maximum number of revisions for this package.",
      400
    )
  );
}


    order.status = "revision";

    order.revisionRequests.push({
    message: message || "",
    requestedAt: new Date(),
});
order.timeline.revisionRequests = order.timeline.revisionRequests || [];
order.timeline.revisionRequests.push({
  message: message || "",
  requestedAt: new Date(),
  revisionNumber: revisionCount + 1,
});
    await order.save();

    const buyer = order.buyerId;
    const seller = order.sellerId;

    const orderLink = `https://dotask-service-marketplace.vercel.app/order-details?id=${order._id}`;

    // Notify seller
    await Notification.create({
      user: seller._id,
      title: "Revision Requested",
      description: `The buyer has requested a revision for "${order.gigId.gigTitle}".`,
      type: "order",
      targetRole: "seller",
      link: orderLink,
    });

    // Notify buyer
    await Notification.create({
      user: buyer._id,
      title: "Revision Request Sent",
      description: `You have requested a revision for "${order.gigId.gigTitle}".`,
      type: "order",
      targetRole: "buyer",
      link: orderLink,
    });

    // Email seller
    if (seller?.email) {
      const html = generateEmailTemplate({
        firstName: seller.firstName,
        subject: "Revision Requested",
        content: `
          <p>Hi ${seller.firstName},</p>
          <p>The buyer has requested a revision for your delivery on <strong>${order.gigId.gigTitle}</strong>.</p>
          ${message ? `<p><strong>Message:</strong> ${message}</p>` : ""}
          <p>Please review the request and update the delivery accordingly.</p>
        `,
      });

      await transporter.sendMail({
        from: `"Marketplace" <${process.env.ADMIN_EMAIL}>`,
        to: seller.email,
        subject: "Revision Requested by Buyer",
        html,
      });
    }

    // Email buyer
    if (buyer?.email) {
      const html = generateEmailTemplate({
        firstName: buyer.firstName,
        subject: "Revision Request Sent",
        content: `
          <p>Hi ${buyer.firstName},</p>
          <p>Your revision request for <strong>${order.gigId.gigTitle}</strong> has been sent to the seller.</p>
          ${message ? `<p><strong>Your message:</strong> ${message}</p>` : ""}
        `,
      });

      await transporter.sendMail({
        from: `"Marketplace" <${process.env.ADMIN_EMAIL}>`,
        to: buyer.email,
        subject: "Revision Request Sent",
        html,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Revision requested successfully.",
      order,
    });
  } catch (error) {
    console.error("❌ Error in requestRevision:", error);
    next(error);
  }
};


// controllers/orderController.js

export const markRequirementsReviewed = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return next(new ErrorHandler("Order ID is required", 400));
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return next(new ErrorHandler("Order not found", 404));
    }

    order.timeline.requirementsReviewedAt = new Date();
    await order.save();

    return res.status(200).json({
      success: true,
      message: "Requirements marked as reviewed.",
      timeline: order.timeline,
    });
  } catch (error) {
    console.error("❌ Error in markRequirementsReviewed:", error);
    next(error);
  }
};





export const updateLastDeliveryDate = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { newDate } = req.body;

    if (!orderId || !newDate) {
      return res.status(400).json({ success: false, message: "Order ID and newDate are required" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // Check if revisionDeliveries exist
    if (order.timeline.revisionDeliveries && order.timeline.revisionDeliveries.length > 0) {
      // Update last revision delivery
      const lastIndex = order.timeline.revisionDeliveries.length - 1;
      order.timeline.revisionDeliveries[lastIndex].deliveredAt = new Date(newDate);
    } else if (order.timeline.deliveredAt) {
      // Update main delivery date
      order.timeline.deliveredAt = new Date(newDate);
    } else {
      return res.status(400).json({ success: false, message: "No delivery found to update" });
    }

    await order.save();

    return res.status(200).json({
      success: true,
      message: "Last delivery date updated successfully",
      timeline: order.timeline,
    });
  } catch (error) {
    console.error("❌ Error in updateLastDeliveryDate:", error);
    next(error);
  }
};
