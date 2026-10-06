'use strict';

const { Dispute, DisputeEvidence, SwapRequest, User, ClothingItem, sequelize } = require('../models');
const ApiError = require('../utils/ApiError');
const { uploadMultiple } = require('./cloudinaryService');
const { createNotification } = require('./notificationService');

const createDispute = async (userId, swapRequestId, data, files = []) => {
  const swap = await SwapRequest.findByPk(swapRequestId, {
    include: [
      { model: ClothingItem, as: 'senderItem' },
      { model: ClothingItem, as: 'receiverItem' },
    ],
  });

  if (!swap) throw ApiError.notFound('Swap request not found.');

  if (swap.senderId !== userId && swap.receiverId !== userId) {
    throw ApiError.forbidden('You are not a participant in this swap.');
  }

  // Check if active dispute already exists
  const existing = await Dispute.findOne({
    where: {
      swapRequestId,
      status: ['opened', 'under_review'],
    },
  });
  if (existing) {
    throw ApiError.conflict('An active dispute is already opened for this swap request.');
  }

  const respondentId = swap.senderId === userId ? swap.receiverId : swap.senderId;

  let evidenceRecords = [];
  if (files && files.length > 0) {
    const uploaded = await uploadMultiple(files, 'disputes');
    evidenceRecords = uploaded.map((u) => ({
      url: u.url,
      publicId: u.publicId,
      uploaderId: userId,
    }));
  }

  return sequelize.transaction(async (t) => {
    const dispute = await Dispute.create(
      {
        swapRequestId,
        initiatorId: userId,
        respondentId,
        reason: data.reason,
        description: data.description,
        status: 'opened',
      },
      { transaction: t }
    );

    if (evidenceRecords.length > 0) {
      const evidences = evidenceRecords.map((e) => ({ ...e, disputeId: dispute.id }));
      await DisputeEvidence.bulkCreate(evidences, { transaction: t });
    }

    return dispute;
  }).then(async (dispute) => {
    // Notify Respondent
    await createNotification(
      respondentId,
      'system',
      'Dispute Raised on Swap',
      `A dispute has been opened regarding your swap request #${swapRequestId}. Our admin team is reviewing the issue.`,
      { disputeId: dispute.id, swapRequestId }
    );

    return getDisputeById(dispute.id, userId, true);
  });
};

const getDisputeById = async (disputeId, userId, isAdmin = false) => {
  const dispute = await Dispute.findByPk(disputeId, {
    include: [
      {
        model: SwapRequest,
        as: 'swapRequest',
        include: [
          { model: ClothingItem, as: 'senderItem' },
          { model: ClothingItem, as: 'receiverItem' },
        ],
      },
      { model: User, as: 'initiator', attributes: ['id', 'name', 'email', 'profileImage'] },
      { model: User, as: 'respondent', attributes: ['id', 'name', 'email', 'profileImage'] },
      { model: User, as: 'resolver', attributes: ['id', 'name', 'email'] },
      {
        model: DisputeEvidence,
        as: 'evidences',
        include: [{ model: User, as: 'uploader', attributes: ['id', 'name'] }],
      },
    ],
  });

  if (!dispute) throw ApiError.notFound('Dispute record not found.');

  if (!isAdmin && dispute.initiatorId !== userId && dispute.respondentId !== userId) {
    throw ApiError.forbidden('Access denied.');
  }

  return dispute;
};

const getUserDisputes = async (userId, page = 1, limit = 20) => {
  const offset = (page - 1) * limit;
  const { rows, count } = await Dispute.findAndCountAll({
    where: {
      [sequelize.Sequelize.Op.or]: [{ initiatorId: userId }, { respondentId: userId }],
    },
    include: [
      {
        model: SwapRequest,
        as: 'swapRequest',
        include: [
          { model: ClothingItem, as: 'senderItem' },
          { model: ClothingItem, as: 'receiverItem' },
        ],
      },
      { model: User, as: 'initiator', attributes: ['id', 'name', 'profileImage'] },
      { model: User, as: 'respondent', attributes: ['id', 'name', 'profileImage'] },
      { model: DisputeEvidence, as: 'evidences' },
    ],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    distinct: true,
  });

  return { disputes: rows, count };
};

const addEvidence = async (disputeId, userId, files = [], caption = '') => {
  const dispute = await Dispute.findByPk(disputeId);
  if (!dispute) throw ApiError.notFound('Dispute not found.');
  if (dispute.initiatorId !== userId && dispute.respondentId !== userId) {
    throw ApiError.forbidden('Access denied.');
  }

  if (!files || files.length === 0) {
    throw ApiError.badRequest('No files uploaded.');
  }

  const uploaded = await uploadMultiple(files, 'disputes');
  const records = uploaded.map((u) => ({
    disputeId,
    uploaderId: userId,
    url: u.url,
    publicId: u.publicId,
    caption: caption || null,
  }));

  await DisputeEvidence.bulkCreate(records);
  return getDisputeById(disputeId, userId, true);
};

const listAllDisputesAdmin = async (filters = {}, page = 1, limit = 20) => {
  const offset = (page - 1) * limit;
  const where = {};
  if (filters.status) where.status = filters.status;
  if (filters.reason) where.reason = filters.reason;

  const { rows, count } = await Dispute.findAndCountAll({
    where,
    include: [
      {
        model: SwapRequest,
        as: 'swapRequest',
        include: [
          { model: ClothingItem, as: 'senderItem' },
          { model: ClothingItem, as: 'receiverItem' },
        ],
      },
      { model: User, as: 'initiator', attributes: ['id', 'name', 'email', 'profileImage'] },
      { model: User, as: 'respondent', attributes: ['id', 'name', 'email', 'profileImage'] },
      { model: DisputeEvidence, as: 'evidences' },
    ],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    distinct: true,
  });

  return { disputes: rows, count };
};

const resolveDisputeAdmin = async (disputeId, adminId, { status, resolutionNotes, blockUserId }) => {
  const dispute = await Dispute.findByPk(disputeId, {
    include: [{ model: SwapRequest, as: 'swapRequest' }],
  });
  if (!dispute) throw ApiError.notFound('Dispute not found.');

  const allowedStatuses = [
    'resolved_cancel_swap',
    'resolved_dismissed',
    'resolved_warning_issued',
    'resolved_block_user',
  ];
  if (!allowedStatuses.includes(status)) {
    throw ApiError.badRequest('Invalid resolution status.');
  }

  dispute.status = status;
  dispute.resolutionNotes = resolutionNotes || 'Admin tribunal decision finalized.';
  dispute.resolvedById = adminId;
  dispute.resolvedAt = new Date();
  await dispute.save();

  // If dispute resolution is cancel swap or block user, cancel the swap request
  if ((status === 'resolved_cancel_swap' || status === 'resolved_block_user' || status === 'resolved_warning_issued') && dispute.swapRequest) {
    dispute.swapRequest.status = 'cancelled';
    await dispute.swapRequest.save();
  }

  // Handle Blocking user account
  const userToBlock = blockUserId || (status === 'resolved_block_user' ? dispute.respondentId : null);
  if (userToBlock) {
    const targetUser = await User.findByPk(userToBlock);
    if (targetUser) {
      targetUser.status = 'blocked';
      await targetUser.save();
    }
  }

  // Notify Initiator & Respondent
  const msg = `Admin Tribunal Decision for Dispute #${disputeId}: ${status.replace('resolved_', '').replace('_', ' ').toUpperCase()}. Notes: ${dispute.resolutionNotes}`;

  await createNotification(dispute.initiatorId, 'system', 'Dispute Resolution Finalized', msg, { disputeId });
  await createNotification(dispute.respondentId, 'system', 'Dispute Resolution Finalized', msg, { disputeId });

  return getDisputeById(disputeId, adminId, true);
};

module.exports = {
  createDispute,
  getDisputeById,
  getUserDisputes,
  addEvidence,
  listAllDisputesAdmin,
  resolveDisputeAdmin,
};
