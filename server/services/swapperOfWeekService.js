'use strict';

const { SwapperOfWeek, User, SwapRequest, sequelize } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

/**
 * Calculate and update top swappers for the current week
 * Runs every Sunday night at 11:59 PM
 */
const updateSwapperOfWeek = async () => {
  try {
    logger.info('Starting Swapper of the Week calculation...');

    // Get the current date range for the week (last 7 days)
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 7);

    // Query to get top 4 swappers with most completed swaps count
    const topSwappers = await sequelize.query(
      `SELECT 
        u.id,
        u.name,
        u.profile_image,
        COUNT(DISTINCT sr.id) as total_swaps,
        AVG(r.rating) as avg_rating
      FROM users u
      INNER JOIN swap_requests sr ON (u.id = sr.sender_id OR u.id = sr.receiver_id)
      LEFT JOIN reviews r ON (u.id = r.reviewee_id)
      WHERE sr.status = 'completed'
        AND sr.updated_at >= :startDate
        AND sr.updated_at <= :endDate
      GROUP BY u.id, u.name, u.profile_image
      ORDER BY total_swaps DESC, avg_rating DESC
      LIMIT 4`,
      {
        replacements: { startDate, endDate },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    if (topSwappers.length === 0) {
      logger.info('No users with completed swaps this week');
      return { success: true, message: 'No swappers this week' };
    }

    // Clear existing records for the current week
    await SwapperOfWeek.destroy({ where: {} });

    // Insert new top swappers
    const records = topSwappers.map((swapper, index) => ({
      userId: swapper.id,
      rank: index + 1,
      totalSwaps: parseInt(swapper.total_swaps, 10),
      weekStartDate: startDate.toISOString().split('T')[0],
      weekEndDate: endDate.toISOString().split('T')[0],
    }));

    await SwapperOfWeek.bulkCreate(records);

    logger.info(`Updated Swapper of the Week: ${topSwappers.length} users ranked`);
    return { success: true, count: topSwappers.length, swappers: topSwappers };
  } catch (error) {
    logger.error('Error updating Swapper of the Week:', error);
    throw error;
  }
};

/**
 * Get current swappers of the week
 */
const getCurrentSwappers = async () => {
  try {
    const swappers = await SwapperOfWeek.findAll({
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'profileImage'],
        },
      ],
      order: [['rank', 'ASC']],
      limit: 4,
    });

    // Filter out records where user is null (e.g. deleted user)
    const validSwappers = swappers.filter((s) => s && s.user);

    // Get rating for each user
    const swappersWithRating = await Promise.all(
      validSwappers.map(async (swapper) => {
        const avgRating = await sequelize.query(
          `SELECT AVG(rating) as avg_rating 
           FROM reviews 
           WHERE reviewee_id = :userId`,
          {
            replacements: { userId: swapper.userId },
            type: sequelize.QueryTypes.SELECT,
          }
        );

        const userName = swapper.user?.name || 'Swapper';

        return {
          id: swapper.user.id,
          name: userName,
          username: `@${userName.toLowerCase().replace(/\s+/g, '')}`,
          image: swapper.user.profileImage || null,
          swaps: swapper.totalSwaps,
          rating: parseFloat(avgRating[0]?.avg_rating || 0),
          rank: swapper.rank,
          badge: getBadgeForRank(swapper.rank),
        };
      })
    );

    return swappersWithRating;
  } catch (error) {
    logger.error('Error fetching current swappers:', error);
    throw error;
  }
};

/**
 * Get badge label based on rank
 */
const getBadgeForRank = (rank) => {
  if (rank === 1) return 'Top Swapper';
  if (rank === 2) return 'Runner Up';
  if (rank === 3) return 'Rising Star';
  return 'Active Swapper';
};

module.exports = {
  updateSwapperOfWeek,
  getCurrentSwappers,
};
