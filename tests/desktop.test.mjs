import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { navigationTarget } = require('../desktop/navigation.cjs');
const config = require('../desktop/electron-builder.cjs');
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
});
