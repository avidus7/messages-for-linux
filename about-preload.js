// about-preload.js — bridges version info and the close action to the
// About window, keeping it sandboxed like every other window in the app.
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aboutAPI', {
  getInfo: () => ipcRenderer.invoke('about:info'),
  close: () => ipcRenderer.send('about:close')
});
