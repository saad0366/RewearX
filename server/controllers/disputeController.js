'use strict';

const disputeService = require('../services/disputeService');
const { success, asyncHandler } = require('../utils/response');

const create = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { swapRequestId, reason, description } = req.body;
  const files = req.files || [];
  const dispute = await disputeService.createDispute(
    userId,
    parseInt(swapRequestId, 10),
    { reason, description },
    files
  );
  return success(res, 201, dispute, 'Dispute successfully opened.');
});

const listUserDisputes = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const page = parseInt(req.query.page || '1', 10);
  const limit = parseInt(req.query.limit || '20', 10);
  const { disputes, count } = await disputeService.getUserDisputes(userId, page, limit);
  return success(res, 200, disputes, 'Disputes fetched.', {
    totalItems: count,
    totalPages: Math.ceil(count / limit),
    currentPage: page,
    pageSize: limit,
  });
});

const getById = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const isAdmin = req.user.role === 'admin';
  const id = parseInt(req.params.id, 10);
  const dispute = await disputeService.getDisputeById(id, userId, isAdmin);
  return success(res, 200, dispute, 'Dispute detail fetched.');
});

const uploadEvidence = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const id = parseInt(req.params.id, 10);
  const caption = req.body.caption || '';
  const files = req.files || [];
  const dispute = await disputeService.addEvidence(id, userId, files, caption);
  return success(res, 200, dispute, 'Evidence uploaded successfully.');
});

const listAdmin = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page || '1', 10);
  const limit = parseInt(req.query.limit || '20', 10);
  const filters = { status: req.query.status, reason: req.query.reason };
  const { disputes, count } = await disputeService.listAllDisputesAdmin(filters, page, limit);
  return success(res, 200, disputes, 'Admin disputes list fetched.', {
    totalItems: count,
    totalPages: Math.ceil(count / limit),
    currentPage: page,
    pageSize: limit,
  });
});

const resolveAdmin = asyncHandler(async (req, res) => {
  const adminId = req.user.id;
  const id = parseInt(req.params.id, 10);
  const { status, resolutionNotes, blockUserId } = req.body;
  const dispute = await disputeService.resolveDisputeAdmin(id, adminId, { status, resolutionNotes, blockUserId });
  return success(res, 200, dispute, 'Dispute resolution finalized.');
});

module.exports = {
  create,
  listUserDisputes,
  getById,
  uploadEvidence,
  listAdmin,
  resolveAdmin,
};
