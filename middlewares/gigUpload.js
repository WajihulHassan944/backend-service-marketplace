import multer from "multer";
import path from "path";

// Use memory storage for direct Cloudinary streaming
const storage = multer.memoryStorage();

const gigUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max per file
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const isImage = /jpeg|jpg|png/.test(file.mimetype) && /\.(jpg|jpeg|png)$/.test(ext);
    const isPdf = file.mimetype === "application/pdf" && ext === ".pdf";

    if (isImage || isPdf) {
      cb(null, true);
    } else {
      cb(new Error("Only JPG, PNG images and one PDF file are allowed."));
    }
  },
});

export default gigUpload;
