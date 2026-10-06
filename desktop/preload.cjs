const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('mapMethodDesktop', Object.freeze({ isDesktop: true, version: '1.0.4', backups: Object.freeze({
  info: () => ipcRenderer.invoke('mm-backup:info'),
  save: (owner, snapshot) => ipcRenderer.invoke('mm-backup:save', owner, snapshot),
  list: (owner) => ipcRenderer.invoke('mm-backup:list', owner),
  read: (owner, id) => ipcRenderer.invoke('mm-backup:read', owner, id),
  openFolder: () => ipcRenderer.invoke('mm-backup:open-folder'),
  export: (owner, id, mapId) => ipcRenderer.invoke('mm-backup:export', owner, id, mapId),
}) }));
