'use strict';

const router = require('express').Router();
const controller = require('../controllers/featuredItemsController');

// Public route - get random 4 featured items
router.get('/', controller.getFeatured);

module.exports = router;
