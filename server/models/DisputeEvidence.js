'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const DisputeEvidence = sequelize.define(
    'DisputeEvidence',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      disputeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'dispute_id',
      },
      uploaderId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'uploader_id',
      },
      url: { type: DataTypes.STRING(500), allowNull: false },
      publicId: { type: DataTypes.STRING(255), allowNull: true, field: 'public_id' },
      caption: { type: DataTypes.STRING(255), allowNull: true },
    },
    {
      tableName: 'dispute_evidences',
      indexes: [{ fields: ['dispute_id'] }, { fields: ['uploader_id'] }],
    }
  );

  DisputeEvidence.associate = (models) => {
    DisputeEvidence.belongsTo(models.Dispute, { foreignKey: 'disputeId', as: 'dispute' });
    DisputeEvidence.belongsTo(models.User, { foreignKey: 'uploaderId', as: 'uploader' });
  };

  return DisputeEvidence;
};
