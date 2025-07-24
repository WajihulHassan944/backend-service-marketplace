import { Client } from "../models/clients.js";
import streamifier from "streamifier";
import cloudinary from "../utils/cloudinary.js";
import ErrorHandler from "../middlewares/error.js";

export const createClient = async (req, res, next) => {
  try {
    const { name, country } = req.body;
    const user = req.user._id;

    if (!name || !country) {
      return next(new ErrorHandler("Name and country are required", 400));
    }

    let profileUrl = "";
   if (req.file) {
  const bufferStream = streamifier.createReadStream(req.file.buffer);

      const cloudinaryUpload = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "client_profiles" },
          (error, result) => {
            if (result) resolve(result);
            else reject(error);
          }
        );
        bufferStream.pipe(stream);
      });
      profileUrl = cloudinaryUpload.secure_url;
    } else {
      return next(new ErrorHandler("Profile image is required", 400));
    }

    const newClient = await Client.create({ user, name, country, profileUrl });
    res.status(201).json({ success: true, client: newClient });

  } catch (error) {
    next(error);
  }
};


export const getAllClients = async (req, res, next) => {
  try {
    const clients = await Client.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, clients });
  } catch (error) {
    next(error);
  }
};


export const getClientById = async (req, res, next) => {
  try {
    const client = await Client.findOne({ _id: req.params.id, user: req.user._id });
    if (!client) return next(new ErrorHandler("Client not found", 404));
    res.status(200).json({ success: true, client });
  } catch (error) {
    next(error);
  }
};


export const updateClient = async (req, res, next) => {
  try {
    const { name, country } = req.body;
    let updateData = {};

    if (name) updateData.name = name;
    if (country) updateData.country = country;

  if (req.file) {
  const bufferStream = streamifier.createReadStream(req.file.buffer);

      const cloudinaryUpload = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "client_profiles" },
          (error, result) => {
            if (result) resolve(result);
            else reject(error);
          }
        );
        bufferStream.pipe(stream);
      });
      updateData.profileUrl = cloudinaryUpload.secure_url;
    }

    const client = await Client.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      updateData,
      { new: true }
    );

    if (!client) return next(new ErrorHandler("Client not found", 404));
    res.status(200).json({ success: true, client });

  } catch (error) {
    next(error);
  }
};


export const deleteClient = async (req, res, next) => {
  try {
    const client = await Client.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!client) return next(new ErrorHandler("Client not found", 404));
    res.status(200).json({ success: true, message: "Client deleted successfully" });
  } catch (error) {
    next(error);
  }
};
