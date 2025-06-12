import multer from "multer";
import path from "path";

// Use memory storage for direct Cloudinary streaming
const storage = multer.memoryStorage();

const orderUpload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max size
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = file.mimetype;

    // Accept common types: zip, doc/docx, pdf, png, jpg, jpeg
    const allowedMimes = [
      "application/zip",
      "application/x-zip-compressed",
      "application/pdf",
      "application/msword",                     // .doc
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
      "image/jpeg",
      "image/png",
    ];

    const allowedExts = [".zip", ".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png"];

    if (allowedMimes.includes(mime) && allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only zip, PDF, Word, JPG, and PNG files are allowed."));
    }
  },
});

export default orderUpload;
