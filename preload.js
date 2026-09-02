// preload.js — SANDBOXED, isolated-world preload. The page cannot see us
// and we do not touch the page's globals at all. That hands-off posture is
// deliberate: the bisect showed Google's app only boots reliably under
// stock isolation. This script does diagnostics only.
//
// (Parked for a possible v1.1: the old Notification bridge that enabled
// privacy mode and per-app sound. It required breaking isolation, which
// is exactly what caused the black screen. Do not re-add it here.)
'use strict';

const { ipcRenderer } = require('electron');
const send = (channel, payload) => {
  try { ipcRenderer.send(channel, payload); } catch (_) {}
};

// Best-effort error forwarding to the debug log. DOM 'error' events cross
// the isolated-world boundary; some pure-JS rejections may not. The
// main process's console-message capture is the reliable backstop.
try {
  window.addEventListener('error', (e) => {
    send('page-error', {
      kind: 'error',
      message: String((e && e.message) || e),
      source: e && e.filename,
      line: e && e.lineno
    });
  });
  window.addEventListener('unhandledrejection', (e) => {
    let msg = 'unhandled rejection';
    try { msg = String(e.reason && (e.reason.stack || e.reason.message || e.reason)); } catch (_) {}
    send('page-error', { kind: 'unhandledrejection', message: msg });
  });
} catch (_) {}

send('preload-ok');
