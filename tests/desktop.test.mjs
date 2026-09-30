import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
const require = createRequire(import.meta.url);
const { navigationTarget } = require('../desktop/navigation.cjs');
const config = require('../desktop/electron-builder.cjs');
const { startUpdates } = require('../desktop/updates.cjs');
test('desktop window restricts navigation to Map Method and rejects privileged links', () => {
  assert.equal(navigationTarget('https://www.mapmethod.ru/?shared=example'), 'app');
  for (const url of ['https://www.mapmethod.ru.evil.example/', 'https://github.com/majurx64/Map-method', 'http://www.mapmethod.ru/']) assert.equal(navigationTarget(url), 'external');
  for (const url of ['file:///C:/Windows/', 'javascript:alert(1)', 'web+mapmethod://open', 'broken']) assert.equal(navigationTarget(url), 'blocked');
});
test('Windows installer creates desktop and Start menu shortcuts without deleting map storage', () => {
  assert.equal(config.nsis.createDesktopShortcut, 'always');
  assert.equal(config.nsis.createStartMenuShortcut, true);
  assert.equal(config.nsis.deleteAppDataOnUninstall, false);
  assert.equal(config.extraMetadata.main, 'desktop/main.cjs');
  assert.equal(config.nsis.artifactName, 'Map-Method-Setup.exe');
  assert.equal(config.publish.provider, 'github');
  assert.equal(config.publish.repo, 'Map-method');
});

test('desktop update waits for editor persistence before restarting', async () => {
  const app = Object.assign(new EventEmitter(), { isPackaged: true });
  const updater = new EventEmitter();
  const order = [];
  updater.checkForUpdates = async () => { order.push('check'); };
  updater.quitAndInstall = (silent, restart) => { assert.ok(silent && restart); order.push('install'); };
  const win = { isDestroyed: () => false, webContents: { executeJavaScript: async () => { order.push('save'); return true; } } };
  startUpdates({ app, autoUpdater: updater, dialog: { showMessageBox: async () => ({ response: 0 }) }, getWindow: () => win });
  await updater.listeners('update-downloaded')[0]({ version: '1.0.4' });
  assert.deepEqual(order, ['check', 'save', 'install']);
  assert.equal(updater.autoInstallOnAppQuit, false);
  assert.equal(updater.allowDowngrade, false);
  app.emit('will-quit');
});

test('failed persistence or choosing Later never restarts the application', async () => {
  for (const response of [0, 1]) {
    const app = Object.assign(new EventEmitter(), { isPackaged: true });
    const updater = new EventEmitter();
    updater.checkForUpdates = async () => {};
    updater.quitAndInstall = () => assert.fail('Must not install');
    const win = { isDestroyed: () => false, webContents: { executeJavaScript: async () => false } };
    startUpdates({ app, autoUpdater: updater, dialog: { showMessageBox: async () => ({ response }) }, getWindow: () => win });
    await updater.listeners('update-downloaded')[0]({ version: '1.0.4' });
    app.emit('will-quit');
  }
});

test('unpackaged development runs do not check for or install updates', () => {
  const updater = new EventEmitter();
  startUpdates({ app: { isPackaged: false }, autoUpdater: updater });
  assert.equal(updater.listenerCount('update-downloaded'), 0);
});
