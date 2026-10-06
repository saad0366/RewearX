'use strict';

/**
 * NLP Search Service — MiniLM Semantic Search
 * =============================================
 *
 * Pipeline:
 *  1. Receive natural-language query
 *  2. Extract structured attributes (category/gender/color/condition/occasion)
 *     ONLY if the model is confident (threshold 0.82 for category, 0.85 for gender/condition/color)
 *  3. Embed the query with MiniLM (384-dim, L2-normalised)
 *  4. Pull candidate products from MySQL (availability + active owner)
 *     → For generic queries: NO category/gender WHERE clause
 *     → Only apply explicit structured filters when confidence is high
 *  5. Build a rich semantic text for each product from its DB fields
 *  6. If a stored embedding exists (item_features.text_vector) → use it
 *     Otherwise embed dynamically via Flask /api/rank (fallback)
 *  7. Compute cosine similarity (dot product on normalised vectors)
 *  8. Hybrid score = semantic_score + small keyword_boost
 *  9. Sort descending; apply a conservative relative threshold
 * 10. Return top-N results
 *
 * Occasion intent is explicit; literal category names may normalize plurals.
 * No inferred occasion→category mappings or embedding changes.
 */

const axios  = require('axios');
const { Op, fn, col } = require('sequelize');
const { ClothingItem, ClothingImage, ItemFeatures, Category, User } = require('../models');
const logger = require('../utils/logger');
const { OCCASIONS, queryOccasions, itemOccasion, occasionCategoryIds } = require('./nlpOccasion');

const AI_URL = process.env.AI_SERVICE_URL || 'http://localhost:5000';
const TIMEOUT = 20000; // ms

// ─── Configuration ────────────────────────────────────────────────────────
const WEIGHTS = {
  semantic: parseFloat(process.env.RANK_WEIGHT_SEMANTIC || '0.55'),
  title: parseFloat(process.env.RANK_WEIGHT_TITLE || '0.20'),
  attributes: parseFloat(process.env.RANK_WEIGHT_ATTR || '0.15'),
  lexical: parseFloat(process.env.RANK_WEIGHT_LEXICAL || '0.10'),
};
const DEBUG_SCORES = process.env.DEBUG_NLP_SCORES === 'true';

const EMBEDDING_VERSION = process.env.EMBEDDING_VERSION || 'nlp-v2';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'sentence-transformers/all-MiniLM-L6-v2';

// ─── Sequelize include spec ───────────────────────────────────────────────
const includeOwnerAndImages = [
  {
    model: User,
    as: 'owner',
    attributes: ['id', 'name', 'profileImage'],
    where: { status: 'active' },
  },
  { model: Category, as: 'category' },
  { model: ClothingImage, as: 'images', separate: true, order: [['orderIndex', 'ASC']] },
];

// ─── DB helpers ───────────────────────────────────────────────────────────

async function getDistinctColors() {
  const rows = await ClothingItem.findAll({
    attributes: [[fn('DISTINCT', col('color')), 'color']],
    where: { isAvailable: true, color: { [Op.ne]: null } },
    raw: true,
  });
  return rows.map((r) => r.color).filter(Boolean);
}

// ─── Flask helpers ────────────────────────────────────────────────────────

async function flaskPost(path, body) {
  const resp = await axios.post(`${AI_URL}${path}`, body, { timeout: TIMEOUT });
  return resp.data;
}

// ─── Attribute extraction ─────────────────────────────────────────────────

async function extractAttributes(query, categoryList, colorValues) {
  return flaskPost('/api/query/attributes', {
    query,
    threshold: 0.80,          // conservative — only lock if very confident
    categories: categoryList,
    colors:     colorValues.map((c) => ({ name: c, description: c })),
    genders:    ['male', 'female', 'unisex'].map((g) => ({ name: g, description: g })),
    conditions: ['new', 'like_new', 'good', 'fair'].map((c) => ({ name: c, description: c })),
    occasions: OCCASIONS.map((name) => ({ name, description: name })),
  });
}

// ─── Semantic text builder ────────────────────────────────────────────────
/**
 * Build a rich semantic text from real DB fields.
 * No invented fields, no injected query terms.
 * Field order roughly mirrors what matters most for semantic matching.
 */
function buildSemanticText(item) {
  const parts = [];

  // Title — most important signal
  if (item.title)       parts.push(`Product title: ${item.title}`);

  // Category / subcategory hierarchy
  const cat = item.category;
  if (cat) {
    if (cat.parentId === null) {
      parts.push(`Category: ${cat.name}`);
    } else {
      parts.push(`Product type: ${cat.name}`);
    }
    if (cat.description) parts.push(`Category description: ${cat.description}`);
  }

  // Description — rich semantic content
  if (item.description && item.description.trim()) {
    parts.push(`Description: ${item.description.trim()}`);
  }

  // Structured attributes
  if (item.brand)     parts.push(`Brand: ${item.brand}`);
  if (item.gender)    parts.push(`Gender: ${item.gender}`);
  if (item.color)     parts.push(`Color: ${item.color}`);
  if (item.condition) parts.push(`Condition: ${item.condition.replace('_', ' ')}`);
  if (item.size)      parts.push(`Size: ${item.size}`);

  return parts.join('\n');
}

// ─── Explicit category name matching ─────────────────────────────────────
/**
 * Only lock to a specific category if the user explicitly typed its name.
 * Generic queries like "warm clothes" must NOT be locked to any category.
 */
function findExplicitCategory(query, categories) {
  const q = query.toLowerCase();
  // Sort by name length desc so "T-Shirts" is tested before "Shirts"
  const sorted = [...categories]
    .filter((c) => !['men', 'women', 'unisex'].includes(c.name.toLowerCase()))
    .sort((a, b) => b.name.length - a.name.length);

  for (const cat of sorted) {
    const escaped = cat.name.toLowerCase().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    const re = new RegExp(`(?:^|\\b)${escaped}(?:$|\\b)`, 'i');
    if (re.test(q)) return cat;
  }
  return null;
}

// ─── Main search function ─────────────────────────────────────────────────

async function nlpSearch(query, excludeUserId, limit = 20) {
  const [allCategories, colorValues] = await Promise.all([
    Category.findAll({ where: { isActive: true } }),
    getDistinctColors(),
  ]);

  logger.info(`[NLP] Query: "${query}" | categories: ${allCategories.length} | colors: ${colorValues.length}`);

  const categoryList = allCategories.map((c) => ({
    id:          c.id,
    name:        c.name,
    description: c.description || `${c.name} clothing and fashion apparel`,
  }));

  // ── Step 1: get query embedding + attribute extraction in parallel ──
  let attributes    = {};
  let queryEmbedding = null;

  try {
    const [attrRes, embRes] = await Promise.all([
      extractAttributes(query, categoryList, colorValues),
      flaskPost('/api/extract', { text: query }),
    ]);
    attributes    = attrRes;
    queryEmbedding = embRes?.embedding || null;

    logger.info(`[NLP] Embedding dims: ${queryEmbedding?.length}`);
    logger.info(`[NLP] Attributes: ${JSON.stringify(attributes)}`);
  } catch (err) {
    logger.warn(`[NLP] Flask unavailable, falling back to keyword search: ${err.message}`);
    return null;    // triggers keyword fallback in controller
  }

  if (!queryEmbedding || queryEmbedding.length === 0) {
    logger.warn('[NLP] Empty embedding received from Flask');
    return null;
  }

  const occasionIntent = queryOccasions(query, attributes);

  // ── Step 2: build MySQL WHERE clause ──────────────────────────────────
  const where = { isAvailable: true };

  if (excludeUserId && !isNaN(Number(excludeUserId))) {
    where.userId = { [Op.ne]: Number(excludeUserId) };
  }

  // Category: only apply if the user explicitly typed a category name
  const explicitCat = findExplicitCategory(query, allCategories);
  const occasionCatIds = occasionIntent.length ? occasionCategoryIds(query, allCategories) : [];
  if (occasionCatIds.length) {
    // Literal singular/plural category intent, not a semantic occasion→category mapping.
    where.categoryId = { [Op.in]: occasionCatIds };
  } else if (explicitCat) {
    const subCatIds = allCategories
      .filter((c) => c.parentId === explicitCat.id)
      .map((c) => c.id);
    where.categoryId = subCatIds.length
      ? { [Op.in]: [explicitCat.id, ...subCatIds] }
      : explicitCat.id;
    logger.info(`[NLP] Explicit category lock: "${explicitCat.name}" (id=${explicitCat.id})`);
  } else {
    logger.info(`[NLP] Generic/occasion query — no category filter applied`);
  }

  // Gender: only add WHERE if confidence is very high (≥ 0.85)
  // This prevents "warm clothes" from silently becoming "male only"
  const topGender = (attributes.gender || []).find((g) => g.score >= 0.85);
  if (topGender) {
    where.gender = { [Op.in]: [topGender.name, 'unisex'] };
    logger.info(`[NLP] Gender filter: ${topGender.name} (score=${topGender.score.toFixed(3)})`);
  }

  // Condition: only if very high confidence
  const topCondition = (attributes.condition || []).find((c) => c.score >= 0.85);
  if (topCondition) {
    where.condition = topCondition.name;
    logger.info(`[NLP] Condition filter: ${topCondition.name} (score=${topCondition.score.toFixed(3)})`);
  }

  // Color: only if very high confidence
  const topColor = (attributes.color || []).find((c) => c.score >= 0.85);
  if (topColor) {
    where.color = { [Op.like]: `%${topColor.name}%` };
    logger.info(`[NLP] Color filter: ${topColor.name} (score=${topColor.score.toFixed(3)})`);
  }

  logger.info(`[NLP] MySQL WHERE: ${JSON.stringify(where)}`);

  // ── Step 3: fetch candidates ──────────────────────────────────────────
  const dbItems = await ClothingItem.findAll({
    where,
    include: [
      ...includeOwnerAndImages,
      { model: ItemFeatures, as: 'features', required: false },
    ],
    order: [['createdAt', 'DESC']],
    limit: 150,   // pull more candidates for better recall
  });

  logger.info(`[NLP] DB candidates: ${dbItems.length}`);
  if (!dbItems.length) return [];

  // ── Step 4: build payload for /api/rank ──────────────────────────────
  //
  // For each item: use the stored embedding (text_vector) if it exists,
  // otherwise send the semantic text for dynamic embedding.
  //
  const rankPayload = dbItems.map((item) => {
    const stored = item.features?.textVector || null;
    let parsedEmbedding = null;

    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          parsedEmbedding = parsed;
        } else if (parsed && Array.isArray(parsed.embedding)) {
          parsedEmbedding = parsed.embedding;
        }
        
        // Validate: must be a non-empty numeric array
        if (!parsedEmbedding || parsedEmbedding.length === 0) {
          parsedEmbedding = null;
        }
      } catch (_) {
        parsedEmbedding = null;
      }
    }

    if (parsedEmbedding) {
      return { id: item.id, embedding: parsedEmbedding };
    } else {
      // Dynamic fallback: send semantic text to Flask
      return { id: item.id, text: buildSemanticText(item) };
    }
  });

  const storedCount  = rankPayload.filter((p) => p.embedding).length;
  const dynamicCount = rankPayload.filter((p) => p.text).length;
  logger.info(`[NLP] Ranking payload: ${storedCount} stored, ${dynamicCount} dynamic`);

  // ── Step 5: semantic ranking ──────────────────────────────────────────
  let rankings = [];
  try {
    const rankRes = await flaskPost('/api/rank', {
      query_embedding: queryEmbedding,
      items:           rankPayload,
    });
    rankings = rankRes.rankings || [];
  } catch (err) {
    logger.warn(`[NLP] Ranking failed: ${err.message}. Returning raw DB order.`);
    return dbItems.slice(0, limit).map((item) => ({ ...item.toJSON(), matchScore: 0 }));
  }

  // ── Step 6: Phase 3 & 4 — Multi-Signal Stage-2 Re-ranking ────────────
  const stopWords = new Set([
    'and', 'for', 'with', 'the', 'made', 'from', 'that', 'this',
    'suit', 'suitable', 'perfect', 'ideal', 'designed', 'need',
    'something', 'want', 'looking', 'find', 'get', 'clothes', 'clothing'
  ]);
  const queryTokens = query.toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2 && !stopWords.has(t));

  // Phase 9: True Two-Stage Retrieval. Limit to top K candidates for Stage 2.
  const MAX_CANDIDATES = parseInt(process.env.RANK_CANDIDATES || '50', 10);
  rankings.sort((a, b) => b.score - a.score);
  const topCandidates = rankings.slice(0, MAX_CANDIDATES);
  const rankMap = new Map(topCandidates.map((r) => [r.id, r.score]));
  
  // Filter the DB items to only those that made it through Stage 1
  const candidateItems = dbItems.filter(item => rankMap.has(item.id));

  // Helper for lexical overlap (exact token match)
  const getOverlapScore = (tokens, text) => {
    if (!tokens.length || !text) return 0;
    const targetTokens = new Set(
      text.toLowerCase().split(/[\s,.-]+/).filter(t => t.length > 2)
    );
    let matchCount = 0;
    tokens.forEach((t) => { if (targetTokens.has(t)) matchCount++; });
    return matchCount / tokens.length;
  };

  const scored = candidateItems.map((item) => {
    const itemObj = item.toJSON();
    const semanticScore = rankMap.get(item.id) ?? 0;

    // Title score
    const titleScore = getOverlapScore(queryTokens, item.title || '');

    // Attribute score
    const attributesText = [
      item.brand, item.gender, item.color, item.condition, item.category?.name
    ].filter(Boolean).join(' ');
    const attributeScore = getOverlapScore(queryTokens, attributesText);

    // Lexical full-text score
    const fullText = buildSemanticText(item);
    const lexicalScore = getOverlapScore(queryTokens, fullText);

    // A small positive bonus only. Missing/different occasion has no penalty.
    const occasionScore = occasionIntent.length && occasionIntent.includes(itemOccasion(item)) ? 0.08 : 0;

    // Combined transparent score
    const finalScore = 
      (semanticScore * WEIGHTS.semantic) +
      (titleScore * WEIGHTS.title) +
      (attributeScore * WEIGHTS.attributes) +
      (lexicalScore * WEIGHTS.lexical) + occasionScore;

    return {
      ...itemObj,
      matchScore: finalScore,
      debugScores: DEBUG_SCORES ? {
        semanticScore: semanticScore.toFixed(3),
        titleScore: titleScore.toFixed(3),
        attributeScore: attributeScore.toFixed(3),
        lexicalScore: lexicalScore.toFixed(3),
        ...(occasionIntent.length ? { occasionScore: occasionScore.toFixed(3) } : {}),
        finalScore: finalScore.toFixed(3),
      } : undefined
    };
  });

  scored.sort((a, b) => b.matchScore - a.matchScore);

  // ── Step 7: Phase 6 — Score Calibration (Dynamic Threshold) ──────────
  const topScore = scored[0]?.matchScore || 0;
  const thresholdStrategy = process.env.THRESHOLD_STRATEGY || 'relative';
  
  let relativeThreshold = 0.15;
  if (thresholdStrategy === 'relative') {
      const multiplier = parseFloat(process.env.THRESHOLD_MULTIPLIER || '0.70');
      const floor = parseFloat(process.env.THRESHOLD_FLOOR || '0.15');
      relativeThreshold = Math.max(floor, topScore * multiplier);
  } else if (thresholdStrategy === 'absolute') {
      relativeThreshold = parseFloat(process.env.THRESHOLD_ABSOLUTE || '0.40');
  }

  logger.info(`[NLP] strategy=${thresholdStrategy}, topScore=${topScore.toFixed(3)}, threshold=${relativeThreshold.toFixed(3)}`);

  // Log the top-10 for debugging
  scored.slice(0, 10).forEach((item, i) => {
    logger.info(
      `[NLP] Rank ${i + 1}: "${item.title}" ` +
      `final=${item.matchScore.toFixed(4)} ` +
      (DEBUG_SCORES ? `[sem=${item.debugScores.semanticScore} tit=${item.debugScores.titleScore} att=${item.debugScores.attributeScore} lex=${item.debugScores.lexicalScore}] ` : '') +
      `${item.matchScore >= relativeThreshold ? 'PASS' : 'FAIL'}`
    );
  });

  const filtered = scored.filter((item) => item.matchScore >= relativeThreshold);
  const results  = (filtered.length > 0 ? filtered : scored).slice(0, limit);

  logger.info(`[NLP] After threshold: ${filtered.length} → returning ${results.length}`);
  return results;
}

// ─── Embedding generation for item create/update ─────────────────────────
/**
 * Called by itemService after creating or updating a product.
 * Generates a MiniLM embedding for the product's semantic text and
 * stores it in item_features.text_vector.
 *
 * This is a fire-and-forget operation — search works even if it fails
 * (the dynamic fallback in nlpSearch handles missing embeddings).
 */
async function generateAndStoreItemEmbedding(item) {
  try {
    // Phase 10: State tracking
    await ItemFeatures.upsert({ itemId: item.id, embeddingStatus: 'processing', embeddingError: null });

    const semanticText = buildSemanticText(item);

    const resp = await flaskPost('/api/embed-item', { semantic_text: semanticText });
    const embedding = resp?.embedding;

    if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
      throw new Error('embed-item returned empty embedding');
    }

    // Phase 9: Versioned embedding storage
    const embeddingData = {
        model: EMBEDDING_MODEL,
        dimension: embedding.length,
        version: EMBEDDING_VERSION,
        embedded_at: new Date().toISOString(),
        embedding: embedding
    };

    await ItemFeatures.upsert({
      itemId:      item.id,
      textVector:  JSON.stringify(embeddingData),
      embeddingStatus: 'completed',
      processedAt: new Date(),
    });

    logger.info(`[NLP] Stored ${embedding.length}-dim versioned embedding for item ${item.id} ("${item.title}")`);
  } catch (err) {
    logger.warn(`[NLP] Failed to store embedding for item ${item.id}: ${err.message}`);
    try {
      await ItemFeatures.upsert({ itemId: item.id, embeddingStatus: 'failed', embeddingError: err.message });
    } catch (dbErr) {
      logger.error(`[NLP] Also failed to update embeddingStatus to failed: ${dbErr.message}`);
    }
  }
}

module.exports = { nlpSearch, generateAndStoreItemEmbedding, buildSemanticText };
