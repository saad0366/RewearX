'use strict';
const axios = require('axios');
const { createHash } = require('node:crypto');
const ApiError = require('../utils/ApiError');
const taxonomy = require('../config/imageTaxonomy');
const { trustedCheckpointHashes } = require('./imageModelRegistry');
const CHECKPOINT_SHA256 = 'b2911bd9d1ed6e737c3e2a4695518d48eb829fd2489fa224fa4b317340af785a';
const UNSUPPORTED = { category: ['skirt'], sleeve_length: ['half'], season: ['all_season'] };
const INTERPRETATION = 'Predictions and confidence are conditional on supported classes; unsupported inputs are not detected.';
const MIME = new Set(['image/jpeg','image/jpg','image/png','image/webp']);
const MAX_BYTES = 5 * 1024 * 1024;
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const probability = v => Number.isFinite(v) && v >= 0 && v <= 1;
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const failure = (status, code, message) => new ApiError(status, message, { code });
function validatePredictions(data) {
  const invalid = () => { throw failure(502,'invalid_image_ai_response','Image AI returned an incompatible response.'); };
  if (!isObject(data) || data.success !== true || !isObject(data.predictions)
      || !equal(Object.keys(data.predictions).sort(), Object.keys(taxonomy).sort())) invalid();
  if (!isObject(data.model) || !trustedCheckpointHashes().includes(data.model.checkpoint_sha256)
      || data.model.architecture !== 'efficientnet_b0_six_head_v2') invalid();
  for (const [head, labels] of Object.entries(taxonomy)) {
    const p = data.predictions[head];
    if (!isObject(p) || !probability(p.confidence)) invalid();
    if (head === 'color') {
      if (!Array.isArray(p.labels) || !isObject(p.probabilities)
          || !equal(Object.keys(p.probabilities).sort(), [...labels].sort())
          || !Object.values(p.probabilities).every(probability)) invalid();
      const selected = labels.filter(c => p.probabilities[c] >= 0.5);
      const label = selected.length === 0 ? null : selected.length === 1 ? selected[0] : selected.length === 2 ? selected : 'multicolor';
      const confidence = selected.length ? Math.min(...selected.map(c => p.probabilities[c])) : 0;
      if (!equal(p.labels,selected) || !equal(p.label,label) || Math.abs(p.confidence-confidence) > 1e-5) invalid();
    } else {
      if (!labels.includes(p.label) || (UNSUPPORTED[head] || []).includes(p.label)) invalid();
      if (UNSUPPORTED[head] && (!equal(p.unsupported_classes, UNSUPPORTED[head])
          || p.support_status !== 'limited_classes' || p.confidence_interpretation !== INTERPRETATION)) invalid();
    }
  }
  // Preserve full color and support metadata; never write predictions into confirmed listing fields.
  return JSON.parse(JSON.stringify(data));
}
async function extractImageFeatures(file) {
  if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    throw failure(400,'missing_image','One non-empty image is required.');
  }
  if (!MIME.has(file.mimetype)) throw failure(415,'unsupported_image_type','Use JPEG, PNG or WebP.');
  if (file.buffer.length > MAX_BYTES) throw failure(413,'image_too_large','Image exceeds 5 MB.');
  const body = new FormData();
  body.append('image', new Blob([file.buffer], { type: file.mimetype }), 'image');
  const baseUrl = (process.env.IMAGE_AI_SERVICE_URL || 'http://localhost:5001').replace(/\/+$/,'');
  let data;
  try {
    ({ data } = await axios.post(`${baseUrl}/api/image/extract`, body, {
      timeout: 10000, signal: AbortSignal.timeout(10000), maxRedirects: 0,
      maxContentLength: 64 * 1024, maxBodyLength: MAX_BYTES + 1024 * 1024,
    }));
  } catch (err) {
    if (['ECONNABORTED','ETIMEDOUT','ERR_CANCELED'].includes(err.code)) {
      throw failure(504,'image_ai_timeout','Image AI timed out.');
    }
    if ([400,413,415].includes(err.response?.status)) {
      const codes = new Set(['missing_image','invalid_image','expected_one_image','image_too_large','unsupported_image_type']);
      const code = codes.has(err.response.data?.error) ? err.response.data.error : 'invalid_image';
      throw failure(err.response.status,code,'Image AI rejected the image.');
    }
    if (!err.response || err.response.status === 503) {
      throw failure(503,'image_ai_unavailable','Image AI is unavailable or its checkpoint is not ready.');
    }
    throw failure(502,'image_ai_inference_failed','Image AI inference failed.');
  }
  const result = validatePredictions(data);
  return { ...result, image_sha256: createHash('sha256').update(file.buffer).digest('hex') };
}
// Future persistence only, after migration + opt-in. No listing hook in Stage 1.
function buildPredictionStorage(extraction) {
  const validated = validatePredictions(extraction);
  if (!/^[a-f0-9]{64}$/.test(extraction.image_sha256 || '')) throw failure(400,'missing_image_hash','Image hash required.');
  return { imagePredictions: { ...validated, image_sha256: extraction.image_sha256,
    provenance: 'model_prediction', human_confirmed: false }, imageProcessedAt: new Date() };
}
module.exports = { extractImageFeatures, validatePredictions, buildPredictionStorage, CHECKPOINT_SHA256, UNSUPPORTED, INTERPRETATION };
