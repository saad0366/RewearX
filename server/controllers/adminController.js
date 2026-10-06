'use strict';

const adminService = require('../services/adminService');
const reportService = require('../services/reportService');
const { success, paginated, asyncHandler, buildPagination } = require('../utils/response');

const listUsers = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '20', 10);
    const result = await adminService.listUsers({
        page,
        limit,
        search: req.query.search,
        status: req.query.status,
        role: req.query.role,
    });
    return paginated(
        res,
        200,
        result.items,
        buildPagination(result.count, page, limit),
        'Users fetched.'
    );
});

const updateUserStatus = asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const user = await adminService.setUserStatus(id, req.body.status, req.user.id);
    return success(res, 200, user, `User status updated to ${user.status}.`);
});

const listReports = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '20', 10);
    const status = req.query.status || null;
    const result = await reportService.listReports(status, page, limit);
    return paginated(
        res,
        200,
        result.items,
        buildPagination(result.count, page, limit),
        'Reports fetched.'
    );
});

const updateReportStatus = asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const r = await reportService.updateReportStatus(
        id,
        req.user.id,
        req.body.status,
        req.body.adminNotes
    );
    return success(res, 200, r, 'Report updated.');
});

const stats = asyncHandler(async (_req, res) => {
    const data = await adminService.getStats();
    return success(res, 200, data, 'Platform stats.');
});

const listAllItems = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '20', 10);
    const result = await adminService.listAllItems({
        page,
        limit,
        search: req.query.search,
        available: req.query.available === undefined ? undefined : req.query.available === 'true',
    });
    return paginated(
        res,
        200,
        result.items,
        buildPagination(result.count, page, limit),
        'Items fetched.'
    );
});

const removeItem = asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const item = await adminService.removeItem(id);
    return success(res, 200, item, 'Item removed.');
});

module.exports = {
    listUsers,
    updateUserStatus,
    listReports,
    updateReportStatus,
    stats,
    listAllItems,
    removeItem,
};