const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('mapMethodDesktop', Object.freeze({ isDesktop: true }));
