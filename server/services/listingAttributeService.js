'use strict';
const { ItemFeatures } = require('../models');
const taxonomy = require('../config/imageTaxonomy');
const ApiError = require('../utils/ApiError');
const HEADS = ['occasion','season','sleeve_length','pattern'];
const configured = () => Boolean(ItemFeatures.rawAttributes?.imagePredictions && ItemFeatures.rawAttributes?.imageProcessedAt);
async function getStorageCapabilities() {
  if (!configured()) return { confirmed_attributes: false, reason: 'storage_not_enabled' };
  try {
    const columns = await ItemFeatures.sequelize.getQueryInterface().describeTable('item_features');
    return columns.image_predictions && columns.image_processed_at
      ? { confirmed_attributes: true, reason: null }
      : { confirmed_attributes: false, reason: 'migration_required' };
  } catch (_) { return { confirmed_attributes: false, reason: 'storage_unavailable' }; }
}
function parseConfirmedAttributes(value) {
  if (value === undefined) return undefined;
  let attrs=value;
  if (typeof attrs === 'string') {
    if (attrs.length > 4096) throw ApiError.unprocessable('Confirmed attributes are too large.');
    try { attrs=JSON.parse(attrs); } catch (_) { throw ApiError.unprocessable('Invalid confirmed attributes JSON.'); }
  }
  if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)
      || Object.keys(attrs).some(k=>!HEADS.includes(k))) throw ApiError.unprocessable('Invalid confirmed attributes.');
  const result={};
  for (const [head,label] of Object.entries(attrs)) {
    if (label !== null && !taxonomy[head].includes(label)) throw ApiError.unprocessable(`Invalid confirmed ${head}.`);
    // Manual labels are user statements, never model support/accuracy claims.
    result[head]=label;
  }
  return result;
}
async function prepareConfirmedStorage(value,userId,color) {
  const attrs=parseConfirmedAttributes(value);
  if (attrs === undefined && (color === undefined || !configured())) return undefined;
  const capabilities=await getStorageCapabilities();
  if (!capabilities.confirmed_attributes) throw new ApiError(409,
    'Extra attributes cannot be saved until image attribute storage is enabled and migrated.',
    {code:'attribute_storage_unavailable'});
  return {confirmed_attributes:attrs||{},...(color !== undefined ? {confirmed_colors:[...new Set(String(color||'').split(',').map(c=>c.trim().toLowerCase()).filter(c=>taxonomy.color.includes(c)))]}:{}),confirmation:{user_id:userId,confirmed_at:new Date().toISOString(),provenance:'user_confirmed'}};
}
module.exports={configured,getStorageCapabilities,parseConfirmedAttributes,prepareConfirmedStorage};
