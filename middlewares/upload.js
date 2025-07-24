// middleware/upload.js
import multer from 'multer';
import path from 'path';

// Memory storage for Cloudinary upload (no saving to disk)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const imageTypes = /jpeg|jpg|png/;
    const docTypes = /pdf|doc|docx/;

    const ext = path.extname(file.originalname).toLowerCase().slice(1);
    const isImage = imageTypes.test(ext);
    const isDoc = docTypes.test(ext);

    const allowedMimeTypes = [
      'image/jpeg', 'image/jpg', 'image/png',
      'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if ((isImage || isDoc) && allowedMimeTypes.includes(file.mimetype)) {
      return cb(null, true);
    }

    cb(new Error("Only image (jpeg, jpg, png) or document (pdf, doc, docx) files are allowed"));
  },
});


export default upload;
