'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SchemaVersion = sequelize.define(
    'SchemaVersion',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      categoryId: { type: DataTypes.INTEGER, allowNull: false, field: 'category_id' },
      version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      status: {
        type: DataTypes.ENUM('draft', 'active', 'deprecated'),
        allowNull: false,
        defaultValue: 'draft',
      },
      snapshotJson: { type: DataTypes.JSON, allowNull: false, field: 'snapshot_json' },
    },
    { tableName: 'schema_versions', timestamps: true, updatedAt: false, underscored: true }
  );

  SchemaVersion.associate = (models) => {
    SchemaVersion.belongsTo(models.Category, { foreignKey: 'categoryId', as: 'category' });
  };

  return SchemaVersion;
};
