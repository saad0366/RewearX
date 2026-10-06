'use strict';

const { DataTypes } = require('sequelize');
const bcrypt = require('bcrypt');
const env = require('../config/env');

module.exports = (sequelize) => {
  const User = sequelize.define(
    'User',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(100), allowNull: false },
      email: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        validate: { isEmail: true },
      },
      password: { type: DataTypes.STRING(255), allowNull: true },
      googleId: { type: DataTypes.STRING(255), allowNull: true, unique: true, field: 'google_id' },
      authProvider: { type: DataTypes.STRING(30), allowNull: true, defaultValue: 'local', field: 'auth_provider' },
      phone: { type: DataTypes.STRING(20), allowNull: true },
      profileImage: { type: DataTypes.STRING(500), allowNull: true, field: 'profile_image' },
      bio: { type: DataTypes.TEXT, allowNull: true },
      gender: { type: DataTypes.ENUM('male', 'female', 'other'), allowNull: true },
      location: { type: DataTypes.STRING(150), allowNull: true, defaultValue: 'Islamabad' },
      address: { type: DataTypes.TEXT, allowNull: true },
      dateOfBirth: { type: DataTypes.DATEONLY, allowNull: true, field: 'date_of_birth' },
      isVerified: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_verified' },
      verificationToken: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'verification_token',
      },
      verificationExpires: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'verification_expires',
      },
      otpCode: {
        type: DataTypes.STRING(6),
        allowNull: true,
        field: 'otp_code',
      },
      otpExpires: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'otp_expires',
      },
      resetToken: { type: DataTypes.STRING(255), allowNull: true, field: 'reset_token' },
      resetExpires: { type: DataTypes.DATE, allowNull: true, field: 'reset_expires' },
      role: { type: DataTypes.ENUM('user', 'admin'), defaultValue: 'user' },
      status: { type: DataTypes.ENUM('active', 'blocked'), defaultValue: 'active' },
      lastLoginAt: { type: DataTypes.DATE, allowNull: true, field: 'last_login_at' },
    },
    {
      tableName: 'users',
      indexes: [
        { fields: ['email'] },
        { fields: ['status'] },
        { fields: ['role'] },
      ],
      defaultScope: {
        attributes: {
          exclude: [
            'password',
            'verificationToken',
            'verificationExpires',
            'otpCode',
            'otpExpires',
            'resetToken',
            'resetExpires',
          ],
        },
      },
      scopes: {
        withSecrets: { attributes: { include: [] } },
        withPassword: {
          attributes: { exclude: [] },
        },
      },
    }
  );

  User.beforeCreate(async (user) => {
    if (user.password && !user.password.startsWith('$2')) {
      user.password = await bcrypt.hash(user.password, env.bcrypt.saltRounds);
    }
  });

  User.beforeUpdate(async (user) => {
    if (user.password && user.changed('password') && !user.password.startsWith('$2')) {
      user.password = await bcrypt.hash(user.password, env.bcrypt.saltRounds);
    }
  });

  User.prototype.comparePassword = async function (plain) {
    if (!this.password) return false;
    return bcrypt.compare(plain, this.password);
  };

  User.prototype.toJSON = function () {
    const values = { ...this.get() };
    delete values.password;
    delete values.verificationToken;
    delete values.verificationExpires;
    delete values.otpCode;
    delete values.otpExpires;
    delete values.resetToken;
    delete values.resetExpires;
    return values;
  };

  User.associate = (models) => {
    User.hasMany(models.Address, { foreignKey: 'userId', as: 'addresses' });
    User.hasMany(models.ClothingItem, { foreignKey: 'userId', as: 'items' });
    User.hasOne(models.UserPreferences, { foreignKey: 'userId', as: 'preferences' });
    User.belongsToMany(models.Category, {
      through: models.UserInterests,
      foreignKey: 'userId',
      otherKey: 'categoryId',
      as: 'interests',
    });
    User.belongsToMany(models.ClothingItem, {
      through: models.SavedItem,
      foreignKey: 'userId',
      otherKey: 'itemId',
      as: 'savedItems',
    });
    User.hasMany(models.SwapRequest, { foreignKey: 'senderId', as: 'sentSwaps' });
    User.hasMany(models.SwapRequest, { foreignKey: 'receiverId', as: 'receivedSwaps' });
    User.hasMany(models.Message, { foreignKey: 'senderId', as: 'messages' });
    User.hasMany(models.Review, { foreignKey: 'reviewerId', as: 'reviewsWritten' });
    User.hasMany(models.Review, { foreignKey: 'revieweeId', as: 'reviewsReceived' });
    User.hasMany(models.Report, { foreignKey: 'reporterId', as: 'reportsFiled' });
    User.hasMany(models.Report, { foreignKey: 'reportedUserId', as: 'reportsAgainst' });
    User.hasMany(models.Notification, { foreignKey: 'userId', as: 'notifications' });
    User.hasMany(models.Recommendation, { foreignKey: 'userId', as: 'recommendations' });
  };

  return User;
};
