'use strict';

// Public discovery only. Administrative/transactional lookups must retain moderation visibility.
const activeOwnerInclude = (User, attributes = ['id', 'name', 'profileImage']) => ({
  model: User, as: 'owner', attributes, where: { status: 'active' }, required: true,
});

module.exports = { activeOwnerInclude };
