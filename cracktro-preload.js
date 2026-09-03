// cracktro-preload.js — the intro's bridge to the main process.
// Sandboxed like every window here. The intro can read its config (UIN,
// music prefs, the user's extra scroller text), persist the four intro
// settings (music, volume, every-launch, CRT), close itself, and ask for fullscreen. Nothing else.
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cracktroAPI', {
  getConfig: () => ipcRenderer.invoke('cracktro:config'),
  set: (key, value) => ipcRenderer.send('cracktro:set', { key, value }),
  close: () => ipcRenderer.send('cracktro:close'),
  toggleFullscreen: () => ipcRenderer.send('cracktro:fullscreen')
});
