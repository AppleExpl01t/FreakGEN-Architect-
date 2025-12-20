const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

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

// Check if running as portable (not installed)
ipcMain.handle('check-portable', () => {
    // If running from Program Files or AppData/Local/Programs, it's installed
    const exePath = app.getPath('exe');
    const isInstalled = exePath.includes('Program Files') ||
        exePath.includes('AppData\\Local\\Programs') ||
        exePath.includes('AppData/Local/Programs');
    return !isInstalled;
});

// Trigger install - opens the installer download page or local installer
ipcMain.handle('trigger-install', async () => {
    try {
        // Check if an installer exists in the same directory as the portable exe
        const exeDir = path.dirname(app.getPath('exe'));
        const installerPath = path.join(exeDir, 'FreakGEN Architect-Setup-2.9.0.exe');

        if (fs.existsSync(installerPath)) {
            // Run the local installer
            shell.openPath(installerPath);
            return { success: true, message: 'Installer launched. Follow the prompts to install.' };
        } else {
            // Open GitHub releases page
            shell.openExternal('https://github.com/AppleExpl01t/FreakGEN-Architect-/releases');
            return { success: true, message: 'Opened releases page. Download the installer from there.' };
        }
    } catch (err) {
        return { success: false, message: 'Failed to launch installer: ' + err.message };
    }
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