const { app } = require('electron');
const path = require('node:path');
app.setPath('userData', path.join(app.getPath('temp'), 'mapmethod-desktop-smoke'));
const timer = setTimeout(() => { console.error('Desktop startup timed out'); app.exit(1); }, 30000);
app.on('browser-window-created', (_event, win) => {
  // Exercise startup without opening an interactive window.
  win.show = () => {};
  win.webContents.once('did-finish-load', async () => {
    try {
      const result = await win.webContents.executeJavaScript('({origin:location.origin,desktop:window.mapMethodDesktop?.isDesktop,title:document.title,root:!!document.getElementById("root")})');
      console.log(JSON.stringify(result));
      clearTimeout(timer);
      app.exit(result.origin === 'https://www.mapmethod.ru' && result.desktop && result.root ? 0 : 1);
    } catch (error) { console.error(error.message); app.exit(1); }
  });
});
require('../desktop/main.cjs');
