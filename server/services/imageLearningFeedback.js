'use strict';
const { createHash } = require('node:crypto');
const taxonomy = require('../config/imageTaxonomy');
const { mapCategory } = require('./imageCategoryMapping');
const { ClothingItem, ClothingImage, ItemFeatures } = require('../models');

const {sleeveApplicable}=require('./clothingApplicability');
const supported = (head, value) => taxonomy[head].includes(value) &&
  !({category:['skirt'],sleeve_length:['half'],season:['all_season']}[head] || []).includes(value);
const enabled = () => Boolean(ItemFeatures.rawAttributes?.imagePredictions);
const normalizedColor = value => [...new Set(String(value||'').split(',').map(c=>c.trim().toLowerCase()).filter(Boolean))].sort().join(',');
const normalizedAttributes = stored => Object.fromEntries(['occasion','season','sleeve_length','pattern'].map(h=>[h,stored.confirmed_attributes?.[h] ?? null]));
function feedbackSnapshot(item, stored, consent, review) {
  const image = (item.images || []).find(i => i.isPrimary);
  const snapshot = {category_id:item.categoryId,color:normalizedColor(item.color),
    attributes:normalizedAttributes(stored),cover_image_id:image?.id || null};
  return {training_consent:consent === true,review_confirmed:review === true,
    revision:createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),
    snapshot,confirmed_at:new Date().toISOString()};
}
async function invalidateFeedback(itemId, transaction) {
  if (!enabled()) return;
  const features = await ItemFeatures.findOne({where:{itemId},transaction});
  const stored = features?.imagePredictions;
  if (stored?.learning_feedback?.review_confirmed) {
    await ItemFeatures.upsert({itemId,imagePredictions:{...stored,learning_feedback:{...stored.learning_feedback,review_confirmed:false}}},{transaction});
  }
}
async function confirmFeedback(itemId, input, transaction) {
  if (!enabled()) return;
  if (input.trainingConsent === false && input.reviewConfirmed !== true) {
    const features=await ItemFeatures.findOne({where:{itemId},transaction});
    const stored=features?.imagePredictions;
    if(stored?.learning_feedback) await ItemFeatures.upsert({itemId,imagePredictions:{...stored,learning_feedback:{...stored.learning_feedback,training_consent:false}}},{transaction});
    return;
  }
  if (input.reviewConfirmed !== true) return;
  const item = await ClothingItem.findByPk(itemId,{include:[{model:ClothingImage,as:'images'}],transaction});
  const features = await ItemFeatures.findOne({where:{itemId},transaction});
  const stored = features?.imagePredictions || {};
  const localAutomatic=process.env.NODE_ENV==='development'&&['localhost','127.0.0.1','::1'].includes(process.env.DB_HOST);
  await ItemFeatures.upsert({itemId,imagePredictions:{...stored,
    learning_feedback:{...feedbackSnapshot(item,stored,input.trainingConsent===undefined ? localAutomatic : input.trainingConsent,input.reviewConfirmed),authorization_basis:input.trainingConsent===undefined?(localAutomatic?'local_fyp_automatic':'not_authorized'):'explicit_user_permission'}}},{transaction});
}
function eligibleFeedback(item, categories) {
  const stored = item.features?.imagePredictions || {}, f = stored.learning_feedback;
  if (!item.isAvailable || item.owner?.status !== 'active' || f?.training_consent !== true || f.review_confirmed !== true || !f.snapshot) return null;
  const image = (item.images || []).find(i => i.isPrimary);
  if (!image?.publicId || !image.url || image.id !== f.snapshot.cover_image_id || item.categoryId !== f.snapshot.category_id ||
      normalizedColor(item.color) !== f.snapshot.color || Object.entries(normalizedAttributes(stored)).some(([h,v])=>v!==f.snapshot.attributes?.[h])) return null;
  const category = categories.find(c=>c.id===item.categoryId && c.isActive);
  if (!category || categories.some(c=>c.parentId===category.id && c.isActive)) return null;
  let label = null;
  for (const value of taxonomy.category) if (supported('category',value) && mapCategory(value,categories).candidates.some(c=>c.id===category.id)) {
    if (label !== null) return null;label=value;
  }
  // A confirmed historical kurti/skirt is clothing, but never becomes a supported category target.
  const name=String(category.name).trim().toLowerCase();
  if (!label && !['kurti','kurtis','skirt','skirts'].includes(name)) return null;
  if (label==='other_fashion' && name==='other') {
    const parent=categories.find(c=>c.id===category.parentId);
    if (!parent || !/clothing|fashion|men|women|kids/i.test(parent.name)) return null;
  }
  const labels={},valid={};
  for (const head of Object.keys(taxonomy)) {labels[head]=null;valid[head]=false;}
  if (label) {labels.category=label;valid.category=true;}
  const colors=String(item.color||'').split(',').map(c=>c.trim().toLowerCase()).filter(Boolean);
  if (colors.length && colors.every(c=>taxonomy.color.includes(c))) {labels.color=[...new Set(colors)];valid.color=true;}
  for (const h of ['occasion','season','sleeve_length','pattern']) if((h!=='sleeve_length'||sleeveApplicable(category))&&supported(h,stored.confirmed_attributes?.[h])) {
    labels[h]=stored.confirmed_attributes[h];valid[h]=true;
  }
  if (!Object.values(valid).some(Boolean)) return null;
  return {item_id:item.id,image_id:image.id,source_url:image.url,source_public_id:image.publicId,
    fingerprint:createHash('sha256').update(String(item.id)+':'+f.revision).digest('hex'),labels,valid};
}
module.exports={feedbackSnapshot,invalidateFeedback,confirmFeedback,eligibleFeedback,supported};
