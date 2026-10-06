'use strict';

const { verifyAccessToken } = require('../utils/tokens');
const { User } = require('../models');
const ApiError = require('../utils/ApiError');
const { asyncHandler } = require('../utils/response');

const extractToken = (req) => {
  const header = req.headers.authorization || req.headers.Authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  if (req.query && req.query.token) return req.query.token;
  return null;
};

const authenticate = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized('Authentication required.');

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Token expired.');
    }
    throw ApiError.unauthorized('Invalid token.');
  }

  const user = await User.findByPk(decoded.id);
  if (!user) throw ApiError.unauthorized('User not found.');
  if (user.status === 'blocked') {
    throw ApiError.forbidden('Account blocked. Contact support.');
  }

  req.user = user;
  req.token = token;
  next();
});

const optionalAuth = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) return next();
  try {
    const decoded = verifyAccessToken(token);
    const user = await User.findByPk(decoded.id);
    if (user && user.status === 'active') {
      req.user = user;
      req.token = token;
    }
  } catch (_) {
    // Silent on optional auth
  }
  next();
});

module.exports = { authenticate, optionalAuth };
