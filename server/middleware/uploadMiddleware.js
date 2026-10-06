'use strict';

const multer = require('multer');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

const fileFilter = (_req, file, cb) => {
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(ApiError.badRequest(`Invalid file type. Allowed: ${allowedMimeTypes.join(', ')}`));
  }
  cb(null, true);
};

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: env.upload.maxFileSizeMb * 1024 * 1024,
    files: env.upload.maxImagesPerItem,
  },
});

module.exports = {
  upload,
  uploadSingle: (field = 'image') => upload.single(field),
  uploadMultiple: (field = 'images', max = env.upload.maxImagesPerItem) =>
    upload.array(field, max),
};
