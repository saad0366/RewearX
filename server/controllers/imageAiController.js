'use strict';
const imageAiService = require('../services/imageAiService');
const { mapCategory } = require('../services/imageCategoryMapping');
const { Category } = require('../models');
const { getStorageCapabilities } = require('../services/listingAttributeService');
const { matchListings } = require('../services/visualMatchingService');
const { buildPagination } = require('../utils/response');
const ApiError = require('../utils/ApiError');
const { success, asyncHandler } = require('../utils/response');
const extract = asyncHandler(async (req,res) => {
  const mode = req.body?.mode || 'extract';
  if (!['extract','have','want'].includes(mode)) throw ApiError.badRequest('Use extract, have or want mode.');
  if (mode !== 'extract') {
    const categories = await Category.findAll({ attributes:['id','name','parentId','isActive'],raw:true });
    let attributes=req.body?.attributes;
    if (attributes === undefined) {
      const extracted=await imageAiService.extractImageFeatures(req.file);
      const mapping=mapCategory(extracted.predictions.category.label,categories);
      attributes={categoryId:mapping.category_id,colors:extracted.predictions.color.labels};
      for (const head of ['occasion','season','sleeve_length','pattern']) attributes[head]=extracted.predictions[head].label;
    }
    const page=Number(req.body?.page || 1),limit=Number(req.body?.limit || 20);
    if (!Number.isSafeInteger(page)||page<1||!Number.isSafeInteger(limit)||limit<1||limit>100) throw ApiError.badRequest('Invalid pagination.');
    const result=await matchListings(req.user.id,mode,attributes,categories,page,limit);
    return success(res,200,{...result,pagination:buildPagination(result.total,page,limit)},'Visual discovery results.');
  }
  const extraction = await imageAiService.extractImageFeatures(req.file);
  const categories = await Category.findAll({ attributes: ['id','name','parentId','isActive'], raw: true });
  return success(res,200,{
    operation: 'extract', matching_available: false,
    predictions: extraction.predictions, model: extraction.model, image_sha256: extraction.image_sha256,
    category_mapping: mapCategory(extraction.predictions.category.label,categories),
    storage: await getStorageCapabilities(),
    provenance: 'model_prediction', human_confirmed: false,
  },'Image attributes extracted; review suggestions before use.');
});
const capabilities = asyncHandler(async (_req,res) => success(res,200,await getStorageCapabilities(),'Listing attribute storage capabilities.'));
module.exports = { extract, capabilities };
