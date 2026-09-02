// findbar-preload.js — exposes the three find actions to the find bar UI
// through contextBridge, keeping the find bar sandboxed like everything else.
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('findAPI', {
  start: (text, forward, findNext) => ipcRenderer.send('find:start', { text, forward, findNext }),
  stop: () => ipcRenderer.send('find:stop'),
  close: () => ipcRenderer.send('find:close'),
  onResult: (cb) => ipcRenderer.on('find:result', (_e, data) => cb(data)),
  onFocus: (cb) => ipcRenderer.on('find:focus', () => cb())
});
