module.exports = {
  appId: 'ru.mapmethod.desktop', productName: 'Map Method',
  extraMetadata: { name: 'mapmethod-desktop', version: '1.0.4', main: 'desktop/main.cjs', description: 'Map Method для Windows', author: 'Map Method' },
  publish: { provider: 'github', owner: 'majurx64', repo: 'Map-method', releaseType: 'release' },
  directories: { output: 'release' },
  files: ['desktop/**/*', 'src/lib/mapBackups.js', 'package.json'],
  asar: true, npmRebuild: false,
  win: { target: [{ target: 'nsis', arch: ['x64'] }], icon: 'desktop/icon.png', signExecutable: false },
  nsis: {
    include: 'desktop/installer.nsh',
    artifactName: 'Map-Method-Setup.exe', oneClick: false, perMachine: false,
    allowToChangeInstallationDirectory: true, createDesktopShortcut: 'always', createStartMenuShortcut: true,
    shortcutName: 'Map Method', runAfterFinish: true, deleteAppDataOnUninstall: false,
    installerLanguages: ['ru_RU', 'en_US'], language: '1049',
  },
};
