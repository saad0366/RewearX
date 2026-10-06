'use strict';

const { Sequelize } = require('sequelize');
const env = require('./env');
const logger = require('../utils/logger');

const sequelize = new Sequelize(env.db.name, env.db.user, env.db.password, {
  host: env.db.host,
  port: env.db.port,
  dialect: env.db.dialect,
  logging: false, // Avoid logging SQL literals containing credentials or personal records.
  pool: {
    max: 15,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
  define: {
    timestamps: true,
    underscored: true,
    freezeTableName: false,
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
  },
  dialectOptions: {
    charset: 'utf8mb4',
    dateStrings: true,
    typeCast: true,
  },
  timezone: '+00:00',
});

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    logger.info('MySQL connection established successfully.');

    // Schema changes are explicit and backup-gated; normal startup is read-only.

    return sequelize;
  } catch (error) {
    logger.error('Unable to connect to MySQL:', error.message);
    throw error;
  }
};

const syncDB = async (options = {}) => {
  try {
    await sequelize.sync(options);
    logger.info(`Database synced (alter=${!!options.alter}, force=${!!options.force}).`);
  } catch (error) {
    logger.error('DB sync failed:', error.message);
    throw error;
  }
};

module.exports = { sequelize, connectDB, syncDB, Sequelize };
