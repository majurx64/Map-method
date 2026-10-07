const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('mapMethodDesktop', Object.freeze({ isDesktop: true, version: '1.0.5', backups: Object.freeze({
  info: () => ipcRenderer.invoke('mm-backup:info'),
  save: (owner, snapshot) => ipcRenderer.invoke('mm-backup:save', owner, snapshot),
  list: (owner) => ipcRenderer.invoke('mm-backup:list', owner),
  read: (owner, id) => ipcRenderer.invoke('mm-backup:read', owner, id),
  openFolder: () => ipcRenderer.invoke('mm-backup:open-folder'),
  export: (owner, id, mapId) => ipcRenderer.invoke('mm-backup:export', owner, id, mapId),
  scheduleInfo: (owner) => ipcRenderer.invoke('mm-backup:schedule-info', owner),
  configureSchedule: (owner, settings) => ipcRenderer.invoke('mm-backup:schedule-configure', owner, settings),
  chooseBackupFolder: (owner, intervalDays) => ipcRenderer.invoke('mm-backup:schedule-choose-folder', owner, intervalDays),
  saveScheduled: (owner, snapshot) => ipcRenderer.invoke('mm-backup:schedule-save', owner, snapshot),
  openBackupFolder: (owner) => ipcRenderer.invoke('mm-backup:schedule-open-folder', owner),
}) }));
