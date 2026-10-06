'use strict';

const rateLimit = require('express-rate-limit');
const env = require('../config/env');

// Skip rate limiting entirely in development to avoid blocking local testing.
// In production, the configured limits apply.
const skipInDev = () => env.isDevelopment;

const standardLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInDev,
  message: {
    success: false,
    message: 'Too many requests. Please try again later.',
  },
});

const authLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: skipInDev,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again in 15 minutes.',
  },
});

const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  skip: skipInDev,
  message: {
    success: false,
    message: 'Rate limit exceeded for this action.',
  },
});

module.exports = { standardLimiter, authLimiter, strictLimiter };
