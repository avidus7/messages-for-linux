// audio-preload.js — the bridge to the hidden audio window.
// Sandboxed like every other window here: main pushes sounds in, nothing
// goes back out except a one-time "I'm ready".
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('audioAPI', {
  onPlay: (fn) => ipcRenderer.on('audio:play', (_e, d) => fn(d.name, d.dataUrl, d.volume)),
  onAmbient: (fn) => ipcRenderer.on('audio:ambient', (_e, d) => fn(d.dataUrl, d.volume)),
  onAmbientVolume: (fn) => ipcRenderer.on('audio:ambient-volume', (_e, v) => fn(v)),
  ready: () => ipcRenderer.send('audio:ready')
});
