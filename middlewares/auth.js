import { User } from "../models/user.js";
import jwt from "jsonwebtoken";

export const isAuthenticated = async (req, res, next) => {
  const { token } = req.cookies;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Login First",
    });
  }

  try {
    // verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // attach user to req
    req.user = await User.findById(decoded._id);

    // 🔄 refresh token to extend session (only if still valid)
    const newToken = jwt.sign(
      { _id: decoded._id },
      process.env.JWT_SECRET,
      { expiresIn: "30m" } // reset 30 min
    );

    res.cookie("token", newToken, {
      httpOnly: true,
      maxAge: 30 * 60 * 1000, // 30 minutes
      sameSite: process.env.NODE_ENV === "Development" ? "lax" : "none",
      secure: process.env.NODE_ENV === "Development" ? false : true,
    });

    next();
  } catch (err) {
    // ❌ token expired or invalid → clear cookie
    res.clearCookie("token", {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "Development" ? "lax" : "none",
      secure: process.env.NODE_ENV === "Development" ? false : true,
    });

    return res.status(440).json({
      success: false,
      code: "TOKEN_EXPIRED",
      message: "Session expired. Please log in again.",
    });
  }
};


export const isAuthenticatedSuperAdmin = async (req, res, next) => {
  try {
    const { token } = req.cookies;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Login required by superadmin, invalid operation",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded._id);

    if (!user || !user.role.includes("superadmin")) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Superadmin only.",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};
