"use strict";
// Search-only helpers. No writes, new schema fields, or embedding changes.
const OCCASIONS = Object.freeze(['casual', 'formal', 'party', 'wedding', 'sports']);
const normalize = value => typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, ' ') : '';
const supported = value => OCCASIONS.includes(normalize(value)) ? normalize(value) : null;

function queryOccasions(query, attributes) {
  return [...new Set((attributes?.occasion || []).filter(match =>
    match.source === 'explicit_keyword' && match.score === 1 && supported(match.name) &&
    new RegExp(`\\b${match.name === 'sports' ? 'sports(?:wear)?' : match.name}\\b`, 'i').test(query)
  ).map(match => normalize(match.name)))];
}

function itemOccasion(item) {
  let stored = item.features?.imagePredictions;
  if (typeof stored === 'string') { try { stored = JSON.parse(stored); } catch (_) { return null; } }
  if (!stored || stored.stale === true || stored.is_stale === true) return null;
  const primary = (item.images || []).find(image => image.isPrimary);
  const snapshotId = stored.learning_feedback?.snapshot?.cover_image_id;
  // A known changed cover makes the old image-attached labels unusable.
  if (snapshotId != null && (!primary || String(primary.id) !== String(snapshotId))) return null;
  if (Object.hasOwn(stored.confirmed_attributes || {}, 'occasion')) {
    // Explicit null/empty/invalid confirmation must never resurrect a prediction.
    return supported(stored.confirmed_attributes.occasion);
  }
  const raw = stored.predictions?.occasion;
  if (stored.provenance !== 'model_prediction' || stored.success !== true ||
      !/^[a-f0-9]{64}$/i.test(stored.image_sha256 || '') ||
      !raw || raw.valid === false || raw.supported === false || raw.stale === true ||
      typeof raw.confidence !== 'number' || !Number.isFinite(raw.confidence) ||
      raw.confidence < 0 || raw.confidence > 1) return null;
  // Predictions were captured for the first uploaded image. Cloudinary transforms
  // its bytes, so the original upload hash cannot be compared with a remote URL.
  // Fail closed unless the current cover is still that original upload.
  const coverTime = new Date(primary?.createdAt).getTime();
  const featureTime = new Date(item.features?.createdAt).getTime();
  if (!primary || primary.orderIndex == null || Number(primary.orderIndex) !== 0 ||
      !primary.createdAt || !item.features?.createdAt || !Number.isFinite(coverTime) ||
      !Number.isFinite(featureTime) || coverTime > featureTime) return null;
  return supported(raw.label);
}

function categoryPhrase(value) {
  return normalize(value).replace(/[-_]+/g, ' ').split(' ').map(word =>
    word.endsWith('sses') ? word.slice(0, -2) :
    word.endsWith('ies') ? word.slice(0, -3) + 'y' :
    word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word
  ).join(' ');
}

function occasionCategoryIds(query, categories) {
  const q = ' ' + categoryPhrase(query).replace(/[^a-z0-9 ]/g, ' ') + ' ';
  const matches = categories.filter(category => {
    const phrase = categoryPhrase(category.name);
    return !['men', 'women', 'unisex', 'kid', 'other'].includes(phrase) && q.includes(' ' + phrase + ' ');
  });
  // Prefer "t shirt" over its contained "shirt", but never resolve unrelated
  // garment intents ("dress or shirt") by guessing.
  const longest = matches.filter(a => !matches.some(b =>
    categoryPhrase(b.name) !== categoryPhrase(a.name) &&
    (' ' + categoryPhrase(b.name) + ' ').includes(' ' + categoryPhrase(a.name) + ' ')));
  if (new Set(longest.map(c => categoryPhrase(c.name))).size !== 1) return [];
  const ids = new Set(longest.map(c => c.id));
  let added;
  do { added = false; for (const c of categories) if (ids.has(c.parentId) && !ids.has(c.id)) { ids.add(c.id); added = true; } } while (added);
  return [...ids];
}

module.exports = { OCCASIONS, queryOccasions, itemOccasion, occasionCategoryIds };
