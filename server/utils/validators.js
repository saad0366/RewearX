'use strict';

const { body, param, query, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      details: errors.array().map((e) => ({
        field: e.path || e.param,
        message: e.msg,
        value: e.value,
      })),
    });
  }
  next();
};

const passwordRule = body('password')
  .isString()
  .isLength({ min: 8, max: 128 })
  .withMessage('Password must be 8-128 characters')
  .matches(/[A-Za-z]/)
  .withMessage('Password must contain a letter')
  .matches(/\d/)
  .withMessage('Password must contain a digit');

const emailRule = body('email')
  .isEmail()
  .withMessage('Invalid email')
  .normalizeEmail()
  .isLength({ max: 100 });

// Signup: only well-known real providers allowed — blocks fake/disposable domains
const ALLOWED_SIGNUP_DOMAINS = new Set([
  'gmail.com', 'googlemail.com',
  'yahoo.com', 'yahoo.co.uk', 'yahoo.co.in', 'yahoo.com.au', 'ymail.com',
  'outlook.com', 'hotmail.com', 'hotmail.co.uk', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com',
  'protonmail.com', 'proton.me',
  'zoho.com', 'aol.com', 'mail.com',
]);

const registerEmailRule = body('email')
  .isEmail()
  .withMessage('Invalid email address')
  .normalizeEmail()
  .isLength({ max: 100 })
  .custom((value) => {
    const domain = value.split('@')[1]?.toLowerCase();
    if (!domain || !ALLOWED_SIGNUP_DOMAINS.has(domain)) {
      throw new Error('Please use a real email provider (Gmail, Yahoo, Outlook, iCloud, etc.)');
    }
    return true;
  });

const idParamChain = (name = 'id') =>
  param(name).isInt({ min: 1 }).withMessage(`${name} must be a positive integer`).toInt();

const idParamRule = (name = 'id') => [idParamChain(name), handleValidationErrors];

const paginationRules = [
  query('page').optional().isInt({ min: 1 }).withMessage('page must be ≥ 1').toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be 1-100').toInt(),
];

const validators = {
  // ---------- AUTH ----------
  register: [
    body('name').isString().trim().isLength({ min: 2, max: 100 }).withMessage('Name 2-100 chars'),
    registerEmailRule,
    passwordRule,
    body('gender').isIn(['male', 'female', 'other']).withMessage('gender must be male/female/other'),
    body('phone').optional().isString().isLength({ max: 20 }),
    body('dateOfBirth').optional().isISO8601().toDate(),
    handleValidationErrors,
  ],
  login: [
    emailRule,
    body('password').isString().notEmpty().withMessage('password required'),
    handleValidationErrors,
  ],
  forgotPassword: [emailRule, handleValidationErrors],
  verifyResetOtp: [
    emailRule,
    body('otp').isString().isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits'),
    handleValidationErrors,
  ],
  resetPassword: [
    body('token').isString().notEmpty(),
    passwordRule,
    handleValidationErrors,
  ],
  verifyEmail: [param('token').isString().isLength({ min: 32, max: 200 }), handleValidationErrors],

  // ---------- USERS ----------
  updateProfile: [
    body('name').optional().isString().trim().isLength({ min: 2, max: 100 }),
    body('bio').optional().isString().isLength({ max: 1000 }),
    body('phone').optional().isString().isLength({ max: 20 }),
    body('gender').optional().isIn(['male', 'female', 'other']),
    body('profileImage').optional().isString().isLength({ max: 500 }),
    body('dateOfBirth').optional().isISO8601().toDate(),
    handleValidationErrors,
  ],
  updatePreferences: [
    body('preferredGender').optional().isIn(['male', 'female', 'unisex', 'any']),
    body('preferredSizes').optional().isArray(),
    body('preferredColors').optional().isArray(),
    body('preferredStyles').optional().isArray(),
    body('preferredCategories').optional().isArray(),
    body('preferredCondition').optional().isIn(['new', 'like_new', 'good', 'fair', 'any']),
    handleValidationErrors,
  ],

  // ---------- ITEMS ----------
  createItem: [
    body('title').isString().trim().isLength({ min: 2, max: 150 }),
    body('description').optional().isString().isLength({ max: 5000 }),
    body('categoryId').isInt({ min: 1 }).toInt(),
    body('size').isString().isLength({ min: 1, max: 50 }),
    body('gender').isIn(['male', 'female', 'unisex']),
    body('condition').isIn(['new', 'like_new', 'good', 'fair']),
    body('color').optional().isString().isLength({ max: 255 }),
    body('brand').optional().isString().isLength({ max: 100 }),
    body('reviewConfirmed').optional().isBoolean().toBoolean(),
    body('trainingConsent').optional().isBoolean().toBoolean(),
    handleValidationErrors,
  ],
  updateItem: [
    idParamChain('id'),
    body('title').optional().isString().trim().isLength({ min: 2, max: 150 }),
    body('description').optional().isString().isLength({ max: 5000 }),
    body('categoryId').optional().isInt({ min: 1 }).toInt(),
    body('size').optional().isString().isLength({ min: 1, max: 50 }),
    body('gender').optional().isIn(['male', 'female', 'unisex']),
    body('condition').optional().isIn(['new', 'like_new', 'good', 'fair']),
    body('color').optional().isString().isLength({ max: 255 }),
    body('brand').optional().isString().isLength({ max: 100 }),
    body('reviewConfirmed').optional().isBoolean().toBoolean(),
    body('trainingConsent').optional().isBoolean().toBoolean(),
    body('isAvailable').optional().isBoolean().toBoolean(),
    handleValidationErrors,
  ],
  itemSearch: [
    query('q').optional().isString().isLength({ max: 200 }),
    query('categoryId').optional().isInt({ min: 1 }).toInt(),
    query('gender').optional().isIn(['male', 'female', 'unisex']),
    query('condition').optional().isIn(['new', 'like_new', 'good', 'fair']),
    query('size').optional().isString().isLength({ max: 50 }),
    query('color').optional().isString().isLength({ max: 50 }),
    query('brand').optional().isString().isLength({ max: 100 }),
    ...paginationRules,
    handleValidationErrors,
  ],

  // ---------- SWAPS ----------
  createSwap: [
    body('receiverId').isInt({ min: 1 }).toInt(),
    body('senderItemId').isInt({ min: 1 }).toInt(),
    body('receiverItemId').isInt({ min: 1 }).toInt(),
    body('message').optional().isString().isLength({ max: 1000 }),
    handleValidationErrors,
  ],
  updateSwapStatus: [
    idParamChain('id'),
    body('status').isIn(['accepted', 'rejected', 'cancelled', 'completed']),
    handleValidationErrors,
  ],

  // ---------- MESSAGES ----------
  sendMessage: [
    idParamChain('id'),
    body('message').isString().trim().isLength({ min: 1, max: 5000 }),
    body('attachmentUrl').optional().isString().isLength({ max: 500 }),
    handleValidationErrors,
  ],

  // ---------- REVIEWS ----------
  createReview: [
    body('swapRequestId').isInt({ min: 1 }).toInt(),
    body('revieweeId').isInt({ min: 1 }).toInt(),
    body('rating').isInt({ min: 1, max: 5 }).toInt(),
    body('comment').optional().isString().isLength({ max: 2000 }),
    handleValidationErrors,
  ],

  // ---------- REPORTS ----------
  createReport: [
    body('reportedUserId').isInt({ min: 1 }).toInt(),
    body('reportedItemId').optional().isInt({ min: 1 }).toInt(),
    body('reason').isString().isLength({ min: 3, max: 255 }),
    body('description').optional().isString().isLength({ max: 5000 }),
    handleValidationErrors,
  ],

  // ---------- ADMIN ----------
  adminUserStatus: [
    idParamChain('id'),
    body('status').isIn(['active', 'blocked']),
    handleValidationErrors,
  ],
  adminReportStatus: [
    idParamChain('id'),
    body('status').isIn(['pending', 'reviewed', 'resolved']),
    body('adminNotes').optional().isString().isLength({ max: 5000 }),
    handleValidationErrors,
  ],

  // ---------- CATEGORIES ----------
  createCategory: [
    body('name').isString().trim().isLength({ min: 2, max: 100 }),
    body('description').optional().isString().isLength({ max: 500 }),
    body('parentId').optional({ nullable: true, checkFalsy: true }).toInt(),
    body('isActive').optional().isBoolean().toBoolean(),
    handleValidationErrors,
  ],
  updateCategory: [
    idParamChain('id'),
    body('name').optional().isString().trim().isLength({ min: 2, max: 100 }),
    body('description').optional().isString().isLength({ max: 500 }),
    body('parentId').optional({ nullable: true, checkFalsy: true }).toInt(),
    body('isActive').optional().isBoolean().toBoolean(),
    handleValidationErrors,
  ],

  // ---------- ADDRESSES ----------
  createAddress: [
    body('label').optional().isString().isLength({ max: 50 }),
    body('addressLine1').isString().isLength({ min: 3, max: 255 }),
    body('addressLine2').optional().isString().isLength({ max: 255 }),
    body('city').isString().isLength({ min: 2, max: 100 }),
    body('state').optional().isString().isLength({ max: 100 }),
    body('postalCode').optional().isString().isLength({ max: 20 }),
    body('country').isString().isLength({ min: 2, max: 100 }),
    body('isDefault').optional().isBoolean().toBoolean(),
    handleValidationErrors,
  ],

  paginationRules,
  idParamRule,
  idParamChain,
  handleValidationErrors,
};

module.exports = validators;
