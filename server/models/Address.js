'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Address = sequelize.define(
    'Address',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      userId: { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
      label: { type: DataTypes.STRING(50), allowNull: true },
      addressLine1: { type: DataTypes.STRING(255), allowNull: false, field: 'address_line1' },
      addressLine2: { type: DataTypes.STRING(255), allowNull: true, field: 'address_line2' },
      city: { type: DataTypes.STRING(100), allowNull: false },
      state: { type: DataTypes.STRING(100), allowNull: true },
      postalCode: { type: DataTypes.STRING(20), allowNull: true, field: 'postal_code' },
      country: { type: DataTypes.STRING(100), allowNull: false },
      isDefault: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_default' },
    },
    { tableName: 'addresses', indexes: [{ fields: ['user_id'] }] }
  );

  Address.associate = (models) => {
    Address.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
  };

  return Address;
};
