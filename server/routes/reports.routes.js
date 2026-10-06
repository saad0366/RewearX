'use strict';

const router = require('express').Router();
const reportController = require('../controllers/reportController');
const validators = require('../utils/validators');
const { authenticate } = require('../middleware/authMiddleware');

router.post('/', authenticate, validators.createReport, reportController.create);

module.exports = router;
