'use strict';

const ApiError = require('../utils/ApiError');

const authorize = (...roles) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized('Authentication required.'));
  if (roles.length && !roles.includes(req.user.role)) {
    return next(ApiError.forbidden('Insufficient permissions.'));
  }
  next();
};

const requireAdmin = authorize('admin');
const requireUser = authorize('user', 'admin');
const requireVerified = (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized('Authentication required.'));
  if (!req.user.isVerified) {
    return next(ApiError.forbidden('Email not verified. Please verify your email.'));
  }
  next();
};

module.exports = { authorize, requireAdmin, requireUser, requireVerified };
