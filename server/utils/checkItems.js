'use strict';

require('dotenv').config();
const { sequelize, connectDB } = require('../config/database');
const logger = require('./logger');

const run = async () => {
  try {
    await connectDB();
    
    // Check available items
    const result = await sequelize.query(
      `SELECT 
        ci.id,
        ci.title,
        ci.is_available,
        u.name as owner_name
      FROM clothing_items ci
      LEFT JOIN users u ON ci.user_id = u.id
      WHERE ci.is_available = 1
      ORDER BY ci.created_at DESC
      LIMIT 10`,
      { type: sequelize.QueryTypes.SELECT }
    );
    
    logger.info(`Found ${result.length} available items:`);
    result.forEach(item => {
      logger.info(`ID: ${item.id}, Title: ${item.title}, Owner: ${item.owner_name}`);
    });
    
    if (result.length === 0) {
      logger.warn('No available items in database! Please add some items first.');
    }
    
    process.exit(0);
  } catch (err) {
    logger.error('Check failed:', err);
    process.exit(1);
  }
};

run();
