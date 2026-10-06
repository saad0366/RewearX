'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class HeroBanner extends Model {
    static associate(models) {
      // No associations needed for now
    }
  }

  HeroBanner.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      imageUrl: {
        type: DataTypes.STRING(512),
        allowNull: false,
        field: 'image_url',
      },
      cloudinaryPublicId: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'cloudinary_public_id',
      },
      title: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      subtitle: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      displayOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'display_order',
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'is_active',
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'created_at',
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'updated_at',
      },
    },
    {
      sequelize,
      modelName: 'HeroBanner',
      tableName: 'hero_banners',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['is_active'] },
        { fields: ['display_order'] },
      ],
    }
  );

  return HeroBanner;
};
