'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Message = sequelize.define(
    'Message',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      conversationId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'conversation_id',
      },
      senderId: { type: DataTypes.INTEGER, allowNull: false, field: 'sender_id' },
      message: { type: DataTypes.TEXT, allowNull: false },
      attachmentUrl: {
        type: DataTypes.STRING(500),
        allowNull: true,
        field: 'attachment_url',
      },
      isRead: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_read' },
      readAt: { type: DataTypes.DATE, allowNull: true, field: 'read_at' },
    },
    {
      tableName: 'messages',
      indexes: [
        { fields: ['conversation_id'] },
        { fields: ['sender_id'] },
        { fields: ['is_read'] },
      ],
    }
  );

  Message.associate = (models) => {
    Message.belongsTo(models.Conversation, {
      foreignKey: 'conversationId',
      as: 'conversation',
    });
    Message.belongsTo(models.User, { foreignKey: 'senderId', as: 'sender' });
  };

  return Message;
};
