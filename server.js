const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

let activeConnection = null;
let activeUsername   = null;

async function connectToTikTok(username, socket) {
  if (activeConnection) {
    try { activeConnection.disconnect(); } catch {}
    activeConnection = null;
    activeUsername   = null;
  }

  let WebcastPushConnection;
  try {
    ({ WebcastPushConnection } = require('tiktok-live-connector'));
  } catch {
    socket.emit('tiktok_error', 'tiktok-live-connector not installed.\nRun: npm install tiktok-live-connector');
    return;
  }

  const conn = new WebcastPushConnection(username, {
    enableExtendedGiftInfo: true,
    reconnectEnabled: true,
    reconnectDelay: 3000,
  });

  try {
    const state = await conn.connect();
    activeConnection = conn;
    activeUsername   = username;
    console.log(`✅ Connected to @${username}`, state.roomId || '');
    io.emit('connected', { username });
  } catch (err) {
    console.error(`❌ @${username}:`, err.message);
    socket.emit('tiktok_error', `Could not connect to @${username}. Make sure they are live.`);
    return;
  }

  let likeBuffer = {};
  conn.on('like', (data) => {
    const user = data.uniqueId || data.nickname || 'viewer';
    likeBuffer[user] = (likeBuffer[user] || 0) + (data.likeCount || 1);
    while (likeBuffer[user] >= 10) {
      likeBuffer[user] -= 10;
      io.emit('spawn', { user, trigger: 'like', count: 1 });
    }
  });

  conn.on('chat', (data) => {
    const user = data.uniqueId || data.nickname || 'viewer';
    io.emit('spawn', { user, trigger: 'comment', count: 1 });
  });

  conn.on('social', (data) => {
    const user = data.uniqueId || data.nickname || 'viewer';
    const type = data.displayType || '';
    if (type.includes('follow')) io.emit('spawn', { user, trigger: 'follow', count: 3 });
    else if (type.includes('share')) io.emit('spawn', { user, trigger: 'share', count: 1 });
  });

  conn.on('gift', (data) => {
    if (data.giftType === 1 && !data.repeatEnd) return;
    const user     = data.uniqueId || data.nickname || 'viewer';
    const coins    = (data.diamondCount || 1) * (data.repeatCount || 1);
    const count    = Math.max(1, Math.min(coins, 200));
    const giftName = data.giftName || 'Gift';
    io.emit('spawn', { user, trigger: 'gift', giftName, coins, count });
  });

  conn.on('error',        (err) => console.error('TikTok error:', err.message));
  conn.on('disconnected', ()    => {
    console.log('TikTok disconnected');
    activeConnection = null;
    activeUsername   = null;
    io.emit('disconnected');
  });
}

io.on('connection', (socket) => {
  console.log('🎮 Browser connected');

  // If TikTok is already live, tell this client immediately
  if (activeConnection && activeUsername) {
    socket.emit('connected', { username: activeUsername });
  }

  socket.on('connect_tiktok', ({ username }) => {
    const clean = username.trim().replace(/^@/, '');
    if (!clean) { socket.emit('tiktok_error', 'No username provided.'); return; }

    // Already live on same channel — just confirm without reconnecting
    if (activeConnection && activeUsername === clean) {
      socket.emit('connected', { username: clean });
      return;
    }

    console.log(`🔌 Connecting to @${clean}...`);
    connectToTikTok(clean, socket);
  });

  socket.on('disconnect_tiktok', () => {
    if (activeConnection) {
      try { activeConnection.disconnect(); } catch {}
      activeConnection = null;
      activeUsername   = null;
    }
    socket.emit('disconnected');
  });

  socket.on('disconnect', () => console.log('👋 Browser disconnected'));
});

const PORT = process.env.PORT || 7738;
server.listen(PORT, () => console.log(`🚀 http://localhost:${PORT}`));
