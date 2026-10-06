'use strict';

const authService = require('../services/authService');
const googleLogin = require('../services/googleLoginService');
const { User } = require('../models');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const { success, asyncHandler } = require('../utils/response');

const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);
  return success(res, 201, result, 'OTP sent. Please verify your email to complete registration.');
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const result = await authService.login(email, password);
  return success(res, 200, result, 'Login successful.');
});

const logout = asyncHandler(async (_req, res) => {
  // JWT is stateless. Client deletes token.
  return success(res, 200, null, 'Logged out.');
});

const verifyOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  const result = await authService.verifyOtp(email, otp);
  return success(res, 201, result, 'Email verified. Account created successfully.');
});

const resendOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;
  await authService.resendOtp(email);
  return success(res, 200, null, 'OTP resent to your email.');
});

const verifyEmail = asyncHandler(async (req, res) => {
  const user = await authService.verifyEmail(req.params.token);
  return success(res, 200, user, 'Email verified successfully.');
});

const resendVerification = asyncHandler(async (req, res) => {
  await authService.resendVerification(req.user.id);
  return success(res, 200, null, 'Verification email resent.');
});

const forgotPassword = asyncHandler(async (req, res) => {
  await authService.forgotPassword(req.body.email);
  return success(res, 200, null, 'If an account exists, a reset OTP was sent.');
});

const verifyResetOtp = asyncHandler(async (req, res) => {
  const result = await authService.verifyResetOtp(req.body.email, req.body.otp);
  return success(res, 200, result, 'OTP verified. You can now reset your password.');
});

const resetPassword = asyncHandler(async (req, res) => {
  await authService.resetPassword(req.body.token, req.body.password);
  return success(res, 200, null, 'Password reset successfully.');
});

const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ success: false, message: 'refreshToken required.' });
  }
  const result = await authService.refreshAccessToken(refreshToken);
  return success(res, 200, result, 'Token refreshed.');
});

const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  await authService.changePassword(req.user.id, currentPassword, newPassword);
  return success(res, 200, null, 'Password changed successfully.');
});

const me = asyncHandler(async (req, res) => {
  return success(res, 200, req.user.toJSON(), 'Current user.');
});

const googleCallback = asyncHandler(async (req, res) => {
  const code = googleLogin.issue(req, res, req.user);
  const redirectUrl = new URL(`${env.clientUrl}/auth/success`);
  redirectUrl.hash = new URLSearchParams({ code }).toString();
  res.set('Cache-Control', 'no-store');
  res.set('Referrer-Policy', 'no-referrer');
  return res.redirect(redirectUrl.toString());
});

const googleExchange = asyncHandler(async (req, res) => {
  const userId = googleLogin.consume(req);
  const user = await User.findByPk(userId);
  if (!user || user.status !== 'active') throw ApiError.forbidden('Account is not active.');
  res.set('Cache-Control', 'no-store');
  return success(res, 200, authService.buildAuthResponse(user), 'Google sign-in successful.');
});

module.exports = {
  register,
  login,
  logout,
  verifyOtp,
  resendOtp,
  verifyEmail,
  resendVerification,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
  refresh,
  changePassword,
  me,
  googleCallback,
  googleExchange,
};
