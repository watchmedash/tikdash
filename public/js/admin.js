const socket = io();
let currentConfig = {};

// --- Element References ---
const giftListDiv = document.getElementById('gift-list');
const commentListDiv = document.getElementById('comment-list');
const addCommentForm = document.getElementById('add-comment-form');
const startGameBtn = document.getElementById('start-game-btn');

// --- Render Functions ---
function renderLists() {
    giftListDiv.innerHTML = '';
    commentListDiv.innerHTML = '';

    // Render Gifts
    for (const id in currentConfig.gifts) {
        const item = currentConfig.gifts[id];
        const el = document.createElement('div');
        el.classList.add('item-display');
        el.innerHTML = `
            <span><img src="${item.image}" class="item-img"/> <strong>${item.id}</strong> (${item.points} pts, Team ${item.team})</span>
            <button class="delete-btn" data-type="gifts" data-id="${item.id}"><i class="fas fa-trash"></i></button>
        `;
        giftListDiv.appendChild(el);
    }
    // Render Comments
    for (const id in currentConfig.comments) {
        const item = currentConfig.comments[id];
        const el = document.createElement('div');
        el.classList.add('item-display');
        el.innerHTML = `
            <span><i class="fas fa-comment"></i> <strong>"${item.word}"</strong> (${item.points} pts, Team ${item.team})</span>
            <button class="delete-btn" data-type="comments" data-id="${item.word}"><i class="fas fa-trash"></i></button>
        `;
        commentListDiv.appendChild(el);
    }
}

// --- Event Listeners ---
socket.on('updateConfig', (config) => {
    currentConfig = config;
    renderLists();
});

addCommentForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const word = document.getElementById('comment-word').value.toLowerCase();
    if (!word) return;

    currentConfig.comments[word] = {
        word: word,
        points: parseInt(document.getElementById('comment-points').value),
        team: parseInt(document.getElementById('comment-team').value)
    };
    socket.emit('updateConfig', currentConfig);
    addCommentForm.reset();
});

// Generic delete button handler
document.body.addEventListener('click', (e) => {
    const deleteButton = e.target.closest('.delete-btn');
    if (deleteButton) {
        const type = deleteButton.dataset.type; // 'gifts' or 'comments'
        const id = deleteButton.dataset.id;
        if (currentConfig[type] && currentConfig[type][id]) {
            delete currentConfig[type][id];
            socket.emit('updateConfig', currentConfig);
        }
    }
});

startGameBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to start a new game? This will reset the scores.')) {
        socket.emit('startGame');
        console.log('Start game signal sent.');
    }
});
