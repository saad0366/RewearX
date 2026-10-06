'use strict';

const router = require('express').Router();
const heroBannerController = require('../controllers/heroBannerController');
const { uploadSingle } = require('../middleware/uploadMiddleware');
const { authenticate } = require('../middleware/authMiddleware');
const { requireAdmin } = require('../middleware/rbacMiddleware');

// Public route - get active banners for client
router.get('/active', heroBannerController.getActiveBanners);

// Admin routes
router.use(authenticate, requireAdmin);

router.get('/', heroBannerController.listAllBanners);
router.get('/:id', heroBannerController.getBannerById);
router.post('/', uploadSingle('image'), heroBannerController.createBanner);
router.put('/:id', uploadSingle('image'), heroBannerController.updateBanner);
router.delete('/:id', heroBannerController.deleteBanner);
router.post('/reorder', heroBannerController.reorderBanners);

module.exports = router;
