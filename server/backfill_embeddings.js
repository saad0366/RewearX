/**
 * backfill_embeddings.js
 * =======================
 * One-time script: generates MiniLM embeddings for all existing products
 * that do not yet have a text_vector stored in item_features.
 *
 * Run AFTER the Flask AI service is running with the new MiniLM model.
 *
 * Usage:
 *   node backfill_embeddings.js
 *
 * Options (environment variables):
 *   BACKFILL_ALL=true   — regenerate embeddings even for products that already
 *                          have a text_vector (useful after a model change)
 *   BATCH_SIZE=20       — number of products to process in parallel (default 10)
 */

'use strict';

require('dotenv').config();

const { ClothingItem, ItemFeatures, Category, ClothingImage, User, sequelize } = require('./models');
const { generateAndStoreItemEmbedding, buildSemanticText } = require('./services/nlpSearchService');
const logger = require('./utils/logger');

const BACKFILL_ALL = process.env.BACKFILL_ALL === 'true';
const BATCH_SIZE   = parseInt(process.env.BATCH_SIZE || '10', 10);

async function run() {
  logger.info('[BACKFILL] Starting embedding backfill...');
  logger.info(`[BACKFILL] BACKFILL_ALL=${BACKFILL_ALL}, BATCH_SIZE=${BATCH_SIZE}`);

  // Fetch all available items with their related data
  const items = await ClothingItem.findAll({
    where: { isAvailable: true },
    include: [
      { model: User,         as: 'owner',    attributes: ['id', 'name', 'profileImage'] },
      { model: Category,     as: 'category' },
      { model: ClothingImage,as: 'images',   separate: true, order: [['orderIndex','ASC']] },
      { model: ItemFeatures, as: 'features', required: false },
    ],
    order: [['createdAt', 'DESC']],
  });

  logger.info(`[BACKFILL] Found ${items.length} available products`);

  // Filter which items need embedding
  const toProcess = BACKFILL_ALL
    ? items
    : items.filter((item) => {
        const stored = item.features?.textVector;
        if (!stored) return true;
        try {
          const parsed = JSON.parse(stored);
          const EMBEDDING_VERSION = process.env.EMBEDDING_VERSION || 'nlp-v2';
          if (Array.isArray(parsed)) return true; // Old array format, needs regeneration
          if (parsed.version !== EMBEDDING_VERSION) return true; // Version mismatch
          if (!Array.isArray(parsed.embedding) || parsed.embedding.length !== 384) return true;
          return false; // Valid and up-to-date
        } catch (_) {
          return true;
        }
      });

  logger.info(`[BACKFILL] Items needing embedding: ${toProcess.length}`);

  if (toProcess.length === 0) {
    logger.info('[BACKFILL] Nothing to do. All products have valid embeddings.');
    await sequelize.close();
    return;
  }

  let succeeded = 0;
  let failed    = 0;

  // Process in batches to avoid overwhelming Flask
  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BATCH_SIZE);
    logger.info(`[BACKFILL] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(toProcess.length / BATCH_SIZE)} (${batch.length} items)`);

    await Promise.all(
      batch.map(async (item) => {
        try {
          await generateAndStoreItemEmbedding(item);
          succeeded++;
        } catch (err) {
          failed++;
          logger.error(`[BACKFILL] Failed for item ${item.id} "${item.title}": ${err.message}`);
        }
      })
    );

    // Brief pause between batches
    if (i + BATCH_SIZE < toProcess.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  logger.info(`[BACKFILL] Complete. Success: ${succeeded}, Failed: ${failed}`);
  await sequelize.close();
}

run().catch((err) => {
  console.error('[BACKFILL] Fatal error:', err);
  process.exit(1);
});
