/**
 * tiktok-connector.js
 * ───────────────────────────────────────────────────────────────────
 * Drop-in TikTok Live connector for TikTok Space Impact.
 *
 * To use real TikTok Live:
 *   npm install tiktok-live-connector
 *   Pass --tiktok @yourusername when starting the server
 *   node server.js --tiktok @yourusername
 *
 * Falls back to simulation mode if no username is provided or the
 * package isn't installed.
 * ───────────────────────────────────────────────────────────────────
 */

const GIFTS = require('./gifts-config');

// TikTok gift ID → our gift key mapping (common gifts)
const TIKTOK_GIFT_MAP = {
  // ID  : key
  5655:   'rose',
  5694:   'icecream',
  7076:   'universe',
  6829:   'lion',
  6406:   'rocket',
  7777:   'galaxy',
  // Add more mappings as needed by checking data.giftId in the gift event
};

// Name-based fallback mapping
const TIKTOK_NAME_MAP = {
  'Rose':        'rose',
  'Ice Cream':   'icecream',
  'Universe':    'universe',
  'Lion':        'lion',
  'Rocket':      'rocket',
  'Galaxy':      'galaxy',
};

function resolveGiftKey(data) {
  if (TIKTOK_GIFT_MAP[data.giftId]) return TIKTOK_GIFT_MAP[data.giftId];
  if (TIKTOK_NAME_MAP[data.giftName]) return TIKTOK_NAME_MAP[data.giftName];

  // Coin-value fallback
  const coins = data.diamondCount || 0;
  if (coins >= 5000) return 'galaxy';
  if (coins >= 1000) return 'rocket';
  if (coins >= 500)  return 'lion';
  if (coins >= 100)  return 'universe';
  if (coins >= 5)    return 'icecream';
  return 'rose';
}

/**
 * Connect to a real TikTok Live stream.
 * @param {string} username - TikTok @username
 * @param {function} onEvent - callback(event) where event = { type, user, gift, giftKey, count }
 * @returns {Promise<{ disconnect: function }>}
 */
async function connectTikTok(username, onEvent) {
  let WebcastPushConnection;
  try {
    ({ WebcastPushConnection } = require('tiktok-live-connector'));
  } catch {
    throw new Error(
      'tiktok-live-connector not installed. Run: npm install tiktok-live-connector'
    );
  }

  const connection = new WebcastPushConnection(username, {
    enableExtendedGiftInfo: true,
    reconnectEnabled: true,
    reconnectDelay: 3000,
  });

  const state = await connection.connect();
  console.log(`✅ Connected to TikTok Live: ${username}`, state);

  // Gifts
  connection.on('gift', (data) => {
    // Only fire on streakEnd to avoid spam during gift streaks
    if (data.giftType === 1 && !data.repeatEnd) return;

    const giftKey = resolveGiftKey(data);
    const gift = GIFTS[giftKey];
    if (!gift) return;

    onEvent({
      type: 'gift',
      user: data.uniqueId || data.nickname || 'viewer',
      giftKey,
      gift,
      count: data.repeatCount || 1,
      timestamp: Date.now(),
    });
  });

  // Comments
  connection.on('chat', (data) => {
    onEvent({
      type: 'comment',
      user: data.uniqueId || data.nickname || 'viewer',
      text: data.comment,
      timestamp: Date.now(),
    });
  });

  // Follows
  connection.on('social', (data) => {
    if (data.displayType === 'pm_mt_new_follower_rank_tips') {
      onEvent({
        type: 'gift',
        user: data.uniqueId || 'viewer',
        giftKey: 'follow',
        gift: GIFTS['follow'],
        count: 1,
        timestamp: Date.now(),
      });
    }
  });

  // Shares
  connection.on('social', (data) => {
    if (data.displayType === 'pm_mt_guidance_share') {
      onEvent({
        type: 'gift',
        user: data.uniqueId || 'viewer',
        giftKey: 'share',
        gift: GIFTS['share'],
        count: 1,
        timestamp: Date.now(),
      });
    }
  });

  connection.on('error', (err) => console.error('TikTok error:', err));
  connection.on('disconnected', () => console.log('TikTok disconnected'));

  return { disconnect: () => connection.disconnect() };
}

module.exports = { connectTikTok, resolveGiftKey };
