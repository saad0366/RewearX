'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Notification = sequelize.define(
    'Notification',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      userId: { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
      type: { type: DataTypes.STRING(50), allowNull: false },
      title: { type: DataTypes.STRING(150), allowNull: false },
      message: { type: DataTypes.TEXT, allowNull: false },
      data: { type: DataTypes.TEXT, allowNull: true },
      isRead: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_read' },
      readAt: { type: DataTypes.DATE, allowNull: true, field: 'read_at' },
    },
    {
      tableName: 'notifications',
      indexes: [
        { fields: ['user_id'] },
        { fields: ['type'] },
        { fields: ['is_read'] },
      ],
    }
  );

  Notification.associate = (models) => {
    Notification.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
  };

  return Notification;
};
