// Electron entry point: opens the game in a desktop window (this is what ships on Steam).
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Bottomless Cup',
    autoHideMenuBar: true,
    backgroundColor: '#16120f',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // Idle games must keep running when the window is minimized or unfocused.
      backgroundThrottling: false,
    },
  });
  win.loadFile(path.join(__dirname, 'dist', 'desktop.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
