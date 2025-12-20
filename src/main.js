const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
    const win = new BrowserWindow({
        width: 1000,
        height: 800,
        backgroundColor: '#0f0f11',
        show: false, // Wait until ready-to-show to prevent flicker
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false // Allowing this for rapid prototyping/expandability as requested by user for local tool
        },
        autoHideMenuBar: true
    });

    win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    win.once('ready-to-show', () => {
        win.show();
    });
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
