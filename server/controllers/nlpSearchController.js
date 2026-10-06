'use strict';

const { nlpSearch } = require('../services/nlpSearchService');
const { listItems } = require('../services/itemService');
const { asyncHandler, paginated: paginatedRes, buildPagination } = require('../utils/response');

const search = asyncHandler(async (req, res) => {
  // Disable cache so NLP results always render fresh in the browser
  res.set('Cache-Control', 'no-store');

  const query = req.query.q?.trim() || '';
  const page = parseInt(req.query.page || '1', 10);
  const limit = parseInt(req.query.limit || '20', 10);
  const excludeUserId = req.user?.id;

  if (!query) {
    const result = await listItems({ excludeUserId }, page, limit);
    return paginatedRes(res, 200, result.items, buildPagination(result.count, page, limit), 'Items fetched.');
  }

  // Try NLP search first
  const nlpResults = await nlpSearch(query, excludeUserId, limit);

  if (nlpResults && nlpResults.length > 0) {
    return paginatedRes(
      res,
      200,
      nlpResults,
      buildPagination(nlpResults.length, 1, limit),
      'NLP search results.'
    );
  }

  // Fallback: keyword search
  const result = await listItems({ q: query, excludeUserId }, page, limit);
  return paginatedRes(res, 200, result.items, buildPagination(result.count, page, limit), 'Search results.');
});

module.exports = { search };
