'use strict';

require('dotenv').config();
const { connectDB } = require('../config/database');
const { updateSwapperOfWeek } = require('../services/swapperOfWeekService');
const logger = require('./logger');

const run = async () => {
  try {
    await connectDB();
    logger.info('Manually triggering Swapper of the Week update...');
    
    const result = await updateSwapperOfWeek();
    
    logger.info('Result:', result);
    logger.info('Swapper of the Week updated successfully!');
    
    process.exit(0);
  } catch (err) {
    logger.error('Update failed:', err);
    process.exit(1);
  }
};

run();
