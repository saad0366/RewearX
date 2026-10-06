'use strict';

const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const env = require('../config/env');

const notFoundHandler = (req, _res, next) => {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
};

const errorHandler = (err, req, res, _next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let details = err.details || null;

  // Sequelize validation
  if (err.name === 'SequelizeValidationError' || err.name === 'SequelizeUniqueConstraintError') {
    statusCode = 422;
    message = 'Validation failed';
    details = err.errors?.map((e) => ({ field: e.path, message: e.message, value: e.value }));
  }

  if (err.name === 'SequelizeForeignKeyConstraintError') {
    statusCode = 409;
    message = 'Referenced resource not found or in use.';
  }

  if (err.name === 'SequelizeDatabaseError') {
    statusCode = 500;
    message = env.isProduction ? 'Database error' : err.message;
  }

  // JWT
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }

  if (err.name === 'MulterError') {
    statusCode = 400;
    message = `Upload error: ${err.message}`;
  }

  const oauthRequest = req.path?.startsWith(`/api/${env.apiVersion}/auth/google`);
  const logCtx = {
    method: req.method,
    url: oauthRequest ? req.path : req.originalUrl,
    ip: req.ip,
    userId: req.user?.id,
    statusCode,
  };

  if (statusCode >= 500) {
    logger.error(oauthRequest ? 'Google sign-in failed.' : message, oauthRequest ? logCtx : { ...logCtx, stack: err.stack, errName: err.name, errMsg: err.message });
  } else {
    logger.warn(oauthRequest ? 'Google sign-in rejected.' : message, logCtx);
  }

  res.status(statusCode).json({
    success: false,
    message: oauthRequest && statusCode >= 500 ? 'Google sign-in temporarily unavailable.' : message,
    ...(details ? { details } : {}),
    ...(!oauthRequest && env.isDevelopment && statusCode >= 500 ? { stack: err.stack } : {}),
  });
};

module.exports = { notFoundHandler, errorHandler };
