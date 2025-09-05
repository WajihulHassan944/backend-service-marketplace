import jwt from "jsonwebtoken";

export const sendCookie = (user, res, message, statusCode = 200, data = {}) => {
  // token expires in 30 minutes
  const token = jwt.sign(
    { _id: user._id },
    process.env.JWT_SECRET,
    { expiresIn: "30m" }
  );

  res
    .status(statusCode)
    .cookie("token", token, {
      httpOnly: true,
      maxAge: 30 * 60 * 1000, // 30 minutes
      sameSite: process.env.NODE_ENV === "Development" ? "lax" : "none",
      secure: process.env.NODE_ENV === "Development" ? false : true,
    })
    .json({
      success: true,
      message,
      ...data,
    });
};
