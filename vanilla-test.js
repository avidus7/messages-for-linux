// vanilla-test.js — the isolation test.
// Loads Google Messages in a 100% stock Electron window: no preload, no
// custom session, no user agent change, no menu, nothing. DevTools opens
// automatically. If THIS shows the QR page, the black screen lives in our
// customizations. If this is ALSO black, it's the environment/Electron.
'use strict';

const { app, BrowserWindow } = require('electron');

app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 1100, height: 760 });
  win.webContents.openDevTools({ mode: 'bottom' });
  win.webContents.on('console-message', (_e, a, b, c, d) => {
    if (a && typeof a === 'object') console.log('[page]', a.level, a.message);
    else console.log('[page]', a, b, `(${d}:${c})`);
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    console.log('[RENDERER GONE]', details.reason, details.exitCode);
  });
  win.loadURL('https://messages.google.com/web/');
});

app.on('window-all-closed', () => app.quit());
