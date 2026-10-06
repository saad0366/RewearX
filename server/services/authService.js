'use strict';

const { Op } = require('sequelize');
const { User, UserPreferences } = require('../models');
const ApiError = require('../utils/ApiError');
const {
  signAccessToken,
  signRefreshToken,
  randomToken,
  hashToken,
  verifyRefreshToken,
} = require('../utils/tokens');
const env = require('../config/env');
const emailService = require('./emailService');
const logger = require('../utils/logger');

// Temporary store for pending registrations (OTP not yet verified).
// Key: email, Value: { name, email, hashedPassword, gender, phone, dateOfBirth, otp, otpExpires }
const pendingRegistrations = new Map();
const otpOperations = new Map();
const OTP_TTL = 10 * 60 * 1000;
const withOtpLock = (email, action) => {
  const previous = otpOperations.get(email) || Promise.resolve();
  const operation = previous.catch(() => {}).then(action);
  otpOperations.set(email, operation);
  const release = () => { if (otpOperations.get(email) === operation) otpOperations.delete(email); };
  operation.then(release, release);
  return operation;
};
const clearPending = (email, pending) => {
  if (pendingRegistrations.get(email) !== pending) return;
  clearTimeout(pending.timer);
  pendingRegistrations.delete(email);
};
const installPending = (email, pending) => {
  const old = pendingRegistrations.get(email);
  if (old) clearTimeout(old.timer);
  pendingRegistrations.set(email, pending);
  pending.timer = setTimeout(() => clearPending(email, pending), Math.max(0, pending.otpExpires.getTime() - Date.now()));
  pending.timer.unref?.();
};
const newOtp = (issuedOtps) => {
  let otp;
  do { otp = String(require('crypto').randomInt(100000, 1000000)); } while (issuedOtps.has(otp));
  issuedOtps.add(otp);
  return otp;
};
const deliverEmail = async (email, send) => {
  let result;
  try { result = await send(); } catch (_) { /* no secret-bearing provider errors */ }
  if (!result || !Array.isArray(result.accepted) || !result.accepted.some(address => String(address).toLowerCase() === email.toLowerCase())) {
    throw new ApiError(503, 'Verification email could not be delivered. Please try again.');
  }
};

const deliverOtp = (email, name, otp) => deliverEmail(email, () => emailService.sendOtpEmail(email, name, otp));

const buildAuthResponse = (user) => {
  const payload = { id: user.id, role: user.role, email: user.email };
  return {
    user: user.toJSON(),
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken({ id: user.id }),
    expiresIn: env.jwt.expiresIn,
  };
};

const register = async ({ email, password, name, gender, phone, dateOfBirth }) => {
  // Only block if a verified account already exists
  const existing = await User.findOne({ where: { email, isVerified: true } });
  if (existing) throw ApiError.conflict('Email already registered.');

  const issuedOtps = pendingRegistrations.get(email)?.issuedOtps || new Set();
  const otp = newOtp(issuedOtps);
  const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Hash password now so we're not storing plaintext in memory
  const bcrypt = require('bcrypt');
  const hashedPassword = await bcrypt.hash(password, env.bcrypt.saltRounds);

  const pending = {
    name,
    email,
    hashedPassword,
    gender,
    phone: phone || null,
    dateOfBirth: dateOfBirth || null,
    otp,
    issuedOtps,
    otpExpires,
  };
  installPending(email, pending);
  try {
    await deliverOtp(email, name, otp);
    if (Date.now() >= pending.otpExpires.getTime()) throw ApiError.badRequest('OTP has expired. Please register again.');
  }
  catch (err) { clearPending(email, pending); throw err; }

  return { otpSent: true, email };
};

const verifyOtp = async (email, otp) => {
  const pending = pendingRegistrations.get(email);
  if (!pending) throw ApiError.badRequest('No pending registration found. Please register again.');
  if (Date.now() >= pending.otpExpires.getTime()) {
    clearPending(email, pending);
    throw ApiError.badRequest('OTP has expired. Please register again.');
  }
  if (pending.deliveryFailed) throw ApiError.badRequest('OTP delivery failed. Please resend the code.');
  if (pending.otp !== String(otp)) throw ApiError.badRequest('Incorrect OTP. Please try again.');

  // OTP verified — create the account now
  let user;
  try {
    user = await User.create({
      name: pending.name,
      email: pending.email,
      password: pending.hashedPassword,
      gender: pending.gender,
      phone: pending.phone,
      dateOfBirth: pending.dateOfBirth,
      isVerified: true,
    });
  } catch (err) {
    logger.error('Account creation failed during OTP verification.');
    throw err;
  }

  await UserPreferences.create({ userId: user.id });
  clearPending(email, pending);

  const created = await User.scope('withPassword').findByPk(user.id);
  if (!created) throw ApiError.internal('User created but could not be fetched.');
  return buildAuthResponse(created);
};

const resendOtp = async (email) => {
  const pending = pendingRegistrations.get(email);
  if (!pending) throw ApiError.badRequest('No pending registration found. Please register again.');

  if (Date.now() >= pending.otpExpires.getTime()) {
    clearPending(email, pending);
    throw ApiError.badRequest('OTP has expired. Please register again.');
  }
  const replacement = { ...pending, deliveryFailed: false, otp: newOtp(pending.issuedOtps), otpExpires: new Date(Date.now() + OTP_TTL) };
  installPending(email, replacement);
  try {
    await deliverOtp(email, replacement.name, replacement.otp);
    if (Date.now() >= replacement.otpExpires.getTime()) throw ApiError.badRequest('OTP has expired. Please register again.');
  }
  catch (err) {
    replacement.deliveryFailed = true;
    if (Date.now() >= replacement.otpExpires.getTime()) clearPending(email, replacement);
    throw err;
  }

  return true;
};

const login = async (email, password) => {
  const user = await User.scope('withPassword').findOne({ where: { email } });
  if (!user) throw ApiError.unauthorized('Invalid email or password.');
  if (user.status === 'blocked') {
    throw ApiError.forbidden('Account blocked. Contact support.');
  }
  const ok = await user.comparePassword(password);
  if (!ok) throw ApiError.unauthorized('Invalid email or password.');

  user.lastLoginAt = new Date();
  await user.save();

  return buildAuthResponse(user);
};

const verifyEmail = async (rawToken) => {
  const tokenHash = hashToken(rawToken);
  const user = await User.scope('withPassword').findOne({
    where: {
      verificationToken: tokenHash,
      verificationExpires: { [Op.gt]: new Date() },
    },
  });
  if (!user) throw ApiError.badRequest('Invalid or expired verification token.');

  user.isVerified = true;
  user.verificationToken = null;
  user.verificationExpires = null;
  await user.save();
  return user.toJSON();
};

const resendVerification = async (userId) => {
  const user = await User.scope('withPassword').findByPk(userId);
  if (!user) throw ApiError.notFound('User not found.');
  if (user.isVerified) throw ApiError.badRequest('Email already verified.');

  const verificationToken = randomToken(32);
  user.verificationToken = hashToken(verificationToken);
  user.verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await user.save();

  const verifyUrl = `${env.clientUrl}/verify-email/${verificationToken}`;
  await deliverEmail(user.email, () => emailService.sendVerificationEmail(user.email, user.name, verifyUrl));
  return true;
};

const forgotPassword = async (email) => {
  const user = await User.scope('withPassword').findOne({ where: { email } });
  if (!user) {
    // Avoid user-enumeration
    return { sent: false };
  }

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  user.resetToken = hashToken(otp);
  user.resetExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  await user.save();

  await deliverOtp(email, user.name, otp);

  return { sent: true };
};

const verifyResetOtp = async (email, otp) => {
  const user = await User.scope('withPassword').findOne({
    where: {
      email,
      resetToken: hashToken(otp),
      resetExpires: { [Op.gt]: new Date() },
    },
  });
  if (!user) throw ApiError.badRequest('Invalid or expired OTP.');

  // Generate a temporary token for the actual reset step
  const resetToken = randomToken(32);
  user.resetToken = hashToken(resetToken);
  user.resetExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  await user.save();

  return { resetToken };
};

const resetPassword = async (rawToken, newPassword) => {
  const tokenHash = hashToken(rawToken);
  const user = await User.scope('withPassword').findOne({
    where: {
      resetToken: tokenHash,
      resetExpires: { [Op.gt]: new Date() },
    },
  });
  if (!user) throw ApiError.badRequest('Invalid or expired reset token.');

  user.password = newPassword;
  user.resetToken = null;
  user.resetExpires = null;
  await user.save();
  return true;
};

const refreshAccessToken = async (refreshToken) => {
  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch (_) {
    throw ApiError.unauthorized('Invalid refresh token.');
  }
  const user = await User.findByPk(decoded.id);
  if (!user) throw ApiError.unauthorized('User not found.');
  if (user.status === 'blocked') throw ApiError.forbidden('Account blocked.');
  return buildAuthResponse(user);
};

const changePassword = async (userId, currentPassword, newPassword) => {
  const user = await User.scope('withPassword').findByPk(userId);
  if (!user) throw ApiError.notFound('User not found.');
  const ok = await user.comparePassword(currentPassword);
  if (!ok) throw ApiError.unauthorized('Current password is incorrect.');
  user.password = newPassword;
  await user.save();
  return true;
};

const findOrCreateGoogleUser = async ({ googleId, email, name, avatar }) => {
  let user = await User.scope('withPassword').findOne({ where: { googleId } });
  if (user) {
    if (user.status !== 'active') throw ApiError.forbidden('Account is not active.');
    user.lastLoginAt = new Date();
    await user.save();
    return user;
  }

  user = await User.scope('withPassword').findOne({ where: { email } });
  if (user) {
    if (user.status !== 'active') throw ApiError.forbidden('Account is not active.');
    if (user.googleId !== googleId) {
      throw ApiError.conflict('An account with this email already exists. Please log in normally to link your Google account.');
    }
    return user;
  }

  try {
    user = await User.create({
      googleId,
      email,
      name,
      profileImage: avatar,
      authProvider: 'google',
      isVerified: true,
    });
    await UserPreferences.create({ userId: user.id });
    return user;
  } catch (err) {
    logger.error(`User.create failed during Google OAuth for ${email}: ${err.message}`);
    throw err;
  }
};

module.exports = {
  register: (input) => withOtpLock(input.email, () => register(input)),
  login,
  verifyOtp: (email, otp) => withOtpLock(email, () => verifyOtp(email, otp)),
  resendOtp: (email) => withOtpLock(email, () => resendOtp(email)),
  verifyEmail,
  resendVerification,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
  refreshAccessToken,
  changePassword,
  findOrCreateGoogleUser,
  buildAuthResponse,
};
