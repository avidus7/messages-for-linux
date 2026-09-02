// bisect.js — finds exactly which customization breaks Google Messages.
//
// Loads the real messages.google.com under a series of configurations,
// starting from the known-good vanilla setup and adding one thing at a
// time. Prints a PASS/FAIL table at the end and writes it to
// bisect-results.txt next to this file.
//
// Run:  node_modules/.bin/electron bisect.js
// Takes about 3 minutes. Windows flash open and closed — that's normal.
'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const URL = 'https://messages.google.com/web/';
const APP_DIR = __dirname;
const WAIT_MS = 22000;
const OUT = path.join(APP_DIR, 'bisect-results.txt');
const results = [];

// Each step = vanilla PLUS the change named. Order is cumulative-ish so the
// first FAIL names the culprit.
const STEPS = [
  { name: '1. vanilla (baseline)',        wp: {} },
  { name: '2. + contextIsolation:false',  wp: { contextIsolation: false, sandbox: false } },
  { name: '3. + preload script',          wp: { contextIsolation: false, sandbox: false, preload: path.join(APP_DIR, 'preload.js') } },
  { name: '4. + custom partition',        wp: { partition: 'persist:bisect4' } },
  { name: '5. + UA override',             wp: {}, ua: true },
  { name: '6. + permission handler',      wp: {}, perms: true },
  { name: '7. + spellcheck en-CA',        wp: { spellcheck: true }, spell: true },
  { name: '8. FULL (all of the above)',   wp: { contextIsolation: false, sandbox: false, preload: path.join(APP_DIR, 'preload.js'), partition: 'persist:bisect8', spellcheck: true }, ua: true, perms: true, spell: true }
];

function runStep(step) {
  return new Promise((resolve) => {
    let bootstrapErr = 0;
    let netFails = 0;
    const win = new BrowserWindow({
      width: 1000, height: 700, show: false,
      webPreferences: Object.assign({ nodeIntegration: false }, step.wp)
    });

    const ses = win.webContents.session;
    if (step.ua) {
      ses.setUserAgent(app.userAgentFallback.replace(/\s?Electron\/[\d.]+/i, ''));
    }
    if (step.perms) {
      ses.setPermissionRequestHandler((_wc, permission, cb) => {
        cb(['notifications', 'clipboard-sanitized-write', 'fullscreen'].includes(permission));
      });
    }
    if (step.spell) {
      try {
        ses.setSpellCheckerLanguages(['en-CA']);
        ses.setSpellCheckerEnabled(true);
      } catch (_) {}
    }

    win.webContents.on('console-message', (a, b, c) => {
      const msg = (a && typeof a === 'object' && a.message) ? a.message : String(b || '');
      if (/mw_bootstrap|Consecutive load failures/i.test(msg)) bootstrapErr++;
    });
    win.webContents.on('did-fail-load', (_e, code, _d, _u, isMain) => {
      if (isMain && code !== -3) netFails++;
    });

    win.loadURL(URL);

    setTimeout(async () => {
      let text = '';
      try {
        // A dead renderer never answers executeJavaScript — that's what
        // stranded the Aug-29 run at step 2. Race it against a timeout so
        // a killed renderer registers as a FAIL instead of hanging forever.
        text = await Promise.race([
          win.webContents.executeJavaScript(
            'document.body ? document.body.innerText.replace(/\\s+/g," ").trim() : ""'
          ),
          new Promise((_r, rej) => setTimeout(() => rej(new Error('renderer unresponsive')), 5000))
        ]);
      } catch (e) { text = `<renderer dead: ${e.message}>`; }

      const looksAlive = text.length > 20 && !/^\s*$/.test(text);
      const verdict = (bootstrapErr === 0 && looksAlive) ? 'PASS' : 'FAIL';
      results.push({
        name: step.name,
        verdict,
        detail: `bootstrapErrors=${bootstrapErr} netFails=${netFails} textLen=${text.length} :: "${text.slice(0, 55)}"`
      });

      const line = `${verdict}  ${step.name}\n        ${results[results.length - 1].detail}`;
      console.log(line);
      try { win.destroy(); } catch (_) {}
      resolve();
    }, WAIT_MS);
  });
}

app.whenReady().then(async () => {
  console.log('\nBisecting — about 3 minutes. Windows will flash; that is normal.\n');
  for (const step of STEPS) {
    await runStep(step);
  }

  const report = [
    '',
    '================ BISECT RESULTS ================',
    ...results.map((r) => `${r.verdict.padEnd(5)} ${r.name}\n      ${r.detail}`),
    '===============================================',
    ''
  ].join('\n');

  console.log(report);
  try {
    fs.writeFileSync(OUT, report);
    console.log('Saved to: ' + OUT + '\n');
  } catch (_) {}

  setTimeout(() => app.exit(0), 500);
});

app.on('window-all-closed', () => {});
