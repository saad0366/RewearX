'use strict';

const cors = require('cors');
const env = require('../config/env');
const logger = require('../utils/logger');

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (env.corsOrigins.includes('*')) return callback(null, true);
    if (env.corsOrigins.includes(origin)) return callback(null, true);
    try {
      const hostname = new URL(origin).hostname;
      if (hostname.endsWith('.vercel.app') || hostname === 'localhost') {
        return callback(null, true);
      }
    } catch (_) {}
    logger.warn(`CORS blocked origin: ${origin}`);
    return callback(new Error(`CORS policy: Origin ${origin} not allowed.`), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'X-Total-Count'],
  maxAge: 86400,
};

module.exports = cors(corsOptions);
