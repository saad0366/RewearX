'use strict';

const success = (res, statusCode = 200, data = null, message = 'OK', extra = {}) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    ...extra,
  });
};

const paginated = (res, statusCode = 200, data = [], pagination = {}, message = 'OK') => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    pagination,
  });
};

const error = (res, statusCode = 500, message = 'Internal server error', details = null) => {
  return res.status(statusCode).json({
    success: false,
    message,
    ...(details ? { details } : {}),
  });
};

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const buildPagination = (totalItems, page, limit) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / Math.max(1, limit)));
  return {
    totalItems,
    totalPages,
    currentPage: page,
    pageSize: limit,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
};

module.exports = { success, paginated, error, asyncHandler, buildPagination };
