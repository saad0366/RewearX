'use strict';

// Server entry point - email notification handlers enabled

const http = require('http');
const app = require('./app');
const env = require('./config/env');
const logger = require('./utils/logger');
const { connectDB } = require('./config/database');
const { initSocketIO } = require('./sockets');
const { initCronJobs } = require('./utils/cronJobs');

const PORT = env.port;
let learningWorker=null,shuttingDown=false;
const startLearningWorker = () => {
  if (shuttingDown || process.env.IMAGE_LEARNING_ENABLED !== 'true' || env.nodeEnv !== 'development') return;
  learningWorker = require('node:child_process').spawn(process.execPath,
    [require('node:path').join(__dirname,'workers/imageLearningWorker.js')],
    {windowsHide:true,stdio:'ignore',env:{...process.env,IMAGE_LEARNING_PARENT_PID:String(process.pid)}});
  learningWorker.once('exit',()=>{learningWorker=null;if(!shuttingDown)setTimeout(startLearningWorker,5000).unref();});
  learningWorker.once('error',()=>logger.warn('Image learning worker unavailable; listing and inference remain available.'));
  learningWorker.unref();
};

const start = async () => {
  try {
    if (env.jwt.secret.length < 32 || env.jwt.refreshSecret.length < 32 || env.jwt.secret === env.jwt.refreshSecret) throw new Error('Configure distinct JWT_SECRET and JWT_REFRESH_SECRET values of at least 32 characters in the local environment.');
    await connectDB();

    // Schema changes must be explicitly reviewed and backup-gated.
    if (['force','alter'].includes((process.env.DB_SYNC || '').toLowerCase())) {
      throw new Error('Automatic schema synchronization is disabled; use explicit backup-gated migrations.');
    }

    const server = http.createServer(app);

    const io = initSocketIO(server);
    app.set('io', io);

    // Initialize cron jobs
    initCronJobs();
    startLearningWorker();

    server.listen(PORT, () => {
      logger.info(`ReWearX Backend running on http://localhost:${PORT}`);
      logger.info(`API base: http://localhost:${PORT}/api/${env.apiVersion}`);
      logger.info(`Environment: ${env.nodeEnv}`);
    });

    const shutdown = async (signal) => {
      shuttingDown=true;learningWorker?.kill();
      logger.info(`${signal} received. Shutting down...`);
      server.close(() => {
        logger.info('HTTP server closed.');
        process.exit(0);
      });
      setTimeout(() => {
        logger.error('Forcing shutdown.');
        process.exit(1);
      }, 10_000).unref();
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('unhandledRejection', (reason) => {
      console.error('Unhandled rejection:', reason);
      logger.error('Unhandled rejection:', reason);
    });
    process.on('uncaughtException', (err) => {
      console.error('Uncaught exception:', err);
      logger.error('Uncaught exception:', err);
      process.exit(1);
    });
  } catch (err) {
    console.error('Server failed to start:', err);
    logger.error('Server failed to start:', err);
    process.exit(1);
  }
};

start();
