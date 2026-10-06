'use strict';

const nodemailer = require('nodemailer');
const env = require('../config/env');
const logger = require('../utils/logger');
const templates = require('../utils/emailTemplates');

let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;

  const emailUser = env.email.user || process.env.EMAIL_USER || process.env.GMAIL_USER || process.env.GOOGLE_EMAIL;
  const emailPass = env.email.password || process.env.EMAIL_PASSWORD || process.env.GMAIL_PASS || process.env.GMAIL_APP_PASSWORD || process.env.GOOGLE_APP_PASSWORD;

  if (!emailUser || !emailPass) {
    logger.warn('Email transporter not configured – missing EMAIL_USER or EMAIL_PASSWORD. Delivery is unavailable.');
    return null;
  }

  const useGmail = env.email.service === 'gmail' || (env.email.host && env.email.host.includes('gmail'));

  const transportOpts = useGmail
    ? {
        service: 'gmail',
        auth: {
          user: emailUser,
          pass: emailPass,
        },
      }
    : {
        host: env.email.host,
        port: env.email.port,
        secure: env.email.secure,
        auth: {
          user: emailUser,
          pass: emailPass,
        },
      };

  transporter = nodemailer.createTransport(transportOpts);

  transporter.verify().then(
    () => logger.info(`Email transporter ready via ${useGmail ? 'Gmail' : env.email.host}.`),
    () => logger.error('Email transporter verification failed.')
  );

  return transporter;
};

const sendEmail = async (to, subject, html, text = null) => {
  try {
    const t = getTransporter();
    const fromAddress = env.email.from || `ReWearX <${env.email.user || 'no-reply@rewearx.com'}>`;
    if (!t) {
      return null;
    }
    const info = await t.sendMail({
      from: fromAddress,
      to,
      subject,
      html,
      text: text || subject,
    });
    if (!Array.isArray(info.accepted) || !info.accepted.length) {
      logger.error('Email was not accepted by the mail server.');
      return null;
    }
    logger.info('Email accepted by the mail server.');
    return info;
  } catch (err) {
    logger.error('Email delivery failed.');
    return null;
  }
};

const sendVerificationEmail = (to, name, verifyUrl) =>
  sendEmail(to, 'Verify your ReWearX account', templates.verifyEmail(name, verifyUrl));

const sendOtpEmail = (to, name, otp) =>
  sendEmail(to, 'Your ReWearX verification code', templates.otpVerification(name, otp));

const sendPasswordResetEmail = (to, name, resetUrl) =>
  sendEmail(to, 'Reset your ReWearX password', templates.passwordReset(name, resetUrl));

const sendSwapNotification = (to, name, type, details) => {
  const subjects = {
    swap_request: 'New Swap Request on ReWearX',
    swap_accepted: 'Your swap was accepted!',
    swap_rejected: 'Swap request update',
    swap_completed: 'Swap completed',
  };
  return sendEmail(to, subjects[type] || 'ReWearX update', templates.swapNotification(name, type, details));
};

const sendSwapRequestEmail = (toEmail, receiverName, senderName, offeredItemTitle, requestedItemTitle, message, swapId) => {
  const clientUrl = env.clientUrl || 'http://localhost:5173';
  const swapUrl = `${clientUrl}/swaps/${swapId}`;
  return sendEmail(
    toEmail,
    `New Swap Request from ${senderName} on ReWearX`,
    templates.swapRequestReceived(receiverName, senderName, offeredItemTitle, requestedItemTitle, message, swapUrl)
  );
};

const sendSwapAcceptedEmail = (toEmail, senderName, receiverName, offeredItemTitle, requestedItemTitle, swapId) => {
  const clientUrl = env.clientUrl || 'http://localhost:5173';
  const chatUrl = `${clientUrl}/swaps/${swapId}`;
  return sendEmail(
    toEmail,
    `Swap Request Accepted! ${receiverName} accepted your swap request`,
    templates.swapRequestAccepted(senderName, receiverName, offeredItemTitle, requestedItemTitle, chatUrl)
  );
};

const sendGenericEmail = (to, name, title, body) =>
  sendEmail(to, title, templates.genericNotification(name, title, body));

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendOtpEmail,
  sendPasswordResetEmail,
  sendSwapNotification,
  sendSwapRequestEmail,
  sendSwapAcceptedEmail,
  sendGenericEmail,
};
