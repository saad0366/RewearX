'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Conversation = sequelize.define(
    'Conversation',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      swapRequestId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        field: 'swap_request_id',
      },
      lastMessageAt: { type: DataTypes.DATE, allowNull: true, field: 'last_message_at' },
    },
    {
      tableName: 'conversations',
      indexes: [{ fields: ['swap_request_id'], unique: true }],
    }
  );

  Conversation.associate = (models) => {
    Conversation.belongsTo(models.SwapRequest, {
      foreignKey: 'swapRequestId',
      as: 'swapRequest',
    });
    Conversation.hasMany(models.Message, {
      foreignKey: 'conversationId',
      as: 'messages',
      onDelete: 'CASCADE',
    });
  };

  return Conversation;
};
