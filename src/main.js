const { app, BrowserWindow } = require('electron');

// Start the Express + WebSocket server in the same process
require('./server');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1080,
    height: 1920,
    minWidth: 400,
    minHeight: 600,
    title: 'Meow Race',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Give the HTTP server a moment to bind before loading
  setTimeout(() => win.loadURL('http://localhost:7735'), 400);

  win.on('closed', () => { win = null; });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (!win) createWindow(); });
