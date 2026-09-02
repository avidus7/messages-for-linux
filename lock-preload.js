// lock-preload.js — bridges the PIN pad to the main process.
// Sandboxed like every other window in this app: the renderer can ask what
// mode it is in and submit a PIN, and nothing else. The PIN never touches
// disk here; main.js hashes it with a per-install salt.
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lockAPI', {
  getMode: () => ipcRenderer.invoke('lock:mode'),
  submit: (pin) => ipcRenderer.invoke('lock:submit', pin),
  done: (unlocked) => ipcRenderer.send('lock:done', !!unlocked)
});
