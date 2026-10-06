'use strict';

const { Report, User, ClothingItem } = require('../models');
const ApiError = require('../utils/ApiError');

const createReport = async (reporterId, { reportedUserId, reportedItemId, reason, description }) => {
  if (reporterId === reportedUserId) {
    throw ApiError.badRequest('You cannot report yourself.');
  }
  const reportedUser = await User.findByPk(reportedUserId);
  if (!reportedUser) throw ApiError.notFound('Reported user not found.');

  if (reportedItemId) {
    const item = await ClothingItem.findByPk(reportedItemId);
    if (!item) throw ApiError.notFound('Reported item not found.');
  }

  return Report.create({
    reporterId,
    reportedUserId,
    reportedItemId: reportedItemId || null,
    reason,
    description: description || null,
  });
};

const listReports = async (status = null, page = 1, limit = 20) => {
  const offset = (page - 1) * limit;
  const where = status ? { status } : {};
  const { rows, count } = await Report.findAndCountAll({
    where,
    include: [
      { model: User, as: 'reporter', attributes: ['id', 'name', 'email'] },
      { model: User, as: 'reportedUser', attributes: ['id', 'name', 'email'] },
      { model: ClothingItem, as: 'reportedItem' },
      { model: User, as: 'resolvedBy', attributes: ['id', 'name'] },
    ],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });
  return { items: rows, count };
};

const updateReportStatus = async (reportId, adminId, status, adminNotes = null) => {
  const report = await Report.findByPk(reportId);
  if (!report) throw ApiError.notFound('Report not found.');
  report.status = status;
  if (adminNotes) report.adminNotes = adminNotes;
  if (status === 'resolved') {
    report.resolvedById = adminId;
    report.resolvedAt = new Date();
  }
  await report.save();
  return report;
};

module.exports = { createReport, listReports, updateReportStatus };
