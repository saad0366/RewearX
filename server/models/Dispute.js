'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Dispute = sequelize.define(
    'Dispute',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      swapRequestId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'swap_request_id',
      },
      initiatorId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'initiator_id',
      },
      respondentId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'respondent_id',
      },
      reason: {
        type: DataTypes.ENUM(
          'item_not_as_described',
          'damaged_item',
          'fake_brand',
          'missing_item',
          'never_shipped',
          'other'
        ),
        allowNull: false,
      },
      description: { type: DataTypes.TEXT, allowNull: false },
      status: {
        type: DataTypes.ENUM(
          'opened',
          'under_review',
          'resolved_cancel_swap',
          'resolved_dismissed',
          'resolved_warning_issued',
          'resolved_block_user'
        ),
        defaultValue: 'opened',
      },
      resolutionNotes: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'resolution_notes',
      },
      resolvedById: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'resolved_by_id',
      },
      resolvedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'resolved_at',
      },
    },
    {
      tableName: 'disputes',
      indexes: [
        { fields: ['swap_request_id'] },
        { fields: ['initiator_id'] },
        { fields: ['respondent_id'] },
        { fields: ['status'] },
      ],
    }
  );

  Dispute.associate = (models) => {
    Dispute.belongsTo(models.SwapRequest, { foreignKey: 'swapRequestId', as: 'swapRequest' });
    Dispute.belongsTo(models.User, { foreignKey: 'initiatorId', as: 'initiator' });
    Dispute.belongsTo(models.User, { foreignKey: 'respondentId', as: 'respondent' });
    Dispute.belongsTo(models.User, { foreignKey: 'resolvedById', as: 'resolver' });
    Dispute.hasMany(models.DisputeEvidence, { foreignKey: 'disputeId', as: 'evidences', onDelete: 'CASCADE' });
  };

  return Dispute;
};
