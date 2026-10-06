'use strict';

const cloudinary = require('cloudinary').v2;
const env = require('./env');
const logger = require('../utils/logger');

let configured = false;

if (env.cloudinary.cloudName && env.cloudinary.apiKey && env.cloudinary.apiSecret) {
  cloudinary.config({
    cloud_name: env.cloudinary.cloudName,
    api_key: env.cloudinary.apiKey,
    api_secret: env.cloudinary.apiSecret,
    secure: true,
  });
  configured = true;
  logger.info('Cloudinary configured.');
} else {
  logger.warn('Cloudinary credentials missing – image uploads will fail until configured.');
}

module.exports = {
  cloudinary,
  isConfigured: () => configured,
};
