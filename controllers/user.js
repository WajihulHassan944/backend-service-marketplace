import { User } from "../models/user.js";
import bcrypt from "bcrypt";
import { sendCookie } from "../utils/features.js";
import ErrorHandler from "../middlewares/error.js";
import nodemailer from "nodemailer";
import cloudinary from "../utils/cloudinary.js";
import streamifier from "streamifier";
import fetch from "node-fetch";
import jwt from "jsonwebtoken";
import { transporter } from "../utils/mailer.js";
import generateEmailTemplate from "../utils/emailTemplate.js";
import { Wallet } from "../models/wallet.js";
import stripe from "../utils/stripe.js";
import { verifyRecaptcha } from "../utils/verifyRecaptcha.js";
import { Order } from "../models/orders.js";
import { Notepad } from "../models/notepad.js";
import { formatDistanceToNow } from 'date-fns'; // Make sure date-fns is installed
import { Conversation } from "../models/conversation.js";
import { Gig } from "../models/gigs.js";
import { Portfolio } from "../models/portfolio.js";
import { Client } from "../models/clients.js";
import mongoose from "mongoose";
const fetchGoogleProfile = async (accessToken) => {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error("Failed to fetch user info from Google");
  }

  return await res.json();
};

// For new user signup
export const googleRegister = async (req, res, next) => {
 const { token, country } = req.body;


  try {
    const profile = await fetchGoogleProfile(token);
    const { name, email, picture } = profile;

    let user = await User.findOne({ email });

    if (user) {
      return next(new ErrorHandler("User already exists. Please login.", 400));
    }

    const [firstName, lastName = ""] = name.split(" ");

    user = await User.create({
      firstName,
      lastName,
      email,
      country: country,
      profileUrl: picture,
      verified: true,
      isNotificationsEnabled: true,
      isSubscribed: true,
      isAgreed: true,
       referrer: req.body.referrerId || null
    });

   // ✅ Notify referrer (if any) via email
    if (req.body.referrerId) {
      const referrer = await User.findById(req.body.referrerId);
      if (referrer) {
        await transporter.sendMail({
          from: `"Service Marketplace" <${process.env.ADMIN_EMAIL}>`,
          to: referrer.email,
          subject: "🙌 Someone Used Your Referral!",
          html: generateEmailTemplate({
            firstName: referrer.firstName,
            subject: "Someone Used Your Referral!",
            content: `
              <p>Good news! A new user just signed up using your referral link.</p>
              <p>Once they complete their first order, you'll receive your referral reward automatically in your wallet.</p>
              <p>Thanks for helping grow the Service Marketplace community!</p>
            `,
          }),
        });
      }
    }


  // ✅ Initialize Stripe Customer and Wallet
    const stripeCustomer = await stripe.customers.create({
      email: user.email,
      name: `${user.firstName} ${user.lastName}`.trim(),
    });

    const newWallet = await Wallet.create({
      userId: user._id,
      stripeCustomerId: stripeCustomer.id,
      balance: 0,
      cards: [],
      transactions: [],
    });



    // ✅ Generate welcome email using reusable template
    const welcomeHtml = generateEmailTemplate({
      firstName: user.firstName,
      subject: 'Welcome to doTask!',
      content: `
        <h2 style="color:#007bff;">Welcome ${user.firstName}!</h2>
        <p>Thanks for signing up using Google. Start exploring our services today and discover how easy it is to connect with top-rated professionals.</p>
      `
    });

    // Send welcome email to user
    await transporter.sendMail({
      from: `"Service Marketplace Admin" <${process.env.ADMIN_EMAIL}>`,
      to: user.email,
      subject: "Welcome to Service Marketplace!",
      html: welcomeHtml,
    });

    // Notify admin of new signup
   const adminNotificationHtml = generateEmailTemplate({
  firstName: "Admin",
  subject: "New Google Signup Notification",
  content: `
    <p>A new user signed up via Google:</p>
    <ul>
      <li><strong>Name:</strong> ${user.firstName} ${user.lastName}</li>
      <li><strong>Email:</strong> ${user.email}</li>
    </ul>
  `
});

await transporter.sendMail({
  from: `"Service Marketplace Admin" <${process.env.ADMIN_EMAIL}>`,
  to: process.env.ADMIN_EMAIL,
  subject: "New Google Signup Notification",
  html: adminNotificationHtml,
});


    sendCookie(user, res, `Welcome ${user.firstName}`, 201);

  } catch (error) {
    console.error("Google Register Error:", error);
    next(new ErrorHandler("Google Registration Failed", 500));
  }
};


export const googleLogin = async (req, res, next) => {
  const { token } = req.body;

  try {
    const profile = await fetchGoogleProfile(token);
    const { email, name, picture } = profile;

    const user = await User.findOne({ email });

    if (!user) {
      return next(new ErrorHandler("User not found. Please register.", 404));
    }

    if (!user.verified || user.blocked) {
      return next(new ErrorHandler("Account is either not verified or has been blocked.", 403));
    }

    // Clean roles: remove duplicates and conditionally include "seller"
    let cleanedRoles = Array.from(new Set(user.role || []));

    if (!user.sellerStatus) {
      cleanedRoles = cleanedRoles.filter(role => role !== "seller");
    }

    // Determine top role (if available)
    const priority = { seller: 1, buyer: 2 };
    const sortedRoles = [...cleanedRoles].sort((a, b) => priority[a] - priority[b]);
    const topRole = sortedRoles[0] || "buyer";

    sendCookie(user, res, `Welcome back, ${user.firstName}`, 200, {
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        profileUrl: user.profileUrl || picture,
        email: user.email,
        country: user.country,
        role: cleanedRoles,
        verified: user.verified,
        blocked: user.blocked,
        createdAt: user.createdAt,
        sellerStatus: user.sellerStatus,
      },
      topRole,
    });

  } catch (error) {
    console.error("Google Login Error:", error.message);
    next(new ErrorHandler("Google Login Failed", 500));
  }
};


export const blockUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { blocked: true },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "User blocked successfully",
      user,
    });
  } catch (error) {
    next(error);
  }
};


export const unblockUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { blocked: false },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "User unblocked successfully",
      user,
    });
  } catch (error) {
    next(error);
  }
};


export const getAllBuyers = async (req, res, next) => {
  try {
    const buyers = await User.find({ role: "buyer" });
    res.status(200).json({
      success: true,
      users: buyers,
    });
  } catch (error) {
    next(error);
  }
};

export const getAllSellers = async (req, res, next) => {
  try {
    const sellers = await User.find({ role: "seller" });
    res.status(200).json({
      success: true,
      users: sellers,
    });
  } catch (error) {
    next(error);
  }
};

export const getAllAdmins = async (req, res, next) => {
  try {
    const admins = await User.find({
      role: "admin",
    });

    res.status(200).json({
      success: true,
      users: admins,
    });
  } catch (error) {
    next(error);
  }
};






export const deleteUserById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) return next(new ErrorHandler("User not found", 404));

    // Delete Gigs and their Cloudinary media (optional)
    const gigs = await Gig.find({ userId: id });
    for (const gig of gigs) {
      for (const img of gig.images || []) {
        if (img.public_id) {
          // await cloudinary.uploader.destroy(img.public_id); // optional
        }
      }
      if (gig.pdf?.public_id) {
        // await cloudinary.uploader.destroy(gig.pdf.public_id); // optional
      }
    }
    await Gig.deleteMany({ userId: id });

    // Delete Notepads
    await Notepad.deleteMany({ userId: id });

    // Delete Portfolios
    await Portfolio.deleteMany({ user: id });

    // Delete the user
    await user.deleteOne();

    res.status(200).json({
      success: true,
      message: `User ${user.firstName} ${user.lastName} and all associated data deleted successfully.`,
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select("+password");

    if (!user) {
      return next(new ErrorHandler("Invalid Email or Password", 400));
    }

    // Check if user is blocked
    if (user.blocked) {
      return res.status(403).json({
        success: false,
        message: "Account is blocked. Please contact support.",
      });
    }

    // Check if user is not verified
    if (!user.verified) {
      return res.status(403).json({
        success: false,
        message: "Account not verified.",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return next(new ErrorHandler("Invalid Email or Password", 400));
    }

    // Clean roles: remove duplicates and conditionally include "seller"
    let cleanedRoles = Array.from(new Set(user.role)); // remove duplicates

    // Remove "seller" if sellerStatus is false
    if (!user.sellerStatus) {
      cleanedRoles = cleanedRoles.filter(role => role !== "seller");
    }

    const cleanedUser = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      profileUrl: user.profileUrl,
      email: user.email,
      country: user.country,
      role: cleanedRoles,
      verified: user.verified,
      blocked: user.blocked,
      createdAt: user.createdAt,
      sellerStatus: user.sellerStatus,
    };

    sendCookie(user, res, "Login Successful", 200, { user: cleanedUser });

  } catch (error) {
    next(error);
  }
};

export const getAllUsers = async (req, res, next) => {
  try {
    const users = await User.find(); // Fetch all users

    res.status(200).json({
      success: true,
      users,
    });
  } catch (error) {
    next(error);
  }
};



export const requestSellerRole = async (req, res, next) => {
  try {
    const { userId } = req.body;

    const user = await User.findById(userId);
    if (!user) return next(new ErrorHandler("User not found", 404));

    if (!user.role.includes('seller')) {
      user.role.push('seller');
    }

    user.verified = false;

    await user.save();

    await sendSellerApprovalEmail(user);

    res.status(200).json({
      success: true,
      message: "Seller role requested. Awaiting admin approval.",
    });

  } catch (error) {
    next(error);
  }
};

const validatePassword = (password) => {
  const errors = [];
  if (password.length < 8) errors.push("Minimum 8 characters");
  if (!/[A-Z]/.test(password)) errors.push("At least 1 uppercase letter");
  if (!/[a-z]/.test(password)) errors.push("At least 1 lowercase letter");
  if (!/[0-9]/.test(password)) errors.push("At least 1 number");
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) errors.push("At least 1 special character (!@#$%^&*)");
  return errors;
};



export const register = async (req, res, next) => {
try{
    const {
      firstName,
      lastName,
      email,
      password,
      country,
      role,
      referrerId,
      sellerDetails, 
    } = req.body;

    // Validate password strength
const passwordErrors = validatePassword(password);
if (passwordErrors.length > 0) {
  return next(new ErrorHandler(`Weak password: ${passwordErrors.join(", ")}`, 400));
}

    const existingUser = await User.findOne({ email });

    // Special handling: If user exists and role is 'seller'
    if (existingUser && role === "seller") {
      const updateData = {};

  if (
  sellerDetails?.linkedUrl ||
  sellerDetails?.speciality ||
  sellerDetails?.description ||
  sellerDetails?.personalPortfolio ||
  req.files?.resume?.[0]
) {
  updateData.sellerDetails = {
    ...existingUser.sellerDetails,
    ...(sellerDetails?.linkedUrl && { linkedUrl: sellerDetails.linkedUrl }),
    ...(sellerDetails?.speciality && { speciality: sellerDetails.speciality }),
    ...(sellerDetails?.description && { description: sellerDetails.description }),
    ...(sellerDetails?.personalPortfolio && { personalPortfolio: sellerDetails.personalPortfolio }),
  };

  // Upload resume if provided
  if (req.files?.resume?.[0]) {
    const bufferStream = streamifier.createReadStream(req.files.resume[0].buffer);
  const cloudinaryResume = await new Promise((resolve, reject) => {
  const stream = cloudinary.uploader.upload_stream(
    {
      folder: "user_resumes",
      resource_type: "raw",
      format: "pdf",
      public_id: `user_resumes/${Date.now()}-${firstName || "resume"}.pdf`,
      use_filename: true,
      unique_filename: false,
      overwrite: true,
    },

        (error, result) => {
          if (result) resolve(result);
          else reject(error);
        }
      );
      bufferStream.pipe(stream);
    });

    updateData.sellerDetails.resume = cloudinaryResume.secure_url;
  }
}


      if (!existingUser.role.includes("seller")) {
        updateData.role = [...existingUser.role, "seller"];
      }

      await User.updateOne({ email }, { $set: updateData });

      const updatedUser = await User.findOne({ email });
      await sendSellerApprovalEmail(updatedUser);

      return res.status(200).json({
        success: true,
        message: "Seller details updated and email sent for approval.",
        user: {
          _id: updatedUser._id,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          email: updatedUser.email,
          country: updatedUser.country,
          role: updatedUser.role,
          profileUrl: updatedUser.profileUrl,
          sellerDetails: updatedUser.sellerDetails,
          createdAt: updatedUser.createdAt,
        },
      });
    }

    // Normal new user flow
    if (existingUser) return next(new ErrorHandler("User Already Exists", 400));
    if (role === "superadmin") return next(new ErrorHandler("Registration as 'superadmin' is not allowed", 403));

    const hashedPassword = await bcrypt.hash(password, 10);

    // Avoid blindly adding 'buyer' if role is seller
  // Ensure "buyer" is always included if role is "seller"
const roles = [];
if (role === "seller") {
  roles.push("buyer", "seller");
} else if (role && typeof role === "string") {
  roles.push("buyer", role);
}


    let profileUrl = "https://res.cloudinary.com/daflot6fo/image/upload/v1754019495/one_bkvt3i.png"; // default fallback
if (req.files?.profileImage?.[0]) {
  const bufferStream = streamifier.createReadStream(req.files.profileImage[0].buffer);
  const cloudinaryUpload = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "user_profiles" },
      (error, result) => {
        if (result) resolve(result);
        else reject(error);
      }
    );
    bufferStream.pipe(stream);
  });
  profileUrl = cloudinaryUpload.secure_url;
}


let resumeUrl = "";
if (req.files?.resume?.[0]) {
  const bufferStream = streamifier.createReadStream(req.files.resume[0].buffer);
const cloudinaryResume = await new Promise((resolve, reject) => {
  const stream = cloudinary.uploader.upload_stream(
    {
      folder: "user_resumes",
      resource_type: "raw",
      format: "pdf",
      public_id: `user_resumes/${Date.now()}-${firstName || "resume"}.pdf`,
      use_filename: true,
      unique_filename: false,
      overwrite: true,
    },

      (error, result) => {
        if (result) resolve(result);
        else reject(error);
      }
    );
    bufferStream.pipe(stream);
  });
  resumeUrl = cloudinaryResume.secure_url;
}


    const isAdmin = roles.includes("admin");
    const isSeller = roles.includes("seller");
    const isBuyer = roles.includes("buyer");

    const newUserData = {
      firstName,
      lastName,
      email,
      password: hashedPassword,
      country,
      role: roles,
      profileUrl,
      verified: isSeller ? false : isAdmin || false,
    };
if (referrerId) {
  newUserData.referrer = referrerId;
}

   if (isSeller && sellerDetails) {
  newUserData.sellerDetails = {};
  if (sellerDetails.linkedUrl) newUserData.sellerDetails.linkedUrl = sellerDetails.linkedUrl;
  if (sellerDetails.speciality) newUserData.sellerDetails.speciality = sellerDetails.speciality;
  if (sellerDetails.description) newUserData.sellerDetails.description = sellerDetails.description;
  if (sellerDetails.personalPortfolio) newUserData.sellerDetails.personalPortfolio = sellerDetails.personalPortfolio;
  if (resumeUrl) newUserData.sellerDetails.resume = resumeUrl;
}


    const user = await User.create(newUserData);

    const stripeCustomer = await stripe.customers.create({
      email: user.email,
      name: `${user.firstName} ${user.lastName}`.trim(),
    });

    const newWallet = await Wallet.create({
      userId: user._id,
      stripeCustomerId: stripeCustomer.id,
      balance: 0,
      cards: [],
      transactions: [],
    });

if (referrerId) {
  const referrer = await User.findById(referrerId);
  if (referrer) {
    await transporter.sendMail({
      from: `"Service Marketplace" <${process.env.ADMIN_EMAIL}>`,
      to: referrer?.email,
      subject: "🙌 Someone Used Your Referral!",
      html: generateEmailTemplate({
        firstName: referrer?.firstName,
        subject: "Someone Used Your Referral!",
        content: `
          <p>Good news! A new user just signed up using your referral link.</p>
          <p>Once they complete their first order, you'll receive your referral reward automatically in your wallet.</p>
          <p>Thanks for helping grow the Service Marketplace community!</p>
        `,
      }),
    });
  }
}



   if (isBuyer && !isSeller) {
  // Send buyer verification email only if not also a seller
  const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "1d" });
  const verificationLink = `https://backend-service-marketplace.vercel.app/api/users/verify-email?token=${token}`;

  await transporter.sendMail({
    from: `"Service Marketplace" <${process.env.ADMIN_EMAIL}>`,
    to: email,
    subject: "Verify Your Email",
    html: generateEmailTemplate({
      firstName,
      subject: "Email Verification",
      content: `
        <p>Thanks for registering as a <strong>buyer</strong> on Service Marketplace. Please verify your email by clicking the button below:</p>
        <div style="margin:30px 0;text-align:center;">
          <a href="${verificationLink}" style="padding:12px 25px;background:#4CAF50;color:white;border-radius:5px;text-decoration:none;font-size:16px;">
            Verify Email
          </a>
        </div>
        <p>If you did not sign up, please ignore this email.</p>
      `,
    }),
  });
}

    if (isAdmin) {
      await sendAdminConfirmationEmails(email, firstName, password);
    }

    if (isSeller) {
      await sendSellerApprovalEmail(user);
    }

    res.status(201).json({
      success: true,
      message: isBuyer ? "Registration successful. Please verify your email." : "Registered Successfully",
      user: {
        _id: user._id,
        firstName,
        lastName,
        email,
        country,
        role: roles,
        verified: user.verified,
        profileUrl,
        createdAt: user.createdAt,
        ...(isSeller && user.sellerDetails && { sellerDetails: user.sellerDetails }),
      },
    });
  } catch(error){
    next(error);
  }
 
};




export const sellerRequest = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    if (!user.role.includes("seller")) {
      user.role.push("seller");
    }
    await user.save();

    await sendSellerApprovalEmail(user);

    res.status(200).json({
      success: true,
      message: "User requested as seller successfully",
      user: {
        _id: user._id,
        email: user.email,
        role: user.role,
        sellerStatus: user.sellerStatus,
      },
    });
  } catch (error) {
    console.error("Approve Seller Error:", error);
    res.status(500).json({ success: false, message: "Failed to approve seller" });
  }
};

export const verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.query;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.userId);
    if (!user) return next(new ErrorHandler("Invalid or expired verification link", 400));

    if (user.verified) {
      return res.redirect("http://dotask-service-marketplace.vercel.app/email-verification?verified=already");
    }

    user.verified = true;
    await user.save();

    res.redirect("http://dotask-service-marketplace.vercel.app/email-verification?verified=success");
  } catch (error) {
    console.error(error);
    res.redirect("http://dotask-service-marketplace.vercel.app/email-verification?verified=failed");
  }
};


const sendAdminConfirmationEmails = async (userEmail, firstName, password) => {
  const adminEmail = process.env.ADMIN_EMAIL;
  const mailOptionsToUser = {
    from: `"doTask Service Marketplace" <${adminEmail}>`,
    to: userEmail,
    subject: "Welcome to Service Marketplace - Admin Access Granted",
    html: generateEmailTemplate({
      firstName,
      subject: "Admin Access Granted",
      content: `
        <p>Hi <strong>${firstName}</strong>,</p>
        <p>You have been granted admin access on <strong>doTask Service Marketplace</strong>.</p>
        <p><strong>Your Credentials:</strong></p>
        <ul style="padding-left:20px;">
          <li><strong>Email:</strong> ${userEmail}</li>
          <li><strong>Password:</strong> ${password}</li>
        </ul>
        <p>Please log in and update your password after your first login.</p>
        <div style="text-align:center;margin:30px 0;">
          <a href="https://dotask-service-marketplace.vercel.app/" style="display:inline-block;background-color:#007bff;color:#fff;text-decoration:none;padding:12px 25px;border-radius:5px;font-size:16px;">
            Go to doTask Marketplace
          </a>
        </div>
      `,
    }),
  };

  // Email to admin
  const mailOptionsToAdmin = {
    from: `"doTask Service Marketplace" <${adminEmail}>`,
    to: adminEmail,
    subject: "New Admin Registered",
    html: generateEmailTemplate({
      firstName: "Admin",
      subject: "New Admin Registered",
      content: `
        <p>A new admin has been registered on <strong>doTask Service Marketplace</strong>:</p>
        <ul style="padding-left:20px;">
          <li><strong>Name:</strong> ${firstName}</li>
          <li><strong>Email:</strong> ${userEmail}</li>
          <li><strong>Password:</strong> ${password}</li>
        </ul>
        <p>Please ensure this account is monitored appropriately.</p>
      `,
    }),
  };

  await transporter.sendMail(mailOptionsToUser);
  await transporter.sendMail(mailOptionsToAdmin);
};


const sendSellerApprovalEmail = async (user) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.ADMIN_EMAIL,
      pass: process.env.ADMIN_EMAIL_PASS,
    },
  });

  const approvalLink = `https://backend-service-marketplace.vercel.app/api/users/verify/${user._id}`;

  const {
    linkedUrl,
    speciality,
    completedOrdersCount,
    description,
    skills,
    personalPortfolio,
    resume,
  } = user.sellerDetails || {};

  const mailOptions = {
    from: `"Service Marketplace Admin" <${process.env.ADMIN_EMAIL}>`,
    to: process.env.ADMIN_EMAIL,
    subject: "New Seller Registration Pending Approval",
    html: generateEmailTemplate({
      firstName: "Admin",
      subject: "New Seller Registration",
      content: `
        <p><strong>${user.firstName} ${user.lastName || ""}</strong> has registered as a <strong>seller</strong>.</p>
        <p><strong>Email:</strong> ${user.email}</p>
        <p><strong>Country:</strong> ${user.country || "N/A"}</p>
        ${linkedUrl ? `<p><strong>LinkedIn:</strong> <a href="${linkedUrl}" target="_blank">${linkedUrl}</a></p>` : ""}
        ${speciality ? `<p><strong>Speciality:</strong> ${speciality}</p>` : ""}
        <p><strong>Completed Orders:</strong> ${completedOrdersCount || 0}</p>
        ${description ? `<p><strong>Description:</strong> ${description}</p>` : ""}
        ${skills?.length ? `<p><strong>Skills:</strong> ${skills.join(", ")}</p>` : ""}
        ${personalPortfolio ? `<p><strong>Portfolio:</strong> <a href="${personalPortfolio}" target="_blank">${personalPortfolio}</a></p>` : ""}
        ${resume ? `<p><strong>Resume:</strong> <a href="${resume}" target="_blank">${resume}</a></p>` : ""}
        <div style="margin:30px 0;text-align:center;">
          <a href="${approvalLink}" style="display:inline-block;padding:12px 25px;background-color:#28a745;color:#fff;text-decoration:none;border-radius:5px;font-size:16px;">
            Approve Seller
          </a>
        </div>
      `,
    }),
  };

  await transporter.sendMail(mailOptions);
};



export const verifyUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    // 🔹 Validate ObjectId first
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).send("<h2>Invalid user ID format</h2>");
    }

    const user = await User.findByIdAndUpdate(
      id,
      { verified: true, sellerStatus: true },
      { new: true }
    );

    if (!user) {
      return res.status(404).send("<h2>User not found</h2>");
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.ADMIN_EMAIL,
        pass: process.env.ADMIN_EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: `"Service Marketplace Team" <${process.env.ADMIN_EMAIL}>`,
      to: user.email,
      subject: "🎉 Your Seller Account Has Been Approved!",
      html: generateEmailTemplate({
        firstName: user.firstName,
        subject: "Seller Account Approved",
        content: `
          <p>Great news — your seller account has been successfully approved on <strong>doTask Service Marketplace</strong>.</p>
          <p>You can now log in and start offering your services to buyers.</p>
          <div style="margin:30px 0;text-align:center;">
            <a href="https://dotask-service-marketplace.vercel.app" style="display:inline-block; padding:12px 25px; background-color:#007bff; color:white; text-decoration:none; border-radius:5px; font-size:16px;">
              Visit Marketplace
            </a>
          </div>
        `,
      }),
    };

    await transporter.sendMail(mailOptions);

    res.send(`
      <h2>Seller Approved</h2>
      <p>The seller <strong>${user.firstName} ${user.lastName}</strong> has been verified and notified via email.</p>
    `);
  } catch (error) {
    console.error("Verify Seller Error:", error);
    res.status(500).send("<h2>Something went wrong. Please try again later.</h2>");
  }
};
const timeAgo = (date) => {
  if (!date) return null;
  return formatDistanceToNow(new Date(date), { addSuffix: true }); // e.g. "2 weeks ago"
};

export const getMyProfile = async (req, res, next) => {
  try{ 
  const userId = req.user._id;

    const wallet = await Wallet.findOne({ userId });

const enrichedReferrals = await Promise.all(
  (wallet?.referrals || []).map(async (ref) => {
    const user = await User.findById(ref.referredUser._id).select("firstName lastName country");
    return {
      ...ref.toObject(),
      referredUser: {
        _id: ref.referredUser._id,
        firstName: user?.firstName,
        lastName: user?.lastName,
        country: user?.country,
      },
    };
  })
);


    const orders = await Order.find({
      $or: [{ buyerId: userId }, { sellerId: userId }]
    })
      .select("buyerId sellerId buyerReview sellerReview totalAmount status")
      .populate("buyerId", "firstName lastName email profileUrl country")
      .populate("sellerId", "firstName lastName email profileUrl country");

    const buyerReviews = [];
    const sellerReviews = [];

    // Seller-side analytics
    let sellerWorkInProgress = 0;
    let sellerInReview = 0;
    let activeOrdersCount = 0;
    let sellerTotalValue = 0;
    let sellerCompletedCount = 0;

    // Buyer-side analytics
    let buyerOrdersCount = 0;
    let buyerCompletedCount = 0;
    let buyerTotalSpent = 0;

    for (const order of orders) {
      const isBuyer = order.buyerId?._id?.toString() === userId.toString();
      const isSeller = order.sellerId?._id?.toString() === userId.toString();

      if (isSeller) {
        sellerTotalValue += order.totalAmount || 0;

        if (["pending", "in progress", "delivered"].includes(order.status)) {
          activeOrdersCount++;
        }

        if (order.status === "completed") {
          sellerCompletedCount++;
        }

        if (["pending", "in progress"].includes(order.status)) {
          sellerWorkInProgress += order.totalAmount || 0;
        } else if (order.status === "delivered") {
          sellerInReview += order.totalAmount || 0;
        }
      }

      if (isBuyer) {
        buyerOrdersCount++;
        buyerTotalSpent += order.totalAmount || 0;

        if (order.status === "completed") {
          buyerCompletedCount++;
        }
      }
if (isBuyer && order?.buyerReview?.review && order.sellerId) {
  buyerReviews.push({
    ...order.buyerReview,
    timeAgo: timeAgo(order.buyerReview.createdAt),
    reviewedGigSeller: {
      _id: order.sellerId._id,
      firstName: order.sellerId.firstName,
      lastName: order.sellerId.lastName,
      email: order.sellerId.email,
      profileUrl: order.sellerId.profileUrl || null,
      country: order.sellerId.country || null,
    },
  });
}

if (isSeller && order?.sellerReview?.review && order.buyerId) {
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

    const chatsCount = await Conversation.countDocuments({
      $or: [{ participantOne: userId }, { participantTwo: userId }],
    });


// then replace the referrals
const enrichedWallet = {
  ...(wallet?.toObject?.() || {}),
  referrals: enrichedReferrals,
  walletStatus: {
    workInProgress: sellerWorkInProgress,
    inReview: sellerInReview,
  },
};

    const rawUser = req.user.toObject?.() || req.user;

    // 💡 Clean and validate roles
    let cleanedRoles = Array.from(new Set(rawUser.role || []));
    if (!rawUser.sellerStatus) {
      cleanedRoles = cleanedRoles.filter((role) => role !== "seller");
    }


    

    const userWithAnalytics = {
      ...rawUser,

      role: cleanedRoles,

      sellerDetails: {
        ...(rawUser.sellerDetails || {}),
        analytics: {
          activeOrdersCount,
          totalOrderValue: `$${sellerTotalValue}`,
          ordersCompletedCount: sellerCompletedCount,
          chatsCount,
          notificationsCount: 0,
        },
      },

      buyerDetails: {
        analytics: {
          ordersPlacedCount: buyerOrdersCount,
          totalSpent: `$${buyerTotalSpent}`,
          ordersCompletedCount: buyerCompletedCount,
          chatsCount,
          notificationsCount: 0,
        },
      },
    };

    res.status(200).json({
      success: true,
      user: userWithAnalytics,
      wallet: enrichedWallet,
      buyerReviews,
      sellerReviews,
    });
  }catch(error){
    next(error);
    console.log(error);
  }
};

export const toggleWishlist = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { gigId } = req.body;

    if (!gigId) {
      return res.status(400).json({ success: false, message: "gigId is required" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const alreadyWishlisted = user.wishlist?.includes(gigId);

    if (alreadyWishlisted) {
      user.wishlist.pull(gigId); // remove from array
    } else {
      user.wishlist.push(gigId); // add to array
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: alreadyWishlisted ? "Removed from wishlist" : "Added to wishlist",
      wishlist: user.wishlist,
    });
  } catch (err) {
    console.error("Toggle wishlist error:", err);
    next(err);
  }
};
export const getWishlistGigs = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId).select("wishlist");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const gigs = await Gig.find({ _id: { $in: user.wishlist } }).populate({
      path: "userId",
      select: "firstName lastName profileUrl sellerDetails.level",
    });

    const enrichedGigs = await Promise.all(
      gigs.map(async (gig) => {
        const sellerId = gig.userId?._id;

        // Fetch all orders that contain a review for this seller
        const ordersWithReview = await Order.find({
          sellerId,
          "sellerReview.rating": { $exists: true },
        }).select("sellerReview.rating");

        const totalRatings = ordersWithReview.reduce(
          (sum, order) => sum + (order.sellerReview.rating || 0),
          0
        );
        const ratingCount = ordersWithReview.length;
        const averageRating =
          ratingCount > 0 ? (totalRatings / ratingCount).toFixed(1) : "0.0";

        return {
          ...gig.toObject(),
          userId: {
            ...gig.userId.toObject(),
            averageRating,
            ratingCount,
          },
        };
      })
    );

    res.status(200).json({
      success: true,
      wishlistCount: user.wishlist.length,
      gigs: enrichedGigs,
    });
  } catch (err) {
    console.error("Error fetching wishlist gigs:", err);
    next(err);
  }
};
export const logout = (req, res) => {
  const nodeEnv = process.env.NODE_ENV;
  const sameSite = nodeEnv === "development" ? "lax" : "none";
  const secure = nodeEnv === "development" ? false : true;
  const currentToken = req.cookies?.token;

  console.log("=== Logout Debug Info ===");
  console.log("NODE_ENV:", nodeEnv);
  console.log("SameSite:", sameSite);
  console.log("Secure:", secure);
  console.log("Current token cookie (if any):", currentToken);

  res
    .status(200)
    .cookie("token", "", {
      expires: new Date(Date.now()),
      sameSite,
      secure,
      httpOnly: true,
    })
    .json({
      success: true,
      user: req.user,
      message: "Token cleared on logout",
      debug: {
        NODE_ENV: nodeEnv,
        sameSite,
        secure,
        receivedToken: currentToken,
      },
    });
};



export const getUserById = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select(
      "firstName lastName email profileUrl role country sellerStatus sellerDetails verified blocked"
    );

    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
};


export const allAvailableSellers = async (req, res, next) => {
  try {
    const sellers = await User.find({ role: { $in: ["seller"] } })
      .select("firstName lastName profileUrl _id");

    res.status(200).json({
      success: true,
      data: sellers,
    });
  } catch (error) {
    next(error);
  }
};


export const resetPasswordRequest = async (req, res, next) => {
  try {
    const { email, captchaToken } = req.body;

    // Required fields check
    if (!email || !captchaToken) {
      return res.status(400).json({ status: 400, message: "Missing required fields." });
    }

    // Find the user
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(404).json({ status: 404, message: "User not found." });
    }

    // reCAPTCHA validation
    const isHuman = await verifyRecaptcha(captchaToken);
    if (!isHuman) {
      return res.status(400).json({ message: "Failed reCAPTCHA verification." });
    }

    // Generate reset token (1h expiry)
    const resetToken = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    const resetLink = `http://dotask-service-marketplace.vercel.app/reset-password?token=${resetToken}`;

  const mailOptions = {
  from: `"Service Marketplace" <${process.env.ADMIN_EMAIL}>`, // keep consistent
  to: user.email,
  subject: "Password Reset Request",
  html: generateEmailTemplate({
    firstName: user.firstName,
    subject: "Reset Your Password",
    content: `
      <p>Hello ${user.firstName},</p>
      <p>You requested to reset your password. Please click the button below to set a new password:</p>
      <div style="margin:30px 0;text-align:center;">
        <a href="${resetLink}" 
           style="display:inline-block;padding:12px 25px;background-color:#007bff;color:#fff;text-decoration:none;border-radius:5px;font-size:16px;">
          Reset Password
        </a>
      </div>
      <p>This link will expire in <strong>1 hour</strong>. If you did not request this, you can safely ignore this email.</p>
      <p style="margin-top:20px;">Stay secure,<br><strong>Service Marketplace Team</strong></p>
    `,
  }),
};

// Send email
    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Reset email sent:", info.response);

    return res.status(200).json({ message: "Password reset link sent to your email." });

  } catch (error) {
    console.error("🚨 resetPasswordRequest error:", error);
    next(error);
  }
};


export const changePasswordDirectly = async (req, res, next) => {
  try {
    const {userId , currentPassword, newPassword } = req.body;

    // Find user by _id
    const user = await User.findById(userId).select("+password");
    if (!user) {
      return res.status(404).json({ message: "No user found with this ID." });
    }

    // Compare current password
    const isMatch = await bcrypt.compare(currentPassword, user.password || "");
    if (!isMatch) {
      return res.status(401).json({ message: "Incorrect current password." });
    }

    // Hash and update new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    // Compose confirmation email
    const mailOptions = {
      from: `"Service Marketplace Admin" <${process.env.ADMIN_EMAIL}>`,
      to: user.email,
      subject: "Your Password Has Been Changed",
      html: generateEmailTemplate({
        firstName: user.firstName,
        subject: "Password Changed Successfully",
        content: `
          <p>Hello ${user.firstName},</p>
          <p>Your password was successfully changed. If you did not perform this action, please contact support immediately.</p>
        `,
      }),
    };

    // Send confirmation email
    transporter.sendMail(mailOptions, (err, info) => {
      if (err) {
        console.error("❌ Error sending confirmation email:", err);
        return res.status(500).json({ message: "Password updated, but email failed to send." });
      } else {
        console.log("✅ Confirmation email sent:", info.response);
        return res.status(200).json({ message: "Password updated and confirmation email sent." });
      }
    });
  } catch (error) {
    console.error("🚨 changePasswordDirectly error:", error);
    next(error);
  }
};

export const resetPasswordConfirm = async (req, res, next) => {
  try {
    const { token, newPassword, confirmPassword } = req.body;

    // Required field check
    if (!newPassword || !confirmPassword) {
      return res.status(400).json({ message: "New password and confirm password are required." });
    }

    // Passwords must match
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match." });
    }

   // Validate new password strength
    const errors = validatePassword(newPassword);
    if (errors.length > 0) {
      return res.status(400).json({ message: "Weak password.", errors });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    // Find user
    const user = await User.findById(userId).select("+password");
    if (!user) {
      return res.status(404).json({ message: "User not found or token is invalid." });
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update and save
    user.password = hashedPassword;
    await user.save();

    // Send confirmation email
    const mailOptions = {
      from: `"Service Marketplace Admin" <${process.env.ADMIN_EMAIL}>`,
      to: user.email,
      subject: "Your Password Has Been Changed",
      html: generateEmailTemplate({
        firstName: user.firstName,
        subject: "Password Changed Successfully",
        content: `
          <p>Hello ${user.firstName},</p>
          <p>This is a confirmation that your account password was successfully updated.</p>
          <p>If you did not perform this action, please change immediately or contact our support team.</p>
          <p style="margin-top:20px;">Stay secure,<br><strong>Service Marketplace Team</strong></p>
        `,
      }),
    };

    await transporter.sendMail(mailOptions);

    return res.status(200).json({ message: "Password has been reset successfully." });

  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(400).json({ message: "Reset link has expired." });
    }
    console.error("🚨 resetPasswordConfirm error:", error);
    next(error);
  }
};

export const updateProfile = async (req, res, next) => {
  try {
    const {
      userId,
      firstName,
      lastName,
      email,
      country,
      linkedUrl,
      speciality,
      description,
      skills, // This should come as a JSON string, will parse below
      languages,
    } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "Missing userId in request body." });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Dynamically update only provided fields
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (email) user.email = email;
    if (country) user.country = country;

    // Initialize or update sellerDetails fields
    const updatedSellerDetails = {
      ...user.sellerDetails,
      ...(linkedUrl && { linkedUrl }),
      ...(speciality && { speciality }),
      ...(description && { description }),
    };

    if (skills) {
      try {
        const parsedSkills = JSON.parse(skills);
        if (Array.isArray(parsedSkills)) {
          updatedSellerDetails.skills = parsedSkills;
        }
      } catch (err) {
        return res.status(400).json({ message: "Invalid format for skills. Must be a JSON array string." });
      }
    }
     if (languages) {
      try {
        const parsedLanguages = JSON.parse(languages);
        if (Array.isArray(parsedLanguages)) {
          updatedSellerDetails.languages = parsedLanguages;
        }
      } catch (err) {
        return res.status(400).json({ message: "Invalid format for languages. Must be a JSON array string." });
      }
    }

    user.sellerDetails = updatedSellerDetails;

    // Handle image upload if file provided
    if (req.file) {
      if (user.profileUrl && user.profileUrl.includes("cloudinary.com")) {
        const publicId = user.profileUrl.split("/").pop().split(".")[0];
        await cloudinary.uploader.destroy(`user_profiles/${publicId}`);
      }

      const streamUpload = () =>
        new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder: 'user_profiles',
              resource_type: 'image',
            },
            (error, result) => {
              if (result) resolve(result);
              else reject(error);
            }
          );
          streamifier.createReadStream(req.file.buffer).pipe(stream);
        });

      const result = await streamUpload();
      user.profileUrl = result.secure_url;
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user,
    });

  } catch (error) {
    console.error('Update error:', error);
    next(error);
  }
};


export const updateAvailabilityStatus = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { availabilityStatus } = req.body;
if(!userId){
  return res.status(400).json({ message: "User Not Authorized" });
}
    if (typeof availabilityStatus !== 'boolean') {
      return res.status(400).json({ message: "availabilityStatus must be a boolean" });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { availabilityStatus },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      message: "Availability status updated successfully",
      availabilityStatus: updatedUser.availabilityStatus,
    });
  } catch (error) {
    next(error);
  }
};




export const getSellerProfileData = async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ success: false, message: "Missing userId in request." });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: "Invalid userId format." });
    }

    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    // Fetch gigs, portfolios, clients
    const gigs = await Gig.find({ userId }).lean();
    const portfolios = await Portfolio.find({ user: userId }).lean();
    const clients = await Client.find({ user: userId }).lean();

    // Fetch orders
    const orders = await Order.find({
      $or: [{ buyerId: userId }, { sellerId: userId }],
    })
      .select("buyerId sellerId buyerReview sellerReview totalAmount status createdAt updatedAt")
      .populate("buyerId", "firstName lastName email profileUrl country")
      .populate("sellerId", "firstName lastName email profileUrl country")
      .lean();

    const buyerReviews = [];
    const sellerReviews = [];
    let sellerWorkInProgress = 0;
    let sellerInReview = 0;
    let activeOrdersCount = 0;
    let sellerTotalValue = 0;
    let sellerCompletedCount = 0;
    let buyerOrdersCount = 0;
    let buyerCompletedCount = 0;
    let buyerTotalSpent = 0;
    let lastDelivery = null;

    for (const order of orders) {
      const isBuyer = order.buyerId?._id?.toString() === userId;
      const isSeller = order.sellerId?._id?.toString() === userId;

      if (isSeller) {
        sellerTotalValue += order.totalAmount || 0;
        if (["pending", "in progress", "delivered"].includes(order.status)) activeOrdersCount++;
        if (order.status === "completed") {
          sellerCompletedCount++;
          const completedAt = new Date(order.updatedAt || order.createdAt);
          if (!lastDelivery || completedAt > lastDelivery) lastDelivery = completedAt;
        }
        if (["pending", "in progress"].includes(order.status)) {
          sellerWorkInProgress += order.totalAmount || 0;
        } else if (order.status === "delivered") {
          sellerInReview += order.totalAmount || 0;
        }
      }

      if (isBuyer) {
        buyerOrdersCount++;
        buyerTotalSpent += order.totalAmount || 0;
        if (order.status === "completed") buyerCompletedCount++;
      }

      if (isBuyer && order.buyerReview?.review) {
        buyerReviews.push({
          ...order.buyerReview,
          timeAgo: timeAgo(order.buyerReview.createdAt),
          reviewedGigSeller: {
            _id: order.sellerId,
            firstName: order.sellerId.firstName,
            lastName: order.sellerId.lastName,
            email: order.sellerId.email,
            profileUrl: order.sellerId.profileUrl || null,
            country: order.sellerId.country || null,
          },
        });
      }

      if (isSeller && order.sellerReview?.review) {
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

    const chatsCount = await Conversation.countDocuments({
      $or: [{ participantOne: userId }, { participantTwo: userId }],
    });

    const userWithAnalytics = {
      ...user,
      sellerDetails: {
        ...(user.sellerDetails || {}),
        analytics: {
          activeOrdersCount,
          totalOrderValue: `$${sellerTotalValue}`,
          ordersCompletedCount: sellerCompletedCount,
          chatsCount,
          notificationsCount: 0,
          workInProgress: sellerWorkInProgress,
          inReview: sellerInReview,
          lastDelivery,
        },
      },
      buyerDetails: {
        analytics: {
          ordersPlacedCount: buyerOrdersCount,
          totalSpent: `$${buyerTotalSpent}`,
          ordersCompletedCount: buyerCompletedCount,
          chatsCount,
          notificationsCount: 0,
        },
      },
    };

    return res.status(200).json({
      success: true,
      user: userWithAnalytics,
      gigs,
      portfolios,
      buyerReviews,
      sellerReviews,
      clients,
    });
  } catch (error) {
    console.error("getSellerProfileData error:", error);
    return res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};
export const getSellerProfileDataByUserName = async (req, res) => {
  try {
    const { userName } = req.params;
    if (!userName) {
      return res.status(400).json({ success: false, message: "Missing userName in request." });
    }

    const user = await User.findOne({ userName }).lean();
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    // Reuse the same analytics & data building logic from getSellerProfileData
    req.params.userId = user._id.toString();
    return getSellerProfileData(req, res); // directly reuse existing logic
  } catch (error) {
    console.error("getSellerProfileDataByUserName error:", error);
    return res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};


export const getAllPublicSellerProfiles = async (req, res, next) => {
  try {
    // 🔍 Find all users who are sellers
    const sellers = await User.find({
      $or: [
        { sellerStatus: true },
        { role: { $in: ["seller"] } }
      ]
    }).select(
      "_id firstName lastName userName profileUrl sellerDetails.speciality sellerDetails.level"
    );

    const sellerProfiles = await Promise.all(
      sellers.map(async (user) => {
        // Get all orders with seller review
        const ratedOrders = await Order.find({
          sellerId: user._id,
          "sellerReview.rating": { $exists: true }
        }).select("sellerReview.rating");

        // Get only completed orders
        const completedOrdersCount = await Order.countDocuments({
          sellerId: user._id,
          status: "completed"
        });

        let averageRating = "0.0";
        let totalReviews = "No reviews yet";

        if (ratedOrders.length > 0) {
          const total = ratedOrders.reduce((sum, order) => sum + order.sellerReview.rating, 0);
          averageRating = (total / ratedOrders.length).toFixed(1);
          totalReviews = ratedOrders.length;
        }

        return {
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          userName: user.userName,
          profileUrl: user.profileUrl,
          speciality: user.sellerDetails?.speciality || null,
          level: user.sellerDetails?.level || "New Seller",
          averageRating,
          totalReviews,
          ordersCompletedCount: completedOrdersCount
        };
      })
    );

    return res.status(200).json({
      success: true,
      sellers: sellerProfiles,
    });
  } catch (error) {
    console.error("Error in getAllPublicSellerProfiles:", error);
    next(error);
  }
};



export const searchUsers = async (req, res) => {
  try {
    const { q } = req.query;

    const sellerQuery = { role: { $in: ['seller'] } };

    let users;
    if (!q || q.trim() === '') {
      users = await User.find(sellerQuery)
        .select('_id firstName lastName userName email profileUrl country sellerDetails');
    } else {
      const query = q.trim();
      const regex = new RegExp(query, 'i');

      users = await User.find({
        ...sellerQuery,
        $or: [
          { firstName: regex },
          { lastName: regex },
          { userName: regex },
          { email: regex },
          { 'sellerDetails.speciality': regex },
          { 'sellerDetails.skills': regex },
          {
            $expr: {
              $regexMatch: {
                input: { $concat: ['$firstName', ' ', '$lastName'] },
                regex: query,
                options: 'i',
              },
            },
          },
        ],
      }).select('_id firstName lastName userName email profileUrl country sellerDetails');
    }

    const usersWithAnalytics = await Promise.all(users.map(async (user) => {
      const completedOrders = await Order.find({ sellerId: user._id, status: 'completed' });

      const ratings = completedOrders
        .map(order => order?.buyerReview?.overallRating)
        .filter(r => typeof r === 'number');

      const reviewCount = ratings.length;

      const averageRating =
        reviewCount > 0
          ? parseFloat((ratings.reduce((sum, r) => sum + r, 0) / reviewCount).toFixed(1))
          : null;

      return {
        ...user.toObject(),
        averageRating,
        reviewCount,
        ordersCompletedCount: completedOrders.length,
      };
    }));

    res.status(200).json({ success: true, users: usersWithAnalytics });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ success: false, message: 'Server error while searching users.' });
  }
};



export const changePasswordRequest = async (req, res, next) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    // Ensure user is authenticated
    if (!req.user || !req.user._id) {
      return res.status(401).json({ message: "Unauthorized request." });
    }

    // Required fields check
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: "All fields are required." });
    }

    // New password and confirm password match check
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match." });
    }

    // Validate new password strength
    const errors = validatePassword(newPassword);
    if (errors.length > 0) {
      return res.status(400).json({ message: "Weak password.", errors });
    }

    // Find the user
    const user = await User.findById(req.user._id).select("+password");
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Validate current password
    const isMatch = await bcrypt.compare(currentPassword, user.password || "");
    if (!isMatch) {
      return res.status(401).json({ message: "Incorrect current password." });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    user.password = hashedPassword;
    await user.save();

    // ✅ Optionally: Send confirmation email
    try {
      const mailOptions = {
        from: `"Service Marketplace" <${process.env.ADMIN_EMAIL}>`,
        to: user.email,
        subject: "Your Password Has Been Changed",
        html: generateEmailTemplate({
          firstName: user.firstName,
          subject: "Password Changed Successfully",
          content: `
            <p>Hello ${user.firstName},</p>
            <p>This is a confirmation that your account password was successfully updated.</p>
            <p>If you did not perform this action, please reset your password immediately or contact support.</p>
          `,
        }),
      };

      await transporter.sendMail(mailOptions);
      console.log("✅ Password change confirmation email sent to:", user.email);
    } catch (emailError) {
      console.error("🚨 Failed to send confirmation email:", emailError);
      // Don’t block response if email fails
    }

    return res.status(200).json({ message: "Password updated successfully." });

  } catch (error) {
    console.error("🚨 changePasswordRequest error:", error);
    next(error);
  }
};
