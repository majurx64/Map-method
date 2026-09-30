const { app, BrowserWindow, session, shell, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const { startUpdates } = require('./updates.cjs');
const path = require('node:path');
const { APP_ORIGIN, navigationTarget } = require('./navigation.cjs');
let mainWindow;
app.setName('Map Method');
app.setAppUserModelId('ru.mapmethod.desktop');
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
      callback(permission === 'clipboard-sanitized-write');
    });
    mainWindow = new BrowserWindow({
      title: 'Map Method', width: 1280, height: 850, minWidth: 720, minHeight: 540,
      backgroundColor: '#f5f2eb', show: false, autoHideMenuBar: true,
      icon: path.join(__dirname, 'icon.png'),
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false,
        webSecurity: true, allowRunningInsecureContent: false,
      },
    });
    mainWindow.removeMenu();
    mainWindow.once('ready-to-show', () => mainWindow.show());
    mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());
    mainWindow.webContents.on('will-navigate', (event, url) => {
      if (navigationTarget(url) !== 'app') event.preventDefault();
    });
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (navigationTarget(url) === 'app') void mainWindow.loadURL(url);
      else if (navigationTarget(url) === 'external') void shell.openExternal(url);
      return { action: 'deny' };
    });
    mainWindow.webContents.on('did-fail-load', (_event, code, _description, url, isMainFrame) => {
      if (isMainFrame && code !== -3 && navigationTarget(url) === 'app') {
        void mainWindow.loadFile(path.join(__dirname, 'offline.html'));
      }
    });
    mainWindow.on('closed', () => { mainWindow = null; });
    mainWindow.webContents.once('did-finish-load', () => {
      startUpdates({ app, autoUpdater, dialog, getWindow: () => mainWindow });
    });
    void mainWindow.loadURL(APP_ORIGIN).catch(() => {});
  });
  app.on('window-all-closed', () => app.quit());
}
