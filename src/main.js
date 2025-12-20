const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 900,
        backgroundColor: '#0f0f11',
        icon: path.join(__dirname, '../assets/icon.png'),
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

ipcMain.handle('select-dir', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openDirectory']
    });
    return result.filePaths[0];
});

ipcMain.handle('save-dialog', async (event, options) => {
    const result = await dialog.showSaveDialog(options);
    return result.filePath;
});

ipcMain.handle('select-file', async (event, options) => {
    const result = await dialog.showOpenDialog({
        title: options.title || 'Select File',
        filters: options.filters || [],
        properties: ['openFile']
    });
    return result.filePaths[0];
});

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