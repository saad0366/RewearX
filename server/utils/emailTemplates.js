'use strict';

const baseLayout = (title, body) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:Arial,sans-serif;background:#f4f6f8;margin:0;padding:0;">
  <div style="max-width:600px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
    <div style="background:linear-gradient(90deg,#10b981,#0ea5a4);padding:24px;color:#fff;">
      <h1 style="margin:0;font-size:22px;">ReWearX</h1>
      <p style="margin:4px 0 0;opacity:.85;">AI-Powered Clothing Barter Platform</p>
    </div>
    <div style="padding:24px;color:#1f2937;line-height:1.6;">
      ${body}
    </div>
    <div style="padding:16px 24px;background:#f9fafb;color:#6b7280;font-size:12px;text-align:center;">
      &copy; ${new Date().getFullYear()} ReWearX. All rights reserved.
    </div>
  </div>
</body></html>`;

const verifyEmail = (name, verifyUrl) =>
  baseLayout(
    'Verify your email',
    `<h2 style="margin-top:0;">Welcome, ${name}!</h2>
     <p>Thanks for joining ReWearX. Please verify your email to start swapping clothes.</p>
     <p style="text-align:center;margin:24px 0;">
       <a href="${verifyUrl}" style="background:#10b981;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">Verify Email</a>
     </p>
     <p style="font-size:13px;color:#6b7280;">If the button doesn't work, copy this link:<br>${verifyUrl}</p>
     <p style="font-size:13px;color:#6b7280;">This link expires in 24 hours.</p>`
  );

const passwordReset = (name, resetUrl) =>
  baseLayout(
    'Reset your password',
    `<h2 style="margin-top:0;">Hi ${name},</h2>
     <p>We received a request to reset your ReWearX password.</p>
     <p style="text-align:center;margin:24px 0;">
       <a href="${resetUrl}" style="background:#ef4444;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">Reset Password</a>
     </p>
     <p style="font-size:13px;color:#6b7280;">If you didn't request this, ignore this email.</p>
     <p style="font-size:13px;color:#6b7280;">This link expires in 24 hours.</p>`
  );

const swapNotification = (name, type, details) => {
  const titles = {
    swap_request: 'New Swap Request',
    swap_accepted: 'Swap Request Accepted',
    swap_rejected: 'Swap Request Rejected',
    swap_completed: 'Swap Completed',
  };
  return baseLayout(
    titles[type] || 'Swap Update',
    `<h2 style="margin-top:0;">Hi ${name},</h2>
     <p>${details}</p>
     <p style="font-size:13px;color:#6b7280;">Login to ReWearX to view details.</p>`
  );
};

const otpVerification = (name, otp) =>
  baseLayout(
    'Your ReWearX verification code',
    `<h2 style="margin-top:0;">Hi ${name},</h2>
     <p>Use the code below to verify your email address. It expires in <strong>10 minutes</strong>.</p>
     <div style="text-align:center;margin:28px 0;">
       <span style="display:inline-block;background:#f3f4f6;border:2px dashed #10b981;border-radius:12px;padding:16px 40px;font-size:36px;font-weight:700;letter-spacing:12px;color:#10b981;font-family:monospace;">${otp}</span>
     </div>
     <p style="font-size:13px;color:#6b7280;">If you didn't create a ReWearX account, you can safely ignore this email.</p>`
  );

const genericNotification = (name, title, body) =>
  baseLayout(
    title,
    `<h2 style="margin-top:0;">Hi ${name},</h2>
     <p>${body}</p>
     <p style="font-size:13px;color:#6b7280;">Login to ReWearX for more details.</p>`
  );



const swapRequestReceived = (receiverName, senderName, offeredItemTitle, requestedItemTitle, message, swapUrl) =>
  baseLayout(
    `New Swap Request from ${senderName}`,
    `<h2 style="margin-top:0;color:#10b981;">New Swap Request Received! 🎉</h2>
     <p>Hi <strong>${receiverName}</strong>,</p>
     <p><strong>${senderName}</strong> is interested in swapping with you on <strong>ReWearX</strong>.</p>

     <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:20px 0;">
       <p style="margin:0 0 8px 0;font-size:14px;color:#374151;"><strong>Your Item Requested:</strong> ${requestedItemTitle}</p>
       <p style="margin:0 0 8px 0;font-size:14px;color:#374151;"><strong>Item Offered in Exchange:</strong> ${offeredItemTitle}</p>
       ${message ? `<p style="margin:12px 0 0 0;font-size:13px;color:#4b5563;font-style:italic;background:#fff;padding:10px;border-radius:6px;border-left:3px solid #10b981;">"${message}"</p>` : ''}
     </div>

     <p style="text-align:center;margin:28px 0;">
       <a href="${swapUrl}" style="background:#10b981;color:#ffffff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;box-shadow:0 2px 4px rgba(16,185,129,0.2);">Review &amp; Respond to Request</a>
     </p>

     <p style="font-size:13px;color:#6b7280;">Log in to your ReWearX account to accept, decline, or message the sender.</p>`
  );

const swapRequestAccepted = (senderName, receiverName, offeredItemTitle, requestedItemTitle, chatUrl) =>
  baseLayout(
    `Swap Request Accepted by ${receiverName}`,
    `<h2 style="margin-top:0;color:#10b981;">Your Swap Request was Accepted! 🥳</h2>
     <p>Hi <strong>${senderName}</strong>,</p>
     <p>Great news! <strong>${receiverName}</strong> has accepted your swap request for <strong>${requestedItemTitle}</strong> in exchange for your <strong>${offeredItemTitle}</strong>.</p>

     <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:16px;margin:20px 0;color:#065f46;">
       <p style="margin:0;font-size:14px;"><strong>Next Step:</strong> Open a conversation with ${receiverName} to coordinate item exchange or shipping details.</p>
     </div>

     <p style="text-align:center;margin:28px 0;">
       <a href="${chatUrl}" style="background:#10b981;color:#ffffff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;box-shadow:0 2px 4px rgba(16,185,129,0.2);">Start Chat &amp; View Swap</a>
     </p>

     <p style="font-size:13px;color:#6b7280;">Thank you for contributing to a sustainable barter community!</p>`
  );

module.exports = {
  verifyEmail,
  passwordReset,
  swapNotification,
  genericNotification,
  otpVerification,
  swapRequestReceived,
  swapRequestAccepted,
};
