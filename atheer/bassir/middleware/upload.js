/**
 * middleware/upload.js — رفع الفيديوهات على Cloudinary
 * by omar benbouzid dev
 */

const cloudinary            = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer                = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const isVideo = file.mimetype.startsWith('video/');
    return {
      folder:          'baseer',
      resource_type:   isVideo ? 'video' : 'image',
      allowed_formats: ['mp4', 'mov', 'webm', 'avi', 'jpg', 'jpeg', 'png'],
      transformation:  isVideo
        ? [{ quality: 'auto', fetch_format: 'mp4' }]
        : [{ quality: 'auto' }],
    };
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
});

module.exports = { upload, cloudinary };
