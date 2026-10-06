'use strict';

const router = require('express').Router();

router.use('/auth', require('./auth.routes'));
router.use('/users', require('./users.routes'));
router.use('/items', require('./items.routes'));
router.use('/swaps', require('./swaps.routes'));
router.use('/conversations', require('./conversations.routes'));
router.use('/notifications', require('./notifications.routes'));
router.use('/reviews', require('./reviews.routes'));
router.use('/reports', require('./reports.routes'));
router.use('/saved', require('./saved.routes'));
router.use('/categories', require('./categories.routes'));
router.use('/recommendations', require('./recommendations.routes'));
router.use('/search', require('./search.routes'));
router.use('/nlp-search', require('./nlpSearch.routes'));
router.use('/hero-banners', require('./heroBanners.routes'));
router.use('/swapper-of-week', require('./swapperOfWeek.routes'));
router.use('/featured-items', require('./featuredItems.routes'));
router.use('/disputes', require('./disputeRoutes'));
router.use('/admin', require('./admin.routes'));

router.get('/', (_req, res) =>
  res.json({
    success: true,
    message: 'ReWearX API v1',
    endpoints: [
      '/auth',
      '/users',
      '/items',
      '/swaps',
      '/conversations',
      '/notifications',
      '/reviews',
      '/reports',
      '/saved',
      '/categories',
      '/recommendations',
      '/search',
      '/hero-banners',
      '/admin',
    ],
  })
);

module.exports = router;
