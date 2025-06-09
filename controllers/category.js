import ErrorHandler from "../middlewares/error.js";
import cloudinary from "../utils/cloudinary.js";
import streamifier from "streamifier";
import { Category } from "../models/category.js"; // Assuming you named your model file category.js

export const createCategory = async (req, res, next) => {
  try {
    const { name, icon } = req.body;

    if (!name || !icon) {
      return next(new ErrorHandler("Name and icon are required.", 400));
    }

    let imageUrl = "";
    if (req.file) {
      const bufferStream = streamifier.createReadStream(req.file.buffer);

      const cloudinaryUpload = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "category_images" },
          (error, result) => {
            if (result) resolve(result);
            else reject(error);
          }
        );
        bufferStream.pipe(stream);
      });

      imageUrl = cloudinaryUpload.secure_url;
    } else {
      return next(new ErrorHandler("Category image is required.", 400));
    }

    const newCategory = await Category.create({
      name,
      icon,
      image: imageUrl,
    });

    res.status(201).json({
      success: true,
      message: "Category created successfully",
      category: newCategory,
    });
  } catch (error) {
    next(error);
  }
};


export const deleteCategory = async (req, res, next) => {
  try {
    const { id } = req.params;

    const category = await Category.findById(id);
    if (!category) {
      return next(new ErrorHandler("Category not found.", 404));
    }

    // Optional: delete image from Cloudinary if needed
    const publicId = category.image?.split("/").pop().split(".")[0];
    if (publicId) {
      await cloudinary.uploader.destroy(`category_images/${publicId}`);
    }

    await Category.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Category deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const getAllCategories = async (req, res, next) => {
  try {
    const categories = await Category.find();

    res.status(200).json({
      success: true,
      categories,
    });
  } catch (error) {
    next(error);
  }
};

export const updateCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, icon } = req.body;

    const category = await Category.findById(id);
    if (!category) {
      return next(new ErrorHandler("Category not found.", 404));
    }

    // If a new file is uploaded
    if (req.file) {
      // Delete the old image from Cloudinary
      const publicId = category.image?.split("/").pop().split(".")[0];
      if (publicId) {
        await cloudinary.uploader.destroy(`category_images/${publicId}`);
      }

      // Upload the new image
      const bufferStream = streamifier.createReadStream(req.file.buffer);
      const cloudinaryUpload = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "category_images" },
          (error, result) => {
            if (result) resolve(result);
            else reject(error);
          }
        );
        bufferStream.pipe(stream);
      });

      category.image = cloudinaryUpload.secure_url;
    }

    // Update name/icon if provided
    if (name) category.name = name;
    if (icon) category.icon = icon;

    await category.save();

    res.status(200).json({
      success: true,
      message: "Category updated successfully",
      category,
    });
  } catch (error) {
    next(error);
  }
};
