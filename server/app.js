'use strict';

const express = require('express');
const morgan = require('morgan');
const path = require('path');
const env = require('./config/env');
const logger = require('./utils/logger');
const corsMiddleware = require('./middleware/corsMiddleware');
const { standardLimiter } = require('./middleware/rateLimiter');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const apiRoutes = require('./routes');
const passport = require('./config/passport');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

// Security & parsing
app.use(corsMiddleware);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(passport.initialize());

// OAuth provider codes/state are credentials: never include these URLs in request logs.
const skipOAuthLog = req => req.path.startsWith(`/api/${env.apiVersion}/auth/google`);

// HTTP request logging
if (env.isDevelopment) {
  app.use(morgan('dev', { skip: skipOAuthLog }));
} else {
  app.use(
    morgan('combined', {
      skip: skipOAuthLog,
      stream: { write: (msg) => logger.info(msg.trim()) },
    })
  );
}

// Health check
app.get('/health', (_req, res) =>
  res.json({
    success: true,
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    env: env.nodeEnv,
  })
);

app.get('/', (_req, res) =>
  res.json({
    success: true,
    name: 'ReWearX Backend API',
    version: '1.0.0',
    docs: `/api/${env.apiVersion}`,
  })
);

// Static uploads (for any local-only fallback assets)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rate limit on the entire API
app.use(`/api/${env.apiVersion}`, standardLimiter, apiRoutes);

// 404 + error handler
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
