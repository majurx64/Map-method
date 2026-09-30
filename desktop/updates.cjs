function startUpdates({ app, autoUpdater, dialog, getWindow }) {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  // Restart only after confirmation and after the editor has saved its local outbox.
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;
  let checking = false;
  let ready = false;
  const reportError = (error) => console.error('Map Method update:', error.message);
  autoUpdater.on('error', reportError);
  autoUpdater.on('update-downloaded', async ({ version }) => {
    if (ready) return;
    ready = true;
    const win = getWindow();
    if (!win || win.isDestroyed()) return;
    try {
      const { response } = await dialog.showMessageBox(win, {
        type: 'info', title: 'Обновление Map Method',
        message: `Версия ${version} готова к установке`,
        detail: 'Перезапустить приложение и установить обновление? Если выбрать «Позже», предложим установку при следующем запуске.',
        buttons: ['Перезапустить и обновить', 'Позже'], defaultId: 0, cancelId: 1,
      });
      if (response !== 0 || win.isDestroyed()) return;
      const saved = await win.webContents.executeJavaScript(
        'typeof window.mapMethodPrepareUpdate === "function" ? window.mapMethodPrepareUpdate() : false',
      );
      if (!saved) {
        ready = false;
        await dialog.showMessageBox(win, { type: 'warning', title: 'Обновление отложено', message: 'Не удалось сохранить текущие изменения. Обновление попробуем установить позже.' });
        return;
      }
      autoUpdater.quitAndInstall(true, true);
    } catch (error) { ready = false; reportError(error); }
  });
  const check = async () => {
    if (checking || ready) return;
    checking = true;
    try { await autoUpdater.checkForUpdates(); } catch (error) { reportError(error); }
    finally { checking = false; }
  };
  const timer = setInterval(check, 4 * 60 * 60 * 1000);
  timer.unref?.();
  app.once('will-quit', () => clearInterval(timer));
  void check();
}
module.exports = { startUpdates };
