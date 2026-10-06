const { app, BrowserWindow, session, shell, dialog, ipcMain, safeStorage } = require('electron');
const { autoUpdater } = require('electron-updater');
const { startUpdates } = require('./updates.cjs');
const path = require('node:path');
const { APP_ORIGIN, navigationTarget } = require('./navigation.cjs');
const { createBackupStore } = require('./backups.cjs');
const { registerBackupIPC } = require('./backup-ipc.cjs');
const offlineURL = require('node:url').pathToFileURL(path.join(__dirname, 'offline.html')).href;
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
    const store = createBackupStore({ root: path.join(app.getPath('userData'), 'Backups'), safeStorage });
    registerBackupIPC({ ipcMain, store, getWindow: () => mainWindow, offlineURL, shell, dialog });
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
    let closing = false, preparingClose = false;
    mainWindow.on('close', (event) => {
      if (closing) return;
      event.preventDefault();
      if (preparingClose) return;
      preparingClose = true;
      void (async () => {
        try {
          const prepared = await mainWindow.webContents.executeJavaScript('typeof window.mapMethodPrepareUpdate === "function" ? window.mapMethodPrepareUpdate() : true');
          if (!prepared) throw new Error('backup-not-ready');
          await store.flush();
          closing = true;
          mainWindow.close();
        } catch {
          // Do not silently quit after a failed durable save (disk full, locked key).
          await dialog.showMessageBox(mainWindow, { type: 'warning', title: 'Map Method', buttons: ['Остаться в приложении', 'Закрыть без новой копии'], defaultId: 0, cancelId: 0,
            message: 'Не удалось завершить сохранение перед закрытием.', detail: 'Скачайте резервную копию в личном кабинете и проверьте свободное место. Уже созданные копии сохраняются.' }).then(({ response }) => {
              if (response === 1) { closing = true; mainWindow.close(); }
            });
        } finally { preparingClose = false; }
      })();
    });
    mainWindow.on('closed', () => { mainWindow = null; });
    mainWindow.webContents.once('did-finish-load', () => {
      startUpdates({ app, autoUpdater, dialog, getWindow: () => mainWindow });
    });
    void mainWindow.loadURL(APP_ORIGIN).catch(() => {});
  });
  app.on('window-all-closed', () => app.quit());
}
