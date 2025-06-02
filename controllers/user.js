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



// Util to fetch user info from Google
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

    // Send welcome email to user
    await transporter.sendMail({
      from: `"Service Marketplace Admin" <${process.env.ADMIN_EMAIL}>`,
      to: user.email,
      subject: "Welcome to Service Marketplace!",
      html: `
        <h2>Welcome ${user.firstName}!</h2>
        <p>Thanks for signing up using Google. Start exploring our services today.</p>
      `,
    });

    // Notify admin of new signup
    await transporter.sendMail({
      from: `"Service Marketplace Admin" <${process.env.ADMIN_EMAIL}>`,
      to: process.env.ADMIN_EMAIL,
      subject: "New Google Signup Notification",
      html: `
        <p>A new user signed up via Google:</p>
        <ul>
          <li>Name: ${user.firstName} ${user.lastName}</li>
          <li>Email: ${user.email}</li>
        </ul>
      `,
    });

    sendCookie(user, res, `Welcome ${user.firstName}`, 201);

 } catch (error) {
  console.error("Google Register Error:", error); // full object
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
    } = req.body;

    let user = await User.findOne({ email });
    if (user) return next(new ErrorHandler("User Already Exists", 400));
    if (role === "superadmin") return next(new ErrorHandler("Registration as 'superadmin' is not allowed", 403));

    const hashedPassword = await bcrypt.hash(password, 10);

    const roles = ["buyer"];
    if (role && typeof role === "string" && role !== "buyer") roles.push(role);

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

    user = await User.create({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      country,
      role: roles,
      profileUrl,
      verified: isSeller ? false : isAdmin || false, // Don't verify buyers here
    });

    if (isBuyer) {
      const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "1d" });

      const verificationLink = `https://backend-service-marketplace.vercel.app/api/users/verify-email?token=${token}`;

      await transporter.sendMail({
        from: `"Service Marketplace" <${process.env.ADMIN_EMAIL}>`,
        to: email,
        subject: "Verify Your Email",
        html: `
          <div style="font-family:sans-serif;padding:20px;background:#f9f9f9">
            <h2 style="color:#333;">Hello ${firstName},</h2>
            <p>Thanks for registering as a buyer. Please verify your email by clicking the button below:</p>
            <a href="${verificationLink}" style="padding:10px 20px;background:#4CAF50;color:white;border-radius:5px;text-decoration:none;">Verify Email</a>
            <p style="margin-top:20px;">If you did not sign up, please ignore this email.</p>
          </div>
        `
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
    from: `"Service Marketplace" <${adminEmail}>`,
    to: userEmail,
    subject: "Welcome to Service Marketplace - Admin Access Granted",
    text: `Hi ${firstName},\n\nYou have been registered as an admin on Service Marketplace.\n\nYour credentials:\nEmail: ${userEmail}\nPassword: ${password}\n\nPlease log in and change your password after your first login.\n\nRegards,\nService Marketplace Team`,
  };

  const mailOptionsToAdmin = {
    from: `"Service Marketplace" <${adminEmail}>`,
    to: adminEmail,
    subject: "New Admin Registered",
    text: `A new admin has been registered:\n\nName: ${firstName}\nEmail: ${userEmail}\nPassword: ${password}\n\nPlease ensure this account is monitored appropriately.`,
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

  const mailOptions = {
    from: `"Service Marketplace Admin" <${process.env.ADMIN_EMAIL}>`,
    to: process.env.ADMIN_EMAIL,
    subject: "New Seller Registration Pending Approval",
    html: `
      <h2>New Seller Registration</h2>
      <p><strong>${user.firstName} ${user.lastName}</strong> has registered as a <strong>seller</strong>.</p>
      <p>Email: ${user.email}</p>
      <p>Country: ${user.country}</p>
      <a href="${approvalLink}" style="display: inline-block; padding: 10px 15px; background-color: #28a745; color: white; text-decoration: none; border-radius: 5px; cursor:pointer;">
        Approve Seller
      </a>
    `,
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

    // Send confirmation email to seller
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
      html: `
        <h2>Congratulations ${user.firstName}!</h2>
        <p>Great news — your seller account has been successfully approved on <strong>Service Marketplace</strong>.</p>
        <p>You can now log in and start offering your services to buyers.</p>
        <a href="https://dotask-service-marketplace.vercel.app" style="display:inline-block; padding:10px 20px; background-color:#007bff; color:#fff; text-decoration:none; border-radius:5px; margin-top:10px;">Visit Marketplace</a>
      `,
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
