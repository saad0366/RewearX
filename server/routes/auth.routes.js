'use strict';

const router = require('express').Router();
const authController = require('../controllers/authController');
const validators = require('../utils/validators');
const { authenticate } = require('../middleware/authMiddleware');
const { authLimiter } = require('../middleware/rateLimiter');
const passport = require('passport');
const googleLogin = require('../services/googleLoginService');
const env = require('../config/env');
const oauthConfigured=(req,res,next)=> process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? next() : res.status(503).json({success:false,message:'Google sign-in is not configured.'});

router.post('/register', authLimiter, validators.register, authController.register);
router.post('/login', authLimiter, validators.login, authController.login);
router.post('/logout', authenticate, authController.logout);

// Google OAuth
router.get('/google', authLimiter, oauthConfigured, (req, res, next) => {
  try {
    const state = googleLogin.begin(req, res);
    return passport.authenticate('google', { session: false, scope: ['openid', 'email', 'profile'], state })(req, res, next);
  } catch (err) { next(err); }
});
router.post('/google/exchange', authLimiter, oauthConfigured, authController.googleExchange);
router.get(
  '/google/callback',
  authLimiter,
  oauthConfigured,
  (req, res, next) => passport.authenticate('google', { session: false }, (err, user) => {
    if (err || !user) return res.redirect(`${env.clientUrl}/login?error=Google%20authentication%20failed`);
    req.logIn(user, { session: false }, loginError => {
      if (loginError) return res.redirect(`${env.clientUrl}/login?error=Google%20authentication%20failed`);
      next();
    });
  })(req, res, next),
  authController.googleCallback
);

// OTP email verification (pre-signup, no auth token yet)
router.post('/verify-otp', authLimiter, authController.verifyOtp);
router.post('/resend-otp', authLimiter, authController.resendOtp);

router.post('/forgot-password', authLimiter, validators.forgotPassword, authController.forgotPassword);
router.post('/verify-reset-otp', authLimiter, validators.verifyResetOtp, authController.verifyResetOtp);
router.post('/reset-password', authLimiter, validators.resetPassword, authController.resetPassword);
router.get('/verify-email/:token', validators.verifyEmail, authController.verifyEmail);
router.post('/resend-verification', authenticate, authController.resendVerification);

router.post('/refresh', authController.refresh);
router.post('/change-password', authenticate, authController.changePassword);
router.get('/me', authenticate, authController.me);

module.exports = router;
