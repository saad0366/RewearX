'use strict';

/**
 * Manual schema sync helper.
 *   node utils/sync.js alter   – applies safe model changes (additive)
 *   node utils/sync.js force   – drops & recreates ALL tables (DESTRUCTIVE)
 */

const db = require('../models');
const logger = require('./logger');

const mode = (process.argv[2] || '').toLowerCase();

const run = async () => {
  if (mode !== 'alter' && mode !== 'force') {
    console.error('Usage: node utils/sync.js [alter|force]');
    process.exit(2);
  }
  try {
    if (mode === 'force') {
      logger.warn('FORCE sync – all tables will be dropped and recreated.');
      await db.sequelize.sync({ force: true });
      logger.info('Schema rebuilt. Existing data has been wiped.');
    } else {
      logger.info('ALTER sync – applying additive model changes.');
      await db.sequelize.sync({ alter: true });
      logger.info('Schema altered.');
    }
    process.exit(0);
  } catch (err) {
    logger.error('Sync failed:', err);
    if (err.parent) logger.error('Cause:', err.parent);
    process.exit(1);
  }
};

run();
