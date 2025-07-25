import ErrorHandler from "../middlewares/error.js";
import { Category } from "../models/category.js";
import { Gig } from "../models/gigs.js";
import { Notification } from "../models/notification.js";
import cloudinary from "../utils/cloudinary.js";
import streamifier from "streamifier";

export const createCategory = async (req, res, next) => {
  try {
    const { name, icon, subcategories } = req.body;

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
      subcategories: Array.isArray(subcategories)
        ? subcategories
        : typeof subcategories === "string"
        ? subcategories.split(",").map((s) => s.trim())
        : [],
    });
 
    await Notification.create({
      user: req.user._id,
      title: "New Category Created",
      description: `Category "${name}" was successfully created.`,
      type: "system",
      targetRole: "superadmin",
      link: "",
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
await Notification.create({
      user: req.user._id,
      title: "Category Deleted",
      description: `Category "${category.name}" was deleted.`,
      type: "system",
      targetRole: "superadmin",
      link: "",
    });
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

    const categoriesWithGigCounts = await Promise.all(
      categories.map(async (cat) => {
        const gigCount = await Gig.countDocuments({ category: cat.name });
        return {
          ...cat.toObject(),
          gigCount,
        };
      })
    );

    res.status(200).json({
      success: true,
      categories: categoriesWithGigCounts,
    });
  } catch (error) {
    next(error);
  }
};



export const updateCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, icon, subcategories } = req.body;

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

    // Update fields if provided
    if (name) category.name = name;
    if (icon) category.icon = icon;
    if (subcategories) {
      category.subcategories = Array.isArray(subcategories)
        ? subcategories
        : typeof subcategories === "string"
        ? subcategories.split(",").map((s) => s.trim())
        : [];
    }

    await category.save();
 await Notification.create({
      user: req.user._id,
      title: "Category Updated",
      description: `Category "${category.name}" was updated.`,
      type: "system",
      targetRole: "superadmin",
      link: "",
    });

    res.status(200).json({
      success: true,
      message: "Category updated successfully",
      category,
    });
  } catch (error) {
    next(error);
  }
};
