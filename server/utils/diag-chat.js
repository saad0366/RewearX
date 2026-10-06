'use strict';

/**
 * Quick diagnostic: prints what getConversations returns for given user IDs.
 * Usage: node utils/diag-chat.js 2 3
 */

const chatService = require('../services/chatService');

const ids = process.argv.slice(2).map((s) => parseInt(s, 10)).filter(Boolean);

(async () => {
  if (ids.length === 0) {
    console.log('Usage: node utils/diag-chat.js <userId> [<userId> ...]');
    process.exit(2);
  }
  for (const id of ids) {
    try {
      const result = await chatService.getConversations(id, 1, 50);
      console.log(`\n=== userId=${id} ===`);
      console.log(`count=${result.count}, items=${result.items.length}`);
      result.items.forEach((c, i) => {
        const swap = c.swapRequest;
        console.log(
          `  [${i}] id=${c.id} swapId=${swap?.id} status=${swap?.status} sender=${swap?.sender?.name}(#${swap?.senderId}) receiver=${swap?.receiver?.name}(#${swap?.receiverId})`
        );
      });
    } catch (err) {
      console.error(`FAILED for userId=${id}:`, err.message);
      console.error(err);
    }
  }
  process.exit(0);
})();
