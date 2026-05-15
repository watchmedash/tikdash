const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { WebcastPushConnection } = require('tiktok-live-connector');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());

const COUNTRIES = {
  ksa:  { id: 'ksa',  name: 'KSA',       code: 'sa', color: '#27AE60', points: 0 },
  uae:  { id: 'uae',  name: 'UAE',        code: 'ae', color: '#E74C3C', points: 0 },
  qat:  { id: 'qat',  name: 'Qatar',      code: 'qa', color: '#8E44AD', points: 0 },
  kwt:  { id: 'kwt',  name: 'Kuwait',     code: 'kw', color: '#F39C12', points: 0 },
  egy:  { id: 'egy',  name: 'Egypt',      code: 'eg', color: '#3498DB', points: 0 },
  jor:  { id: 'jor',  name: 'Jordan',     code: 'jo', color: '#1ABC9C', points: 0 },
  bhr:  { id: 'bhr',  name: 'Bahrain',    code: 'bh', color: '#E67E22', points: 0 },
  omn:  { id: 'omn',  name: 'Oman',       code: 'om', color: '#C0392B', points: 0 },
  lbn:  { id: 'lbn',  name: 'Lebanon',    code: 'lb', color: '#00BCD4', points: 0 },
  irq:  { id: 'irq',  name: 'Iraq',       code: 'iq', color: '#2ECC71', points: 0 },
  pse:  { id: 'pse',  name: 'Palestine',  code: 'ps', color: '#9B59B6', points: 0 },
  mar:  { id: 'mar',  name: 'Morocco',    code: 'ma', color: '#E91E63', points: 0 },
  pak:  { id: 'pak',  name: 'PAK',        code: 'pk', color: '#1B5E20', points: 0 },
  ind:  { id: 'ind',  name: 'IND',        code: 'in', color: '#FF6D00', points: 0 },
  phl:  { id: 'phl',  name: 'PHL',        code: 'ph', color: '#1565C0', points: 0 },
  npl:  { id: 'npl',  name: 'NPL',        code: 'np', color: '#B71C1C', points: 0 },
};

// Display order when scores are tied (GCC first, then Levant, then North Africa)
const COUNTRY_ORDER = ['ksa', 'uae', 'qat', 'kwt', 'egy', 'jor', 'bhr', 'omn', 'lbn', 'irq', 'pse', 'mar', 'pak', 'ind', 'phl', 'npl'];

// 1-coin TikTok gift → country ID
const GIFT_MAP = {
  'Rose':             'ksa',
  'Pop':              'uae',
  'TikTok':           'qat',
  'GG':               'kwt',
  'Love you so much': 'egy',
  'Ice Cream Cone':   'jor',
  'Glow Stick':       'bhr',
  'Oldies':           'omn',
  'Wink wink':        'lbn',
  'Freestyle':        'irq',
  'Cake Slice':       'pse',
  'Power of Diamond': 'mar',
  'Love Morocco':     'pak',
  'Enjoy Music':      'ind',
  'Congratulations':  'phl',
  'Creeper':          'npl',
};

let tiktokConnection = null;
let connectedUsername = null;
let connectionStatus = 'disconnected';
let connectionError = null;
let connectedSince = null;

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(msg); });
}

function getLeaderboard() {
  return COUNTRY_ORDER
    .map(id => COUNTRIES[id])
    .sort((a, b) => b.points - a.points)
    .map((c, i) => ({ ...c, rank: i + 1 }));
}

function broadcastStatus() {
  broadcast({ type: 'connection_status', status: connectionStatus, username: connectedUsername, error: connectionError });
}

function resetScores() {
  COUNTRY_ORDER.forEach(id => { COUNTRIES[id].points = 0; });
}

function connectToTikTok(username) {
  if (tiktokConnection) { try { tiktokConnection.disconnect(); } catch {} tiktokConnection = null; }

  const clean = username.replace(/^@/, '').trim();

  if (connectedUsername !== clean) {
    resetScores();
    broadcast({ type: 'init', racers: getLeaderboard(), status: 'connecting', username: clean });
  }

  connectedSince = null;
  connectedUsername = clean;
  connectionStatus = 'connecting';
  connectionError = null;
  broadcastStatus();
  console.log(`\n🔗 Connecting to @${clean}...`);

  const conn = new WebcastPushConnection(clean, {
    processInitialData: false,
    enableExtendedGiftInfo: false,
    enableWebsocketUpgrade: true,
    requestPollingIntervalMs: 2000,
  });
  tiktokConnection = conn;

  conn.connect()
    .then(state => {
      connectionStatus = 'connected';
      connectionError = null;
      connectedSince = Date.now();
      broadcastStatus();
      console.log(`✅ Connected to @${clean} | Room: ${state.roomId}`);
    })
    .catch(err => {
      connectionStatus = 'error';
      connectionError = err.message || 'Failed to connect. Make sure the user is currently LIVE.';
      broadcastStatus();
      console.error(`❌ Connect failed: ${err.message}`);
      tiktokConnection = null;
    });

  conn.on('gift', d => {
    // For streakable gifts (giftType===1): each intermediate event = 1 tap; skip the final repeatEnd to avoid double-counting
    if (d.giftType === 1 && d.repeatEnd) return;

    const countryId = GIFT_MAP[d.giftName];
    if (!countryId) {
      console.log(`🎁 [unmapped] "${d.giftName}" from ${d.nickname} (${d.diamondCount} coins) — add to GIFT_MAP if needed`);
      return;
    }

    COUNTRIES[countryId].points += 1;
    broadcast({ type: 'point_update', racers: getLeaderboard(), giftName: d.giftName, countryId });
    console.log(`🎁 ${d.nickname}: ${d.giftName} → ${COUNTRIES[countryId].name} (+1 | total: ${COUNTRIES[countryId].points})`);
  });

  conn.on('disconnected', () => {
    console.log(`⚠️  Disconnected (status=${connectionStatus}, age=${connectedSince ? Date.now()-connectedSince : 'n/a'}ms)`);
    if (connectionStatus !== 'connected') { console.log('   → ignored'); return; }
    if (connectedSince && (Date.now() - connectedSince) < 5000) { console.log('   → ignored (WS upgrade)'); return; }
    connectionStatus = 'disconnected';
    connectedSince = null;
    broadcastStatus();
    console.log('   → real disconnect, notifying clients');
  });

  conn.on('error', err => {
    console.error(`TikTok error (status=${connectionStatus}):`, err.message || err);
  });
}

app.get('/control', (req, res) => res.sendFile(path.join(__dirname, '../public/control.html')));

app.post('/connect', (req, res) => {
  const { username } = req.body;
  if (!username?.trim()) return res.status(400).json({ error: 'Username required' });
  connectToTikTok(username.trim());
  res.json({ success: true });
});

app.post('/disconnect', (req, res) => {
  if (tiktokConnection) { try { tiktokConnection.disconnect(); } catch {} tiktokConnection = null; }
  connectionStatus = 'disconnected'; connectedSince = null;
  broadcastStatus();
  broadcast({ type: 'init', racers: getLeaderboard(), status: 'disconnected', username: connectedUsername });
  res.json({ success: true });
});

app.get('/state', (req, res) => {
  res.json({ racers: getLeaderboard(), status: connectionStatus, username: connectedUsername, error: connectionError });
});

wss.on('connection', ws => {
  console.log('Browser connected');
  ws.send(JSON.stringify({ type: 'init', racers: getLeaderboard(), status: connectionStatus, username: connectedUsername, error: connectionError }));
  ws.on('close', () => console.log('Browser disconnected'));
});

const PORT = process.env.PORT || 7739;
server.listen(PORT, () => {
  console.log(`\n🏁 Country Race → http://localhost:${PORT}`);
  console.log(`📡 Control panel → http://localhost:${PORT}/control\n`);
  console.log('Gift map:');
  Object.entries(GIFT_MAP).forEach(([gift, id]) => console.log(`  ${gift.padEnd(20)} → ${COUNTRIES[id].name}`));
  console.log('');
});
