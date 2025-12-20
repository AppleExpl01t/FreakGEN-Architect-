const { app, BrowserWindow, ipcMain, dialog, shell, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

// Auto-updater for installed version
const { autoUpdater } = require('electron-updater');

// App version
const APP_VERSION = require('../package.json').version;
const GITHUB_OWNER = 'AppleExpl01t';
const GITHUB_REPO = 'FreakGEN-Architect-';

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 900,
        backgroundColor: '#0f0f11',
        icon: path.join(__dirname, '../assets/icon.png'),
        show: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        autoHideMenuBar: true
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        // Check for updates after window is ready
        checkForUpdates();
    });
}

// Determine if running as portable or installed
function isPortable() {
    const exePath = app.getPath('exe');
    const isInstalled = exePath.includes('Program Files') ||
        exePath.includes('AppData\\Local\\Programs') ||
        exePath.includes('AppData/Local/Programs');
    return !isInstalled;
}

// Check for updates
async function checkForUpdates() {
    if (isPortable()) {
        // Portable version: Check GitHub API for latest release
        checkGitHubForUpdates();
    } else {
        // Installed version: Use electron-updater
        autoUpdater.autoDownload = true;
        autoUpdater.autoInstallOnAppQuit = true;

        autoUpdater.on('update-available', (info) => {
            mainWindow.webContents.send('update-status', {
                type: 'available',
                message: `Update v${info.version} available. Downloading...`
            });
        });

        autoUpdater.on('update-downloaded', (info) => {
            dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'Update Ready',
                message: `Version ${info.version} has been downloaded.`,
                detail: 'The update will be installed when you close the app.',
                buttons: ['Restart Now', 'Later']
            }).then((result) => {
                if (result.response === 0) {
                    autoUpdater.quitAndInstall();
                }
            });
        });

        autoUpdater.on('error', (err) => {
            console.log('Auto-updater error:', err.message);
            // Silent fail for installed version
        });

        try {
            await autoUpdater.checkForUpdates();
        } catch (err) {
            console.log('Update check failed:', err.message);
        }
    }
}

// Check GitHub API for latest release (portable version)
function checkGitHubForUpdates() {
    const options = {
        hostname: 'api.github.com',
        path: `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
        headers: { 'User-Agent': 'FreakGEN-Architect' }
    };

    https.get(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            try {
                const release = JSON.parse(data);
                const latestVersion = release.tag_name?.replace('v', '') || '0.0.0';

                if (compareVersions(latestVersion, APP_VERSION) > 0) {
                    // New version available
                    const portableAsset = release.assets?.find(a =>
                        a.name.toLowerCase().includes('portable') && a.name.endsWith('.exe')
                    );

                    dialog.showMessageBox(mainWindow, {
                        type: 'info',
                        title: 'Update Available',
                        message: `A new version (v${latestVersion}) is available!`,
                        detail: `You are running v${APP_VERSION}.\n\nWould you like to download the update?`,
                        buttons: ['Download Now', 'Later']
                    }).then((result) => {
                        if (result.response === 0) {
                            if (portableAsset) {
                                shell.openExternal(portableAsset.browser_download_url);
                            } else {
                                shell.openExternal(release.html_url);
                            }
                        }
                    });
                } else {
                    // Up to date - show toast notification
                    mainWindow.webContents.send('update-status', {
                        type: 'uptodate',
                        message: `You're running the latest version (v${APP_VERSION})`
                    });
                }
            } catch (e) {
                console.log('Failed to parse release info:', e.message);
            }
        });
    }).on('error', (err) => {
        console.log('GitHub API error:', err.message);
    });
}

// Compare semantic versions
function compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
        const a = parts1[i] || 0;
        const b = parts2[i] || 0;
        if (a > b) return 1;
        if (a < b) return -1;
    }
    return 0;
}

// IPC Handlers
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

ipcMain.handle('check-portable', () => isPortable());

ipcMain.handle('get-app-version', () => APP_VERSION);

ipcMain.handle('trigger-install', async () => {
    try {
        // Open GitHub releases page for installation
        shell.openExternal(`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`);
        return { success: true, message: 'Opened releases page. Download the installer from there.' };
    } catch (err) {
        return { success: false, message: 'Failed to open releases page: ' + err.message };
    }
});

ipcMain.handle('check-for-updates-manual', async () => {
    checkForUpdates();
    return { success: true };
});

// App lifecycle
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