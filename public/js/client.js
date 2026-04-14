const socket = io();

// --- Element References ---
const score1El = document.getElementById('score1');
const score2El = document.getElementById('score2');
const timerEl = document.getElementById('timer');
const winnerOverlay = document.getElementById('winner-overlay');
const winnerText = document.getElementById('winner-text');
const restartText = document.getElementById('restart-text');

// --- NEW: References to the team images for animation ---
const team1Image = document.querySelector('#team1 img');
const team2Image = document.querySelector('#team2 img');

// --- Preload Sounds ---
const soundTeam1 = new Audio('/sounds/team1.mp3');
const soundTeam2 = new Audio('/sounds/team2.mp3');

// --- Socket Event Listeners ---
socket.on('updateScores', ({ score1, score2 }) => {
    score1El.innerText = score1;
    score2El.innerText = score2;
});

// --- MODIFIED: showGift event now handles animation ---
socket.on('showGift', (gift) => {
    console.log(`Received gift for Team ${gift.team}: ${gift.giftName}`);

    // Play sound and trigger animation based on the team
    if (gift.team === 1) {
        soundTeam1.play();
        // Add animation class to the image
        team1Image.classList.add('animate-gift-received');
        // Remove the class after the animation finishes so it can be re-triggered
        setTimeout(() => {
            team1Image.classList.remove('animate-gift-received');
        }, 700); // Must match animation duration (0.7s)
    } else if (gift.team === 2) {
        soundTeam2.play();
        team2Image.classList.add('animate-gift-received');
        setTimeout(() => {
            team2Image.classList.remove('animate-gift-received');
        }, 700);
    }
});

socket.on('timerUpdate', (time) => {
    const minutes = Math.floor(time / 60);
    const seconds = time % 60;
    timerEl.innerText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
});

socket.on('gameOver', ({ winner, restartDelay }) => {
    winnerText.innerText = winner === 'draw' ? "It's a Draw!" : `${winner} Wins!`;
    winnerOverlay.classList.add('visible');

    let countdown = restartDelay;
    restartText.innerText = `Restarting in ${countdown}...`;
    const restartInterval = setInterval(() => {
        countdown--;
        restartText.innerText = `Restarting in ${countdown}...`;
        if (countdown <= 0) {
            clearInterval(restartInterval);
            winnerOverlay.classList.remove('visible');
        }
    }, 1000);
});

socket.on('updateConfig', (config) => {
    // --- ADD THIS: Update Team Names and Images ---
    if (config.teams) {
        // Team 1
        document.querySelector('#team1 h2').innerText = config.teams.team1.name;
        document.querySelector('#team1 img').src = config.teams.team1.image;
        // Team 2
        document.querySelector('#team2 h2').innerText = config.teams.team2.name;
        document.querySelector('#team2 img').src = config.teams.team2.image;
    }

    // The existing gift logic below remains the same
    const team1Gifts = [];
    const team2Gifts = [];

    if (config.gifts) {
        for (const giftId in config.gifts) {
            const gift = config.gifts[giftId];
            if (gift.team === 1) team1Gifts.push(gift);
            else team2Gifts.push(gift);
        }
    }

    const columns = {
        t1Left: document.getElementById('team1-gifts-left'),
        t1Right: document.getElementById('team1-gifts-right'),
        t2Left: document.getElementById('team2-gifts-left'),
        t2Right: document.getElementById('team2-gifts-right'),
    };

    for (const col in columns) { columns[col].innerHTML = ''; }

    team1Gifts.slice(0, 8).forEach((gift, index) => {
        const el = document.createElement('div');
        el.classList.add('gift-display');
        el.innerHTML = `<img src="${gift.image}" alt="${gift.id}"> = ${gift.points}`;
        if (index < 4) {
            columns.t1Left.appendChild(el);
        } else {
            columns.t1Right.appendChild(el);
        }
    });

    team2Gifts.slice(0, 8).forEach((gift, index) => {
        const el = document.createElement('div');
        el.classList.add('gift-display');
        el.innerHTML = `<img src="${gift.image}" alt="${gift.id}"> = ${gift.points}`;
        if (index < 4) {
            columns.t2Left.appendChild(el);
        } else {
            columns.t2Right.appendChild(el);
        }
    });
});
