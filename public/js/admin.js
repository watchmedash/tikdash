const socket = io();
let currentConfig = {};

// --- Element References ---
const giftListDiv = document.getElementById('gift-list');
const usernameForm = document.getElementById('username-form');
const usernameInput = document.getElementById('tiktok-username');
const connectionStatusDiv = document.getElementById('connection-status');
const startGameBtn = document.getElementById('start-game-btn');

// --- Render Functions ---
function renderLists() {
    giftListDiv.innerHTML = '';

    // Render Gifts with new play button
    for (const id in currentConfig.gifts) {
        const item = currentConfig.gifts[id];
        const el = document.createElement('div');
        el.classList.add('item-display');
        el.innerHTML = `
            <span><img src="${item.image}" class="item-img"/> <strong>${item.id}</strong></span>
            <div>
                <button class="play-btn" data-gift-id="${item.id}"><i class="fas fa-play"></i></button>
                <button class="delete-btn" data-type="gifts" data-id="${item.id}"><i class="fas fa-trash"></i></button>
            </div>
        `;
        giftListDiv.appendChild(el);
    }
}

// --- Event Listeners ---
socket.on('updateConfig', (config) => {
    currentConfig = config;
    if (config.tiktokUsername) {
        usernameInput.value = config.tiktokUsername;
    }
    renderLists();
});

// NEW: Listen for connection status updates
socket.on('tiktokConnectionState', (data) => {
    if (data.status === 'connected') {
        connectionStatusDiv.textContent = `Connected to @${data.username}`;
        connectionStatusDiv.style.color = 'green';
    } else {
        connectionStatusDiv.textContent = `Disconnected. Error: ${data.error || 'N/A'}`;
        connectionStatusDiv.style.color = 'red';
    }
});

// NEW: Handle username form submission
usernameForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const newUsername = usernameInput.value.trim();
    if (newUsername) {
        socket.emit('updateTiktokUsername', newUsername);
        connectionStatusDiv.textContent = `Connecting to @${newUsername}...`;
        connectionStatusDiv.style.color = 'orange';
    }
});

// MODIFIED: Generic event handler for delete and play buttons
document.body.addEventListener('click', (e) => {
    // Handle Delete Button
    const deleteButton = e.target.closest('.delete-btn');
    if (deleteButton) {
        const type = deleteButton.dataset.type;
        const id = deleteButton.dataset.id;
        if (currentConfig[type] && currentConfig[type][id]) {
            delete currentConfig[type][id];
            socket.emit('updateConfig', currentConfig);
        }
        return; // Stop further processing
    }

    // Handle Play Button
    const playButton = e.target.closest('.play-btn');
    if (playButton) {
        const giftId = playButton.dataset.giftId;
        console.log(`Simulating gift ${giftId} in 4 seconds...`);

        playButton.disabled = true; // Disable button to prevent spam
        playButton.innerHTML = '<i class="fas fa-hourglass-start"></i>';

        setTimeout(() => {
            socket.emit('simulateGift', giftId);
            playButton.disabled = false; // Re-enable button
            playButton.innerHTML = '<i class="fas fa-play"></i>';
        }, 4000); // 4-second delay
    }
});

startGameBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to start a new game? This will reset the scores.')) {
        socket.emit('startGame');
        console.log('Start game signal sent.');
    }
});
