'use strict';

const { cloudinary, isConfigured } = require('../config/cloudinary');
const env = require('../config/env');
const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');

const streamUpload = (buffer, options = {}) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: env.cloudinary.folder, resource_type: 'image', ...options },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });

const uploadImage = async (file, folder = null) => {
  if (!isConfigured()) {
    throw ApiError.internal('Cloudinary is not configured. Please set environment variables.');
  }
  if (!file?.buffer) {
    throw ApiError.badRequest('Invalid file upload.');
  }

  const result = await streamUpload(file.buffer, {
    folder: folder || env.cloudinary.folder,
    transformation: [
      { width: 1200, height: 1200, crop: 'limit' },
      { quality: 'auto', fetch_format: 'auto' },
    ],
  });

  return {
    url: result.secure_url,
    publicId: result.public_id,
    width: result.width,
    height: result.height,
    bytes: result.bytes,
    format: result.format,
  };
};

const uploadMultiple = async (files, folder = null) => {
  if (!Array.isArray(files) || files.length === 0) return [];
  return Promise.all(files.map((f) => uploadImage(f, folder)));
};

const deleteImage = async (publicId, { throwOnFailure = false } = {}) => {
  if (!isConfigured()) {
    if (throwOnFailure) throw ApiError.internal('Cloudinary is not configured.');
    return null;
  }
  if (!publicId) return null;
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    if (throwOnFailure && !['ok', 'not found'].includes(result?.result)) throw new Error('Asset deletion was not confirmed.');
    return result;
  } catch (err) {
    logger.error(`Cloudinary delete failed for ${publicId}: ${err.message}`);
    if (throwOnFailure) throw ApiError.internal('Image deletion failed. Please retry.');
    return null;
  }
};

const optimizeUrl = (url, opts = {}) => {
  if (!url) return url;
  const transforms = [];
  if (opts.width) transforms.push(`w_${opts.width}`);
  if (opts.height) transforms.push(`h_${opts.height}`);
  transforms.push('q_auto', 'f_auto');
  return url.replace('/upload/', `/upload/${transforms.join(',')}/`);
};

module.exports = { uploadImage, uploadMultiple, deleteImage, optimizeUrl };
