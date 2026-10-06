'use strict';

const swapService = require('../services/swapService');
const { success, paginated, asyncHandler, buildPagination } = require('../utils/response');

const create = asyncHandler(async (req, res) => {
  const swap = await swapService.createSwapRequest(req.user.id, req.body);
  return success(res, 201, swap, 'Swap request sent.');
});

const list = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page || '1', 10);
  const limit = parseInt(req.query.limit || '20', 10);
  const role = req.query.role || 'all';
  const status = req.query.status;
  const result = await swapService.getUserSwaps(req.user.id, { role, status, page, limit });
  return paginated(
    res,
    200,
    result.items,
    buildPagination(result.count, page, limit),
    'Swaps fetched.'
  );
});

const getOne = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const swap = await swapService.getSwapById(id);
  if (swap.senderId !== req.user.id && swap.receiverId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Forbidden.' });
  }
  return success(res, 200, swap, 'Swap fetched.');
});

const updateStatus = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { status } = req.body;
  const swap = await swapService.updateSwapStatus(id, req.user.id, status);

  // Real-time push to participants
  const io = req.app.get('io');
  if (io) {
    [swap.senderId, swap.receiverId].forEach((uid) => {
      io.to(`user:${uid}`).emit('swap-status-update', {
        swapId: swap.id,
        status: swap.status,
      });
    });
    if (swap.conversation?.id) {
      io.to(`conversation:${swap.conversation.id}`).emit('swap-status-update', {
        swapId: swap.id,
        status: swap.status,
      });
    }
  }

  return success(res, 200, swap, `Swap ${status}.`);
});

module.exports = { create, list, getOne, updateStatus };
