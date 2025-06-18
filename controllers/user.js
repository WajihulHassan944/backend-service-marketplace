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
  const { token } = req.body;

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
      profileUrl: picture,
      verified: true,
      isNotificationsEnabled: true,
      isSubscribed: true,
      isAgreed: true,
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

    // Determine top role
    const roles = user.role || [];
    const topRole = roles.includes("seller") ? "seller" : "buyer";

    sendCookie(user, res, `Welcome back, ${user.firstName}`, 200, {
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

    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }

    await user.deleteOne();

    res.status(200).json({
      success: true,
      message: `User ${user.firstName} ${user.lastName} deleted successfully.`,
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

    const cleanedUser = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      profileUrl: user.profileUrl,
      email: user.email,
      country: user.country,
      role: user.role,
      verified: user.verified,
      blocked: user.blocked,
      createdAt: user.createdAt,
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

export const register = async (req, res, next) => {
  try {
    const {
      firstName,
      lastName,
      email,
      password,
      country,
      role,
      sellerDetails, // Expecting full object from Postman
    } = req.body;

    const existingUser = await User.findOne({ email });

    // Special handling: If user exists and role is 'seller'
    if (existingUser && role === "seller") {
      const updateData = {};

      if (sellerDetails?.linkedUrl || sellerDetails?.speciality) {
        updateData.sellerDetails = {
          ...existingUser.sellerDetails,
          ...(sellerDetails?.linkedUrl && { linkedUrl: sellerDetails.linkedUrl }),
          ...(sellerDetails?.speciality && { speciality: sellerDetails.speciality }),
        };
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


    let profileUrl = "";
    if (req.file) {
      const bufferStream = streamifier.createReadStream(req.file.buffer);
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

    if (isSeller && sellerDetails) {
      newUserData.sellerDetails = {};
      if (sellerDetails.linkedUrl) newUserData.sellerDetails.linkedUrl = sellerDetails.linkedUrl;
      if (sellerDetails.speciality) newUserData.sellerDetails.speciality = sellerDetails.speciality;
    }

    const user = await User.create(newUserData);

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
await Wallet.create({
      userId: user._id,
    });
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

  } catch (error) {
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
      return res.redirect("http://dotask-service-marketplace.vercel.app/?verified=already");
    }

    user.verified = true;
    await user.save();

    res.redirect("http://dotask-service-marketplace.vercel.app/?verified=success");
  } catch (error) {
    console.error(error);
    res.redirect("http://dotask-service-marketplace.vercel.app/?verified=fail");
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

  const { linkedUrl, speciality } = user.sellerDetails || {};

  const mailOptions = {
    from: `"Service Marketplace Admin" <${process.env.ADMIN_EMAIL}>`,
    to: process.env.ADMIN_EMAIL,
    subject: "New Seller Registration Pending Approval",
    html: generateEmailTemplate({
      firstName: "Admin",
      subject: "New Seller Registration",
      content: `
        <p><strong>${user.firstName} ${user.lastName}</strong> has registered as a <strong>seller</strong>.</p>
        <p><strong>Email:</strong> ${user.email}</p>
        <p><strong>Country:</strong> ${user.country}</p>
        ${linkedUrl ? `<p><strong>LinkedIn:</strong> <a href="${linkedUrl}" target="_blank">${linkedUrl}</a></p>` : ""}
        ${speciality ? `<p><strong>Speciality:</strong> ${speciality}</p>` : ""}
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


export const getMyProfile = (req, res) => {
  res.status(200).json({
    success: true,
    user: req.user,
  });
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