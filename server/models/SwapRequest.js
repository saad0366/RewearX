'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SwapRequest = sequelize.define(
    'SwapRequest',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      senderId: { type: DataTypes.INTEGER, allowNull: false, field: 'sender_id' },
      receiverId: { type: DataTypes.INTEGER, allowNull: false, field: 'receiver_id' },
      senderItemId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'sender_item_id',
      },
      receiverItemId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'receiver_item_id',
      },
      message: { type: DataTypes.TEXT, allowNull: true },
      status: {
        type: DataTypes.ENUM('pending', 'accepted', 'rejected', 'cancelled', 'completed'),
        defaultValue: 'pending',
      },
      senderConfirmedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'sender_confirmed_at',
      },
      receiverConfirmedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'receiver_confirmed_at',
      },
      acceptedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'accepted_at',
      },
    },
    {
      tableName: 'swap_requests',
      indexes: [
        { fields: ['sender_id'] },
        { fields: ['receiver_id'] },
        { fields: ['sender_item_id'] },
        { fields: ['receiver_item_id'] },
        { fields: ['status'] },
      ],
    }
  );

  SwapRequest.associate = (models) => {
    SwapRequest.belongsTo(models.User, { foreignKey: 'senderId', as: 'sender' });
    SwapRequest.belongsTo(models.User, { foreignKey: 'receiverId', as: 'receiver' });
    SwapRequest.belongsTo(models.ClothingItem, {
      foreignKey: 'senderItemId',
      as: 'senderItem',
    });
    SwapRequest.belongsTo(models.ClothingItem, {
      foreignKey: 'receiverItemId',
      as: 'receiverItem',
    });
    SwapRequest.hasOne(models.Conversation, {
      foreignKey: 'swapRequestId',
      as: 'conversation',
    });
    SwapRequest.hasMany(models.Review, { foreignKey: 'swapRequestId', as: 'reviews' });
    SwapRequest.hasMany(models.Dispute, { foreignKey: 'swapRequestId', as: 'disputes' });
  };

  return SwapRequest;
};
