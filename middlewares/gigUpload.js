// middlewares/gigUpload.js
import multer from "multer";
import path from "path";

// Memory storage for direct Cloudinary streaming
const storage = multer.memoryStorage();

const gigUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max per file
  fileFilter: (req, file, cb) => {
    const imageTypes = /jpeg|jpg|png/;
    const isImage = imageTypes.test(file.mimetype);
    const isPdf = file.mimetype === "application/pdf";

    const ext = path.extname(file.originalname).toLowerCase();

    if (
      (isImage && imageTypes.test(ext)) ||
      (isPdf && ext === ".pdf")
    ) {
      return cb(null, true);
    }

    cb(new Error("Only JPG, PNG images and a single PDF file are allowed."));
  },
});

export default gigUpload;
