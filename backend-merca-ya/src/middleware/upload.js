const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { HttpError } = require('../utils/http');

const uploadDir = process.env.VERCEL
  ? path.join(require('os').tmpdir(), 'mercaya-uploads')
  : path.join(__dirname, '../../uploads');

fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadDir),
  filename: (_req, file, callback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.webp';
    callback(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safeExt}`);
  },
});

function fileFilter(_req, file, callback) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
    return callback(new HttpError(400, 'Solo se permiten imágenes JPG, PNG o WebP'));
  }
  return callback(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024, files: 6 },
});

function publicUrl(filename) {
  return `/uploads/${filename}`;
}

module.exports = { upload, uploadDir, publicUrl };
