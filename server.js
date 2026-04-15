const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { WebcastPushConnection } = require('tiktok-live-connector');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

// --- Basic Setup ---
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const CONFIG_FILE = path.join(__dirname, 'config.json');

// --- Multer Setup ---
const storage = multer.diskStorage({
    destination: './public/uploads/',
    filename: function(req, file, cb){
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

app.use(express.static('public'));
app.set('view engine', 'ejs');

// --- Game State & Configuration ---
let score1 = 0;
let score2 = 0;
let config = {};
let tiktokConnection;

// --- Game Timer State ---
const GAME_DURATION = 5 * 60;
const RESTART_DELAY = 15;
let timer = GAME_DURATION;
let isGameRunning = false;
let gameInterval;

// --- Load/Save Configuration ---
function loadConfig() {
    if (fs.existsSync(CONFIG_FILE)) {
        const fileContent = fs.readFileSync(CONFIG_FILE);
        config = JSON.parse(fileContent);
        if (!config.teams) {
            config.teams = {
                team1: { name: 'Team 1', image: '/images/team1.jpg' },
                team2: { name: 'Team 2', image: '/images/team2.jpg' }
            };
        }
        if (!config.tiktokUsername) {
            config.tiktokUsername = 'YOUR_TIKTOK_USERNAME';
        }
    } else {
        config = {
            tiktokUsername: 'YOUR_TIKTOK_USERNAME',
            teams: {
                team1: { name: 'Team 1', image: '/images/team1.jpg' },
                team2: { name: 'Team 2', image: '/images/team2.jpg' }
            },
            gifts: {},
        };
        saveConfig();
    }
}

function saveConfig() {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// --- ADDING THESE MISSING FUNCTIONS BACK ---
function startGameTimer() {
    if (isGameRunning) {
        console.log("Game is already running. Ignoring start request.");
        return;
    }
    console.log("Starting new game timer...");
    isGameRunning = true;
    timer = GAME_DURATION;

    // Reset scores at the start of the game
    score1 = 0;
    score2 = 0;
    io.emit('updateScores', { score1, score2 });

    gameInterval = setInterval(() => {
        timer--;
        io.emit('timerUpdate', timer);

        if (timer <= 0) {
            endGame();
        }
    }, 1000);
}

function endGame() {
    clearInterval(gameInterval);
    isGameRunning = false;
    console.log("Game over!");

    let winner = 'draw';
    if (score1 > score2) winner = 'Team 1';
    if (score2 > score1) winner = 'Team 2';

    io.emit('gameOver', { winner, restartDelay: RESTART_DELAY });

    // Restart the game automatically after a delay
    setTimeout(startGameTimer, RESTART_DELAY * 1000);
}
// --- END OF MISSING FUNCTIONS ---


// --- Routes ---
app.get('/', (req, res) => res.render('index', { score1, score2 }));
app.get('/admin', (req, res) => res.render('admin'));
app.post('/admin/upload/gift', upload.single('giftImage'), (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded.');
    const { giftName, giftPoints, giftTeam } = req.body;
    config.gifts[giftName] = { id: giftName, points: parseInt(giftPoints), team: parseInt(giftTeam), image: `/uploads/${req.file.filename}` };
    saveConfig();
    io.emit('updateConfig', config);
    res.redirect('/admin');
});
app.post('/admin/upload/team', upload.single('teamImage'), (req, res) => {
    const { teamId, teamName } = req.body;
    if (teamId && config.teams[teamId]) {
        if (teamName) config.teams[teamId].name = teamName;
        if (req.file) config.teams[teamId].image = `/uploads/${req.file.filename}`;
        saveConfig();
        io.emit('updateConfig', config);
    }
    res.redirect('/admin');
});

// --- TikTok Connection Logic ---
function connectToTikTok(username) {
    if (tiktokConnection) tiktokConnection.disconnect();
    console.log(`Attempting to connect to TikTok user: @${username}`);
    tiktokConnection = new WebcastPushConnection(username);

    tiktokConnection.connect().then(state => {
        console.info(`Successfully connected to @${username} (roomId ${state.roomId})`);
        io.emit('tiktokConnectionState', { status: 'connected', username: username });
    }).catch(err => {
        console.error(`Failed to connect to @${username}`, err.message);
        io.emit('tiktokConnectionState', { status: 'disconnected', error: err.message });
    });

    tiktokConnection.on('gift', handleGift);
}

function handleGift(data) {
    if (!isGameRunning) return;
    if (config.gifts && config.gifts[data.giftName]) {
        const giftDetails = config.gifts[data.giftName];
        const pointsToAdd = giftDetails.points * (data.repeatCount || 1);
        if (giftDetails.team === 1) score1 += pointsToAdd;
        else if (giftDetails.team === 2) score2 += pointsToAdd;
        io.emit('updateScores', { score1, score2 });
        io.emit('showGift', { giftName: data.giftName, gifter: data.uniqueId, image: giftDetails.image, team: giftDetails.team });
    }
}

// --- Socket.IO Connections ---
io.on('connection', (socket) => {
    console.log('A client connected');
    socket.emit('updateScores', { score1, score2 });
    socket.emit('updateConfig', config);
    socket.emit('timerUpdate', timer);

    // --- THIS IS THE FIX ---
    socket.on('startGame', () => {
        console.log('Received start game signal from admin.');
        startGameTimer(); // Calling the function to start the game
    });

    socket.on('updateTiktokUsername', (newUsername) => {
        if (newUsername && config.tiktokUsername !== newUsername) {
            console.log(`Admin changed TikTok username to: ${newUsername}`);
            config.tiktokUsername = newUsername;
            saveConfig();
            connectToTikTok(newUsername);
        }
    });

    socket.on('simulateGift', (giftId) => {
        if (config.gifts && config.gifts[giftId]) {
            console.log(`Admin is simulating gift: ${giftId}`);
            const fakeGiftData = { giftName: giftId, repeatCount: 1, uniqueId: 'Admin' };
            handleGift(fakeGiftData);
        }
    });

    socket.on('disconnect', () => console.log('A client disconnected'));
});

// --- Initial Load and Start Server ---
loadConfig();
connectToTikTok(config.tiktokUsername);
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Main View: http://localhost:${PORT}`);
    console.log(`Admin Panel: http://localhost:${PORT}/admin`);
});
