'use strict';

class ApiError extends Error {
  constructor(statusCode, message, details = null, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(msg = 'Bad request', details = null) {
    return new ApiError(400, msg, details);
  }
  static unauthorized(msg = 'Unauthorized', details = null) {
    return new ApiError(401, msg, details);
  }
  static forbidden(msg = 'Forbidden', details = null) {
    return new ApiError(403, msg, details);
  }
  static notFound(msg = 'Not found', details = null) {
    return new ApiError(404, msg, details);
  }
  static conflict(msg = 'Conflict', details = null) {
    return new ApiError(409, msg, details);
  }
  static unprocessable(msg = 'Unprocessable entity', details = null) {
    return new ApiError(422, msg, details);
  }
  static tooMany(msg = 'Too many requests', details = null) {
    return new ApiError(429, msg, details);
  }
  static internal(msg = 'Internal server error', details = null) {
    return new ApiError(500, msg, details);
  }
}

module.exports = ApiError;
