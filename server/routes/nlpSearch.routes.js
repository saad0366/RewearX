'use strict';

const router = require('express').Router();
const { search } = require('../controllers/nlpSearchController');
const { optionalAuth } = require('../middleware/authMiddleware');

router.get('/', optionalAuth, search);

module.exports = router;
