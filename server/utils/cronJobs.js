'use strict';

const cron = require('node-cron');
const { updateSwapperOfWeek } = require('../services/swapperOfWeekService');
const logger = require('./logger');

/**
 * Initialize all cron jobs
 */
const initCronJobs = () => {
  // Update Swapper of the Week every Sunday at 11:59 PM
  // Cron format: second minute hour day month weekday
  // '59 23 * * 0' = 11:59 PM every Sunday (0 = Sunday)
  cron.schedule('59 23 * * 0', async () => {
    logger.info('Running Swapper of the Week cron job...');
    try {
      await updateSwapperOfWeek();
      logger.info('Swapper of the Week updated successfully');
    } catch (error) {
      logger.error('Swapper of the Week cron job failed:', error);
    }
  });

  logger.info('Cron jobs initialized');
  logger.info('- Swapper of the Week: Every Sunday at 11:59 PM');
};

module.exports = { initCronJobs };
