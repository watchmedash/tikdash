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

// --- Multer Setup for Image Uploads ---
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

// --- Game Timer State ---
const GAME_DURATION = 5 * 60; // 5 minutes
const RESTART_DELAY = 15; // 15 seconds
let timer = GAME_DURATION;
let isGameRunning = false;
let gameInterval;

// --- Load/Save Configuration ---
function loadConfig() {
    if (fs.existsSync(CONFIG_FILE)) {
        const fileContent = fs.readFileSync(CONFIG_FILE);
        config = JSON.parse(fileContent);
        // --- ADD THIS: Ensure team data exists ---
        if (!config.teams) {
            config.teams = {
                team1: { name: 'Team 1', image: '/images/team1.jpg' },
                team2: { name: 'Team 2', image: '/images/team2.jpg' }
            };
        }
    } else {
        // Default config for a brand new setup
        config = {
            teams: {
                team1: { name: 'Team 1', image: '/images/team1.jpg' },
                team2: { name: 'Team 2', image: '/images/team2.jpg' }
            },
            gifts: {},
            comments: {}
        };
        saveConfig();
    }
}

function saveConfig() {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// --- Game Timer Logic ---
function startGameTimer() {
    if (isGameRunning) return;
    console.log("Starting game timer...");
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

    // Restart the game after a delay
    setTimeout(startGameTimer, RESTART_DELAY * 1000);
}


// --- Routes ---
app.get('/', (req, res) => res.render('index', { score1, score2 }));
app.get('/admin', (req, res) => res.render('admin'));

// Handle image uploads from the admin panel
app.post('/admin/upload/gift', upload.single('giftImage'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    const { giftName, giftPoints, giftTeam } = req.body;

    config.gifts[giftName] = {
        id: giftName,
        points: parseInt(giftPoints),
        team: parseInt(giftTeam),
        image: `/uploads/${req.file.filename}` // Path to the new image
    };
    saveConfig();
    io.emit('updateConfig', config); // Notify all clients of the change
    res.redirect('/admin');
});

app.post('/admin/upload/team', upload.single('teamImage'), (req, res) => {
    const { teamId, teamName } = req.body; // teamId will be 'team1' or 'team2'

    if (teamId && config.teams[teamId]) {
        // Update the name
        if (teamName) {
            config.teams[teamId].name = teamName;
        }
        // Update the image if a new one was uploaded
        if (req.file) {
            config.teams[teamId].image = `/uploads/${req.file.filename}`;
        }

        saveConfig();
        io.emit('updateConfig', config); // Notify all clients of the change
    }

    res.redirect('/admin');
});

// --- Socket.IO Connections ---
io.on('connection', (socket) => {
    console.log('A client connected');

    // Send initial data to the newly connected client
    socket.emit('updateScores', { score1, score2 });
    socket.emit('updateConfig', config);
    socket.emit('timerUpdate', timer);
    if (!isGameRunning && timer <= 0) {
        let winner = score1 > score2 ? 'Team 1' : (score2 > score1 ? 'Team 2' : 'draw');
        socket.emit('gameOver', { winner, restartDelay: RESTART_DELAY });
    }

    // Listen for updates from admin
    socket.on('updateConfig', (newConfig) => {
        config = newConfig;
        saveConfig();
        io.emit('updateConfig', config);
    });

    // Listen for admin to start the game
    socket.on('startGame', () => {
        startGameTimer();
    });

    socket.on('disconnect', () => console.log('A client disconnected'));
});


// --- TikTok Live Connection ---
let tiktokConnection = new WebcastPushConnection('realmeow404');

tiktokConnection.connect().then(state => {
    console.info(`Connected to roomId ${state.roomId}`);
}).catch(err => {
    console.error('Failed to connect', err);
});

// Listen for Gifts
tiktokConnection.on('gift', (data) => {
    if (!isGameRunning) return; // Only process gifts if game is running

    if (config.gifts && config.gifts[data.giftName]) {
        const giftDetails = config.gifts[data.giftName];
        const pointsToAdd = giftDetails.points * data.repeatCount;

        if (giftDetails.team === 1) score1 += pointsToAdd;
        else if (giftDetails.team === 2) score2 += pointsToAdd;

        io.emit('updateScores', { score1, score2 });

        // --- THIS IS THE MODIFIED LINE ---
        // Add the 'team' property to the emitted data
        io.emit('showGift', {
            giftName: data.giftName,
            gifter: data.uniqueId,
            image: giftDetails.image,
            team: giftDetails.team // Add this line
        });
    }
});

// Listen for Comments
tiktokConnection.on('comment', (data) => {
    if (!isGameRunning) return; // Only process comments if game is running

    const commentText = data.comment.toLowerCase();
    if (config.comments && config.comments[commentText]) {
        const commentDetails = config.comments[commentText];

        if (commentDetails.team === 1) score1 += commentDetails.points;
        else if (commentDetails.team === 2) score2 += commentDetails.points;

        io.emit('updateScores', { score1, score2 });
    }
});

// --- Initial Load and Start Server ---
loadConfig();
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Main View: http://localhost:${PORT}`);
    console.log(`Admin Panel: http://localhost:${PORT}/admin`);
});
