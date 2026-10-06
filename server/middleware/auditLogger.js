'use strict';

const logger = require('../utils/logger');

const auditAdminAction = (req, _res, next) => {
  const action = `${req.method} ${req.originalUrl}`;
  logger.info('ADMIN_ACTION', {
    adminId: req.user?.id,
    adminEmail: req.user?.email,
    action,
    body: sanitize(req.body),
    params: req.params,
    ip: req.ip,
    timestamp: new Date().toISOString(),
  });
  next();
};

const sanitize = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  const clone = { ...obj };
  ['password', 'token', 'newPassword', 'currentPassword'].forEach((k) => {
    if (k in clone) clone[k] = '[REDACTED]';
  });
  return clone;
};

module.exports = { auditAdminAction };
