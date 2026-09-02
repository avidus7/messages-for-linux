// main.js — Messages for Linux (avidusSoftware): unofficial Google
// Messages desktop app.
// Window + session, full menu, tray, notification bridge, find bar,
// downloads, autostart, settings persistence.
'use strict';

const {
  app, BrowserWindow, Menu, Tray, Notification,
  ipcMain, shell, dialog, nativeTheme, nativeImage, session
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const settings = require('./settings');
const { buildMenu } = require('./menu');

const MESSAGES_URL = 'https://messages.google.com/web/';
const MESSAGES_NEW = 'https://messages.google.com/web/conversations/new';
const MESSAGES_SETTINGS = 'https://messages.google.com/web/settings';
const HELP_URL = 'https://support.google.com/messages/';
// (removed) custom session partition — broke Google's module loader.

const APP_DIR = __dirname;
// When packaged, assets live in app.asar.unpacked (asarUnpack in
// package.json) because Tray icons and .desktop entries need real files
// on disk, not paths inside the archive.
const ASSET_DIR = app.isPackaged
  ? path.join(APP_DIR.replace(/app\.asar$/, 'app.asar.unpacked'), 'assets')
  : path.join(APP_DIR, 'assets');

// ---- selectable icon set (Settings → App Icon) ----
const ICON_SET = {
  green:     'Phosphor Green',
  amber:     'Phosphor Amber',
  chrome:    'Amiga Chrome',
  blocks:    'BBS Blocks',
  synthwave: 'Synthwave Grid',
  plasma:    'Plasma FX'
};
function iconKey() {
  const s = settings.get();
  const day = ICON_SET[s.appIcon] ? s.appIcon : 'green';
  const night = ICON_SET[s.nightShiftIcon] ? s.nightShiftIcon : 'amber';
  // #17 Night Shift: after dark the app quietly changes clothes.
  return settings.nightShiftIconFor(s.nightShift, new Date().getHours(), day, night);
}

// #36 Tray unread COUNT — the number, not just a dot. Falls back to the dot
// if a numbered icon is missing, and to the plain icon if the dot is missing,
// so a missing asset can never leave the tray blank.
function trayIconPath() {
  const s = settings.get();
  const key = iconKey();
  const plain = path.join(ASSET_DIR, 'icons', `${key}.png`);
  if (!s.showUnreadBadge || unreadCount < 1) return plain;
  if (s.badgeStyle === 'count') {
    const n = unreadCount > 9 ? '9plus' : String(unreadCount);
    const counted = path.join(ASSET_DIR, 'icons', `${key}-${n}.png`);
    if (fs.existsSync(counted)) return counted;
  }
  const dot = path.join(ASSET_DIR, 'icons', `${key}-unread.png`);
  return fs.existsSync(dot) ? dot : plain;
}
function iconPath(unread = false) {
  return path.join(ASSET_DIR, 'icons', `${iconKey()}${unread ? '-unread' : ''}.png`);
}
// ICON is used for notifications, dialogs and window identity; it follows
// the selected icon. The .desktop / installer icon stays the default green.
function currentIcon() { return iconPath(false); }
const ICON = path.join(ASSET_DIR, 'icon.png'); // stable default (green)

// ---- pin userData to a stable path ----
// This folder holds the signed-in Google session. Every prior name this
// app has used gets migrated in so nobody is ever silently logged out.
const NEW_UD = path.join(app.getPath('appData'), 'messages-for-linux');
const LEGACY_UD = [
  path.join(app.getPath('appData'), 'avid-messages'),      // 1.0.3–1.2.0 dev era
  path.join(app.getPath('appData'), 'Messages for Linux'), // packaged default
  path.join(app.getPath('appData'), 'Messages Avid'),      // 1.1.0 packaged default
  path.join(app.getPath('appData'), 'Messages (Avid)')     // pre-1.0.3 default
];
try {
  if (!fs.existsSync(NEW_UD)) {
    const found = LEGACY_UD.find((p) => fs.existsSync(p));
    if (found) fs.renameSync(found, NEW_UD);
  }
} catch (_) {}
app.setPath('userData', NEW_UD);

// ---- settings must load before app is ready (hw-accel flag) ----
settings.init(app.getPath('userData'));

// ---- debug log: everything interesting lands in userData/debug.log ----
const LOG_PATH = path.join(app.getPath('userData'), 'debug.log');
try {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  if (fs.existsSync(LOG_PATH) && fs.statSync(LOG_PATH).size > 512 * 1024) {
    fs.writeFileSync(LOG_PATH, ''); // rotate when it gets big
  }
} catch (_) {}
function log(...parts) {
  const line = `[${new Date().toISOString()}] ${parts.join(' ')}`;
  console.log(line);
  try { fs.appendFileSync(LOG_PATH, line + '\n'); } catch (_) {}
}
log('=== app start ===',
  `electron=${process.versions.electron}`,
  `chrome=${process.versions.chrome}`,
  `node=${process.versions.node}`,
  `argv=${process.argv.slice(1).join(' ')}`);
if (settings.get().disableHardwareAcceleration) {
  app.disableHardwareAcceleration();
}

// ---- single instance ----
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { showWindow(); }
  });
}

let win = null;
let tray = null;
let findWin = null;
let unreadCount = 0;
app.isQuitting = false;

const startHidden = process.argv.includes('--hidden') || settings.get().startMinimized;

// ---------------------------------------------------------------- helpers

// (removed) cleanUserAgent() — the UA override broke Google's module loader.

function isMuted() {
  const s = settings.get();
  if (s.awayQuiets && isAway()) return true;
  if (settings.quietHoursActive(s.quietHours, new Date().getHours())) return true;
  const m = s.muteUntil;
  if (m === -1) return true;
  if (m > Date.now()) return true;
  if (m !== 0) settings.set('muteUntil', 0); // expired — clear it
  return false;
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function isGoogleUrl(u) {
  try {
    const host = new URL(u).hostname;
    return host === 'google.com' || host.endsWith('.google.com') ||
           host === 'gstatic.com' || host.endsWith('.gstatic.com') ||
           host === 'googleusercontent.com' || host.endsWith('.googleusercontent.com');
  } catch (_) { return false; }
}

// ---------------------------------------------------------------- tray

function refreshTray() {
  if (!tray) return;
  const muted = isMuted();
  const s = settings.get();
  const menu = Menu.buildFromTemplate([
    { label: 'Open Messages', click: () => revealOrPrompt() },
    { type: 'separator' },
    {
      label: 'Notifications Enabled', type: 'checkbox', checked: s.notificationsEnabled,
      click: (mi) => { settings.set('notificationsEnabled', mi.checked); rebuildAppMenu(); }
    },
    {
      label: muted ? 'Unmute' : 'Mute Until Turned Back On',
      click: () => actions.mute(muted ? 0 : -1)
    },
    {
      label: 'Away', type: 'checkbox', checked: s.awayMode,
      click: (mi) => actions.setAwayMode(mi.checked)
    },
    ...(s.appLock && s.appLockHash ? [{ label: 'Lock Now', click: () => actions.lockNow() }] : []),
    { type: 'separator' },
    { label: 'Quit', click: () => actions.quit() }
  ]);
  tray.setContextMenu(menu);
  refreshBadge();
}

function refreshBadge() {
  if (!tray) return;
  tray.setImage(nativeImage.createFromPath(trayIconPath()));
  const bits = ['Messages for Linux'];
  if (unreadCount > 0) bits.push(`${unreadCount} unread`);
  if (isAway()) bits.push(autoAway ? 'away (idle)' : 'away');
  if (isLocked()) bits.push('locked');
  tray.setToolTip(bits.join(' — '));
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(iconPath(false)));
  tray.on('click', () => {
    if (!win) return;
    win.isVisible() ? win.hide() : revealOrPrompt();
  });
  refreshTray();
}

// ---------------------------------------------------------------- find bar

function positionFindBar() {
  if (!findWin || !win) return;
  const b = win.getContentBounds();
  findWin.setBounds({ x: b.x + b.width - 360, y: b.y + 8, width: 350, height: 48 });
}

function openFindBar() {
  if (!win) return;
  if (findWin) {
    positionFindBar();
    findWin.show();
    findWin.webContents.send('find:focus');
    return;
  }
  findWin = new BrowserWindow({
    parent: win,
    frame: false,
    resizable: false,
    movable: false,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(APP_DIR, 'findbar-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });
  findWin.loadFile(path.join(APP_DIR, 'findbar.html'));
  findWin.once('ready-to-show', () => {
    positionFindBar();
    findWin.show();
    findWin.webContents.send('find:focus');
  });
  findWin.on('closed', () => { findWin = null; });
}

function closeFindBar() {
  if (win) win.webContents.stopFindInPage('clearSelection');
  if (findWin) findWin.hide();
}

ipcMain.on('find:start', (_e, { text, forward, findNext }) => {
  if (win) win.webContents.findInPage(text, { forward, findNext });
});
ipcMain.on('find:stop', () => {
  if (win) win.webContents.stopFindInPage('clearSelection');
  if (findWin) findWin.webContents.send('find:result', { active: 0, total: 0 });
});
ipcMain.on('find:close', () => closeFindBar());

// ---------------------------------------------------------------- diagnostics ipc

ipcMain.on('preload-ok', () => log('preload installed OK'));
ipcMain.on('page-error', (_e, info) => {
  log('PAGE-ERROR', info && info.kind, info && info.message, info && info.source ? `(${info.source}:${info.line})` : '');
});
app.on('child-process-gone', (_e, details) => {
  log('CHILD-PROCESS-GONE', `type=${details.type}`, `reason=${details.reason}`, `exitCode=${details.exitCode}`);
});

// ---------------------------------------------------------------- notifications
//
// v1.0.3: notifications are NATIVE. The page's own HTML5 Notification API
// flows straight through Electron to the desktop — same as the vanilla
// config that passed the bisect. Our on/off toggle and Mute work through a
// session permission gate (see setPermissionCheckHandler in createWindow).
//
// PARKED for a possible v1.1 (flagged, not silently dropped): the old
// preload Notification bridge gave us "hide message text" privacy mode and
// a per-app sound toggle. It required contextIsolation:false, which is
// what black-screened the app. Those two menu items are removed until we
// find an isolation-safe way to do it.

// ---------------------------------------------------------------- autostart

function launcherCommand() {
  // Packaged: an AppImage must relaunch via its own image path (APPIMAGE),
  // a .deb install relaunches via the installed binary. Dev: the launcher
  // script. Quoted because paths can contain spaces.
  if (app.isPackaged) {
    return `"${process.env.APPIMAGE || process.execPath}" --hidden`;
  }
  const sh = path.join(APP_DIR, 'messages-for-linux.sh');
  if (fs.existsSync(sh)) return `"${sh}" --hidden`;
  // dev fallback: electron binary + app dir
  return `"${process.execPath}" "${APP_DIR}" --hidden`;
}

function setLaunchAtLogin(enabled) {
  if (process.platform === 'win32') {
    // Windows: registry-backed login item, no .desktop files
    try {
      app.setLoginItemSettings({ openAtLogin: enabled, args: ['--hidden'] });
      settings.set('launchAtLogin', enabled);
    } catch (err) {
      dialog.showErrorBox('Autostart', `Couldn't update login item:\n${err.message}`);
    }
    return;
  }
  const dir = path.join(os.homedir(), '.config', 'autostart');
  const file = path.join(dir, 'messages-for-linux.desktop');
  const legacy = path.join(dir, 'avid-messages.desktop'); // pre-1.0.0 name
  try {
    if (fs.existsSync(legacy)) fs.unlinkSync(legacy);
    if (enabled) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, [
        '[Desktop Entry]',
        'Type=Application',
        'Name=Messages for Linux',
        'Comment=Google Messages desktop app',
        `Exec=${launcherCommand()}`,
        `Icon=${ICON}`,
        'X-GNOME-Autostart-enabled=true',
        'Terminal=false'
      ].join('\n') + '\n', 'utf8');
    } else if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
    settings.set('launchAtLogin', enabled);
  } catch (err) {
    dialog.showErrorBox('Autostart', `Couldn't update autostart entry:\n${err.message}`);
  }
}

// ---------------------------------------------------------------- actions (used by menus)

// ---------------------------------------------------------------- custom css

const CSS_TEMPLATE = `/* Messages for Linux — custom.css
 * Anything you put here is injected into the Messages page as styling.
 * It cannot break the app: worst case, delete this file (or empty it)
 * and use Settings → Reload Custom CSS.
 *
 * Example — give the whole page a green phosphor tint:
 *
 * body { filter: sepia(1) hue-rotate(60deg) saturate(1.6); }
 *
 * Example — bigger message text:
 *
 * body { font-size: 18px !important; }
 */
`;

let cssKey = null;

function customCssPath() {
  return path.join(app.getPath('userData'), 'custom.css');
}

async function applyCustomCss() {
  if (!win) return;
  try {
    if (cssKey) {
      await win.webContents.removeInsertedCSS(cssKey).catch(() => {});
      cssKey = null;
    }
    const p = customCssPath();
    if (fs.existsSync(p)) {
      const css = fs.readFileSync(p, 'utf8');
      if (css.trim()) {
        cssKey = await win.webContents.insertCSS(css);
        log('custom css applied', `(${css.length} bytes)`);
      }
    }
  } catch (err) {
    log('custom css failed:', err.message);
  }
}

function editCustomCss() {
  const p = customCssPath();
  try {
    if (!fs.existsSync(p)) fs.writeFileSync(p, CSS_TEMPLATE, 'utf8');
    shell.openPath(p);
  } catch (err) {
    dialog.showErrorBox('Custom CSS', `Couldn't open custom.css:\n${err.message}`);
  }
}

// ---------------------------------------------------------------- hotkeys
// v1.1: the summon key became configurable (#91) and gained a panic-hide
// sibling (#41). The old fixed Control+Alt+M is still the default, so an
// existing install behaves exactly as it did before.

const SUMMON_CHOICES = ['Control+Alt+M', 'Control+Shift+M', 'Super+M', 'F9'];
const PANIC_CHOICES = ['off', 'Control+Alt+H', 'Control+Shift+H', 'Pause', 'F10'];

let hotkeyReport = { summon: null, panic: null };

function applyHotkeys() {
  const { globalShortcut } = require('electron');
  const s = settings.get();
  globalShortcut.unregisterAll();
  hotkeyReport = { summon: null, panic: null };

  // #91 summon
  const summon = SUMMON_CHOICES.includes(s.summonAccel) ? s.summonAccel : 'Control+Alt+M';
  if (s.summonHotkey) {
    const ok = globalShortcut.register(summon, () => {
      if (!win) return;
      if (win.isVisible() && win.isFocused()) win.hide();
      else revealOrPrompt();
    });
    hotkeyReport.summon = ok ? summon : `TAKEN:${summon}`;
    log(ok ? `summon hotkey registered (${summon})`
           : `summon hotkey UNAVAILABLE — ${summon} already taken by another app`);
  }

  // #41 panic hide — vanish now, and re-lock on the way out if App Lock is on
  const panic = PANIC_CHOICES.includes(s.panicAccel) ? s.panicAccel : 'Control+Alt+H';
  if (panic !== 'off') {
    const ok = globalShortcut.register(panic, () => panicHide());
    hotkeyReport.panic = ok ? panic : `TAKEN:${panic}`;
    log(ok ? `panic hotkey registered (${panic})`
           : `panic hotkey UNAVAILABLE — ${panic} already taken by another app`);
  }
}

// Kept so any older call site still works; v1.1 routes through applyHotkeys.
function applySummonHotkey() { applyHotkeys(); }

function panicHide() {
  if (!win) return;
  const s = settings.get();
  if (s.appLock && s.appLockHash) locked = true;
  win.hide();
  refreshBadge();
  const mode = CAMO_MODES[s.camouflage] ? s.camouflage : 'hide';
  if (mode !== 'hide') showCamouflage(mode);
  log('panic hide', `(${mode})`);
}

// ---------------------------------------------------------------- away (#28/#29)

let autoAway = false;
let awayTimer = null;

function isAway() { return settings.get().awayMode || autoAway; }

function tickAway() {
  const mins = Number(settings.get().autoAwayMinutes) || 0;
  if (!mins) {
    if (autoAway) { autoAway = false; log('auto-away cleared (disabled)'); refreshTray(); }
    return;
  }
  let idleSec = 0;
  try { idleSec = require('electron').powerMonitor.getSystemIdleTime(); }
  catch (err) { return; } // no idle support on this platform — stay put
  const should = idleSec >= mins * 60;
  if (should !== autoAway) {
    autoAway = should;
    log('auto-away', should ? `ON (idle ${idleSec}s)` : 'OFF');
    refreshTray();
  }
}

function startAwayWatch() {
  if (awayTimer) clearInterval(awayTimer);
  awayTimer = setInterval(tickAway, 30 * 1000);
}

// ---------------------------------------------------------------- ghost mode (#85)

function applyOpacity() {
  if (!win) return;
  const v = settings.clampOpacity(settings.get().windowOpacity);
  win.setOpacity(v / 100);
  log('opacity', v + '%');
}

// ---------------------------------------------------------------- night shift (#17)

let nightTimer = null;
let lastWornIcon = null;

function startNightShiftWatch() {
  if (nightTimer) clearInterval(nightTimer);
  nightTimer = setInterval(() => {
    const now = iconKey();
    if (now !== lastWornIcon) {
      lastWornIcon = now;
      log('night shift → icon', now);
      if (win) win.setIcon(nativeImage.createFromPath(currentIcon()));
      refreshBadge();
    }
  }, 60 * 1000);
  lastWornIcon = iconKey();
}

// ---------------------------------------------------------------- audio (#1/#4/#9/#69/#76)
//
// The main process cannot play sound, so a hidden window does it. Sounds are
// read from disk here and handed over as data: URLs, which keeps the audio
// window sandboxed with no file access of its own.

const SOUND_PACK = {
  'classic-blip': 'Classic Blip',
  'sid-arp':      'SID Arpeggio (C64)',
  'amiga-disk':   'Amiga Drive Tick',
  'modem-chirp':  'Modem Chirp',
  'pager':        'Pager',
  'soft-chime':   'Soft Chime',
  'tracker-kick': 'Tracker Kick'
};

const AMBIENT_PACK = {
  'ambient-modem': 'Modem Hiss',
  'ambient-sid':   'SID Hum',
  'ambient-drive': 'Drive Tick'
};

let audioWin = null;
let audioReady = false;
const soundCache = new Map();

function soundDataUrl(name) {
  if (soundCache.has(name)) return soundCache.get(name);
  try {
    const p = path.join(ASSET_DIR, 'sounds', `${name}.wav`);
    if (!fs.existsSync(p)) { log('sound missing:', name); return null; }
    const url = 'data:audio/wav;base64,' + fs.readFileSync(p).toString('base64');
    soundCache.set(name, url);
    return url;
  } catch (err) {
    log('sound load failed:', name, err.message);
    return null;
  }
}

function createAudioWindow() {
  if (audioWin) return;
  audioWin = new BrowserWindow({
    width: 200, height: 100,
    show: false, skipTaskbar: true,
    webPreferences: {
      preload: path.join(APP_DIR, 'audio-preload.js'),
      contextIsolation: true, sandbox: true, nodeIntegration: false
    }
  });
  audioWin.loadFile(path.join(APP_DIR, 'audio.html'));
  audioWin.on('closed', () => { audioWin = null; audioReady = false; });
}

ipcMain.on('audio:ready', () => {
  audioReady = true;
  log('audio engine ready');
  applyAmbient();
});

function playSound(name, volumeOverride) {
  if (!name || name === 'off' || !audioWin || !audioReady) return;
  const url = soundDataUrl(name);
  if (!url) return;
  const vol = (volumeOverride !== undefined ? volumeOverride : settings.get().soundVolume) / 100;
  audioWin.webContents.send('audio:play', { name, dataUrl: url, volume: Math.max(0, Math.min(1, vol)) });
}

function applyAmbient() {
  if (!audioWin || !audioReady) return;
  const s = settings.get();
  const name = s.ambientSound;
  const url = (name && name !== 'off') ? soundDataUrl(name) : null;
  audioWin.webContents.send('audio:ambient', {
    dataUrl: url, volume: Math.max(0, Math.min(1, (s.ambientVolume || 0) / 100))
  });
  log('ambient →', name || 'off');
}

// #9 MSN nudge: shake the window, the way the original did.
function nudgeWindow() {
  if (!win || win.isDestroyed() || !win.isVisible()) return;
  const b = win.getBounds();
  const steps = [14, -14, 11, -11, 8, -8, 5, -5, 0];
  steps.forEach((dx, i) => {
    setTimeout(() => {
      if (win && !win.isDestroyed()) win.setBounds({ ...b, x: b.x + dx });
    }, i * 45);
  });
}

// Fired when the unread count goes UP — that is our "new message" event.
// Deliberately conservative: a count going down (you read something) is silent.
function onNewMessages(delta) {
  const s = settings.get();
  if (isMuted() || !s.notificationsEnabled) return;
  if (s.soundPack && s.soundPack !== 'off' && s.notificationSound) playSound(s.soundPack);
  if (s.nudgeOnMessage) { playSound('nudge'); nudgeWindow(); }
  log('new messages', `+${delta}`);
}

// ---------------------------------------------------------------- camouflage (#82)
// Panic hide can do more than vanish: it can put something innocuous on screen.

const CAMO_MODES = { hide: 'Just Hide', terminal: 'Fake Terminal', editor: 'Fake Code Editor', spreadsheet: 'Fake Spreadsheet' };
let camoWin = null;

function showCamouflage(mode) {
  if (camoWin) { camoWin.show(); camoWin.focus(); return; }
  camoWin = new BrowserWindow({
    width: 900, height: 600,
    title: mode === 'terminal' ? 'Terminal' : mode === 'editor' ? 'untitled.py - Editor' : 'Sheet1',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false }
  });
  camoWin.setMenu(null);
  camoWin.loadFile(path.join(APP_DIR, 'camouflage.html'), { query: { mode } });
  camoWin.on('closed', () => { camoWin = null; });
  // Escape closes the disguise
  camoWin.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape' && camoWin) camoWin.close();
  });
}

// ---------------------------------------------------------------- pop-out (#37) helper below

// ---------------------------------------------------------------- cracktro (#71)

let cracktroWin = null;

function showCracktro(force) {
  if (cracktroWin) { cracktroWin.focus(); return; }
  cracktroWin = new BrowserWindow({
    width: 800, height: 500,
    resizable: true, minimizable: true, maximizable: true,
    title: 'Messages for Linux',
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    icon: nativeImage.createFromPath(currentIcon()),
    webPreferences: {
      preload: path.join(APP_DIR, 'cracktro-preload.js'),
      contextIsolation: true, sandbox: true, nodeIntegration: false
    }
  });
  cracktroWin.setMenu(null);
  cracktroWin.loadFile(path.join(APP_DIR, 'cracktro.html'));
  cracktroWin.on('closed', () => { cracktroWin = null; });
  if (!force) settings.set('cracktroSeen', true);
  // The modem chirp only fires when the soundtrack is off — otherwise
  // Valium owns the room from note one.
  if (!settings.get().cracktroMusic) playSound('modem-chirp');
  log('cracktro shown');
  // CKTEST=1 → interrogate the live intro and log its state. Lets a packaged
  // build prove its own music loads, since nobody in CI has speakers.
  if (process.env.CKTEST) {
    setTimeout(() => {
      if (!cracktroWin) return;
      cracktroWin.webContents.executeJavaScript('window.__ck && window.__ck.state()')
        .then((st) => log('cktest', JSON.stringify(st)))
        .catch((err) => log('cktest failed:', err.message));
    }, 4000);
  }
}



const popouts = new Set();

function popOutConversation() {
  if (!win) return;
  const url = win.webContents.getURL();
  if (!url || !url.startsWith('https://messages.google.com')) {
    dialog.showMessageBox(win, {
      type: 'info', buttons: ['OK'],
      message: 'Nothing to pop out yet.',
      detail: 'Open a conversation first, then pop it out into its own window.'
    });
    return;
  }
  const w = new BrowserWindow({
    width: 480, height: 680,
    title: 'Conversation — Messages for Linux',
    icon: nativeImage.createFromPath(currentIcon()),
    autoHideMenuBar: true,
    webPreferences: {
      // No partition on purpose: the default session is where the signed-in
      // Google session lives, so a popped-out window is already paired.
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });
  w.loadURL(url);
  w.on('closed', () => popouts.delete(w));
  popouts.add(w);
  log('popped out conversation window');
}

// ---------------------------------------------------------------- settings backup (#44)

// Device-specific things never travel: the PIN digest, its salt, the UIN and
// the window geometry belong to this machine, not to the backup.
const NO_EXPORT = ['appLockHash', 'appLockSalt', 'uin', 'windowBounds'];

async function exportSettings() {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Export Settings',
    defaultPath: path.join(app.getPath('documents'), 'messages-for-linux-settings.json'),
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePath) return;
  try {
    const out = { ...settings.get() };
    for (const k of NO_EXPORT) delete out[k];
    fs.writeFileSync(filePath, JSON.stringify(out, null, 2), 'utf8');
    dialog.showMessageBox(win, {
      message: 'Settings exported.', buttons: ['OK'],
      detail: `${filePath}\n\nYour PIN and unread history are not included.`
    });
  } catch (err) {
    dialog.showErrorBox('Export failed', err.message);
  }
}

async function importSettings() {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Import Settings', properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePaths || !filePaths[0]) return;
  try {
    const raw = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Not a settings file.');
    let applied = 0;
    for (const [k, v] of Object.entries(raw)) {
      if (NO_EXPORT.includes(k)) continue;             // never import lock/identity
      if (!(k in settings.DEFAULTS)) continue;          // ignore unknown keys
      if (typeof v !== typeof settings.DEFAULTS[k]) continue; // and wrong types
      settings.set(k, v); applied++;
    }
    applyOpacity(); applyHotkeys(); rebuildAppMenu(); refreshTray();
    if (win) win.setIcon(nativeImage.createFromPath(currentIcon()));
    dialog.showMessageBox(win, {
      message: `Imported ${applied} settings.`, buttons: ['OK'],
      detail: 'Some changes may need a restart to fully apply.'
    });
    log('settings imported:', applied);
  } catch (err) {
    dialog.showErrorBox('Import failed', err.message);
  }
}

// ---------------------------------------------------------------- UIN (#27)

function getUin() {
  let u = settings.get().uin;
  if (!u) { u = settings.makeUin(); settings.set('uin', u); log('minted UIN', u); }
  return u;
}

// ---------------------------------------------------------------- app lock (#43)

let locked = false;
let lockWin = null;
let lockMode = 'unlock'; // 'unlock' | 'set'

function isLocked() { return locked; }

function showLockWindow(mode) {
  lockMode = mode;
  if (lockWin) { lockWin.show(); lockWin.focus(); return; }
  lockWin = new BrowserWindow({
    width: 340, height: 460,
    resizable: false, minimizable: false, maximizable: false,
    title: mode === 'set' ? 'Set PIN' : 'Locked',
    icon: nativeImage.createFromPath(currentIcon()),
    autoHideMenuBar: true, skipTaskbar: false,
    webPreferences: {
      preload: path.join(APP_DIR, 'lock-preload.js'),
      contextIsolation: true, sandbox: true, nodeIntegration: false
    }
  });
  lockWin.setMenu(null);
  lockWin.loadFile(path.join(APP_DIR, 'lock.html'));
  lockWin.on('closed', () => { lockWin = null; });
}

function lockNow() {
  if (!settings.get().appLock || !settings.get().appLockHash) return;
  locked = true;
  if (win) win.hide();
  refreshBadge();
  log('locked');
}

// showWindow is gated by the lock: if locked, the PIN pad appears instead.
function revealOrPrompt() {
  if (locked) { showLockWindow('unlock'); return; }
  showWindow();
}

// #71 the intro's config: identity, music prefs, and the user's own scroller
// text from cracktro.txt in the config folder. Their text scrolls first;
// the built-in text always follows. Lines starting with # are comments.
const DEFAULT_CRACKTRO_TXT = `# MESSAGES FOR LINUX — this is YOUR scroller file.
# Anything you write here scrolls FIRST, before the built-in text.
# Lines starting with # are ignored. Go on — hack our cracktro.
DIG THE TRACK? GRAB THE MP3 OR THE ORIGINAL AMIGA .MED OF VALIUM BY AVID AT GITHUB.COM/AVIDUS7/MESSAGES-FOR-LINUX
`;

ipcMain.handle('cracktro:config', () => {
  let userText = '';
  try {
    const p = path.join(app.getPath('userData'), 'cracktro.txt');
    if (!fs.existsSync(p)) {
      fs.writeFileSync(p, DEFAULT_CRACKTRO_TXT, 'utf8');
      log('cracktro.txt created with defaults');
    }
    if (fs.existsSync(p)) {
      userText = fs.readFileSync(p, 'utf8')
        .split('\n')
        .filter((l) => l.trim() && !l.trim().startsWith('#'))
        .join(' ... ');
      log('cracktro.txt loaded', `(${userText.length} chars)`);
    }
  } catch (err) { log('cracktro.txt read failed:', err.message); }
  const s = settings.get();
  return {
    uin: getUin(),
    music: s.cracktroMusic,
    volume: s.cracktroVolume,
    everyLaunch: s.cracktroEveryLaunch,
    userText
  };
});

const CRACKTRO_KEYS = ['cracktroMusic', 'cracktroVolume', 'cracktroEveryLaunch'];
ipcMain.on('cracktro:set', (_e, { key, value }) => {
  if (!CRACKTRO_KEYS.includes(key)) return;             // the intro sets its own three keys, nothing else
  if (typeof value !== typeof settings.DEFAULTS[key]) return;
  settings.set(key, value);
  rebuildAppMenu();
});
ipcMain.on('cracktro:close', () => { if (cracktroWin) cracktroWin.close(); });
ipcMain.on('cracktro:fullscreen', () => {
  if (cracktroWin) cracktroWin.setFullScreen(!cracktroWin.isFullScreen());
});

ipcMain.handle('lock:mode', () => ({
  mode: lockMode,
  appName: 'Messages for Linux'
}));

ipcMain.handle('lock:submit', (_e, pin) => {
  const s = settings.get();
  if (lockMode === 'set') {
    const clean = String(pin || '').trim();
    if (clean.length < 4) return { ok: false, message: 'Use at least 4 digits.' };
    const salt = settings.makeSalt();
    settings.set('appLockSalt', salt);
    settings.set('appLockHash', settings.hashPin(salt, clean));
    settings.set('appLock', true);
    locked = false;
    log('app lock PIN set');
    rebuildAppMenu(); refreshTray();
    return { ok: true, message: 'PIN set.' };
  }
  const ok = !!s.appLockHash && settings.hashPin(s.appLockSalt, String(pin || '')) === s.appLockHash;
  if (ok) { locked = false; log('unlocked'); refreshBadge(); }
  else log('failed unlock attempt');
  return { ok, message: ok ? 'Unlocked.' : 'Wrong PIN.' };
});

ipcMain.on('lock:done', (_e, unlocked) => {
  if (lockWin) { lockWin.close(); lockWin = null; }
  if (unlocked) showWindow();
});

function disableAppLock() {
  settings.set('appLock', false);
  settings.set('appLockHash', '');
  settings.set('appLockSalt', '');
  locked = false;
  log('app lock disabled');
  rebuildAppMenu(); refreshTray();
}

// ---------------------------------------------------------------- auto-update

// electron-updater can self-update the AppImage and the Windows installer.
// .deb and run-from-source installs can't self-update — for those, the
// menu item opens the releases page instead.
const RELEASES_URL = 'https://github.com/avidus7/messages-for-linux/releases';

function updatesSupported() {
  return app.isPackaged && (process.platform === 'win32' || !!process.env.APPIMAGE);
}

let updaterWired = false;
function wireUpdater(auto) {
  let autoUpdater;
  try { ({ autoUpdater } = require('electron-updater')); }
  catch (err) { log('updater unavailable:', err.message); return null; }
  if (!updaterWired) {
    updaterWired = true;
    autoUpdater.autoDownload = false;
    autoUpdater.on('error', (err) => log('updater error:', err.message));
    autoUpdater.on('update-available', async (info) => {
      log('update available:', info.version);
      const { response } = await dialog.showMessageBox(win, {
        type: 'info',
        buttons: ['Download', 'Later'],
        defaultId: 0,
        message: `Messages for Linux ${info.version} is available.`,
        detail: 'You are on ' + app.getVersion() + '. Download it in the background?'
      });
      if (response === 0) autoUpdater.downloadUpdate();
    });
    autoUpdater.on('update-downloaded', async (info) => {
      const { response } = await dialog.showMessageBox(win, {
        type: 'info',
        buttons: ['Restart Now', 'On Next Launch'],
        defaultId: 0,
        message: `Version ${info.version} downloaded.`,
        detail: 'Restart to finish updating.'
      });
      if (response === 0) { app.isQuitting = true; autoUpdater.quitAndInstall(); }
    });
  }
  return autoUpdater;
}

async function checkForUpdates(manual) {
  if (!updatesSupported()) {
    if (manual) {
      const { response } = await dialog.showMessageBox(win, {
        type: 'info',
        buttons: ['Open Releases Page', 'Close'],
        defaultId: 0,
        message: 'Automatic updates aren\'t available for this install type.',
        detail: 'The AppImage and the Windows installer self-update; .deb and source installs update from the releases page.'
      });
      if (response === 0) shell.openExternal(RELEASES_URL);
    }
    return;
  }
  const autoUpdater = wireUpdater();
  if (!autoUpdater) return;
  try {
    const r = await autoUpdater.checkForUpdates();
    if (manual && r && r.updateInfo && r.updateInfo.version === app.getVersion()) {
      dialog.showMessageBox(win, { message: 'You\'re up to date.', detail: 'Messages for Linux v' + app.getVersion(), buttons: ['OK'] });
    }
  } catch (err) {
    log('update check failed:', err.message);
    if (manual) dialog.showMessageBox(win, { type: 'warning', message: 'Update check failed.', detail: err.message, buttons: ['OK'] });
  }
}

const actions = {
  newConversation: () => { if (win) { showWindow(); win.loadURL(MESSAGES_NEW); } },
  reload: () => { if (win) win.loadURL(MESSAGES_URL); },
  hideToTray: () => { if (win) win.hide(); },
  quit: () => { app.isQuitting = true; app.quit(); },

  openFindBar,

  zoom: (delta) => {
    if (!win) return;
    const z = Math.max(-3, Math.min(5, win.webContents.getZoomLevel() + delta));
    win.webContents.setZoomLevel(z);
    settings.set('zoomLevel', z);
  },
  zoomReset: () => {
    if (!win) return;
    win.webContents.setZoomLevel(0);
    settings.set('zoomLevel', 0);
  },
  toggleFullScreen: () => { if (win) win.setFullScreen(!win.isFullScreen()); },
  setAlwaysOnTop: (v) => { if (win) win.setAlwaysOnTop(v); settings.set('alwaysOnTop', v); },
  setAutoHideMenuBar: (v) => {
    if (win) { win.setAutoHideMenuBar(v); win.setMenuBarVisibility(!v); }
    settings.set('autoHideMenuBar', v);
  },
  setTheme: (t) => { nativeTheme.themeSource = t; settings.set('theme', t); },

  setLaunchAtLogin,

  // ---- v1.0.0 feature actions ----
  setAppIcon: (key) => {
    settings.set('appIcon', ICON_SET[key] ? key : 'green');
    if (win) win.setIcon(nativeImage.createFromPath(currentIcon()));
    refreshBadge();
    log('app icon set:', iconKey());
  },
  setQuietHours: (range) => { settings.set('quietHours', range); refreshTray(); },
  setSummonHotkey: (v) => { settings.set('summonHotkey', v); applyHotkeys(); },

  // ---- v1.1 actions ----
  setSummonAccel: (accel) => { settings.set('summonAccel', accel); applyHotkeys(); rebuildAppMenu(); },
  setPanicAccel: (accel) => { settings.set('panicAccel', accel); applyHotkeys(); rebuildAppMenu(); },
  panicHide,
  setOpacity: (v) => { settings.set('windowOpacity', settings.clampOpacity(v)); applyOpacity(); },
  setBadgeStyle: (style) => { settings.set('badgeStyle', style); refreshBadge(); },
  setAwayMode: (v) => { settings.set('awayMode', !!v); refreshTray(); rebuildAppMenu(); },
  setAwayQuiets: (v) => { settings.set('awayQuiets', !!v); refreshTray(); },
  setAutoAwayMinutes: (m) => { settings.set('autoAwayMinutes', m); autoAway = false; tickAway(); refreshTray(); },
  setNightShift: (range) => {
    settings.set('nightShift', range);
    lastWornIcon = iconKey();
    if (win) win.setIcon(nativeImage.createFromPath(currentIcon()));
    refreshBadge();
  },
  setNightShiftIcon: (key) => {
    settings.set('nightShiftIcon', ICON_SET[key] ? key : 'amber');
    lastWornIcon = iconKey();
    refreshBadge();
  },
  popOutConversation,
  exportSettings,
  importSettings,
  setSpellCheckLanguage: (lang) => {
    settings.set('spellCheckLanguage', lang);
    try {
      if (win) win.webContents.session.setSpellCheckerLanguages([lang]);
      log('spellcheck language', lang);
    } catch (err) {
      dialog.showErrorBox('Spell Check', `Couldn't switch to ${lang}:\n${err.message}`);
    }
    rebuildAppMenu();
  },
  setSoundPack: (name) => {
    settings.set('soundPack', name);
    if (name && name !== 'off') playSound(name);   // preview it immediately
    rebuildAppMenu();
  },
  setSoundVolume: (v) => {
    settings.set('soundVolume', Math.max(0, Math.min(100, v)));
    const p = settings.get().soundPack;
    if (p && p !== 'off') playSound(p);            // preview at the new level
    rebuildAppMenu();
  },
  setNudgeOnMessage: (v) => { settings.set('nudgeOnMessage', !!v); if (v) { playSound('nudge'); nudgeWindow(); } },
  testNotificationSound: () => { const p = settings.get().soundPack; playSound(p === 'off' ? 'classic-blip' : p); },
  setAmbientSound: (name) => { settings.set('ambientSound', name); applyAmbient(); rebuildAppMenu(); },
  setAmbientVolume: (v) => {
    settings.set('ambientVolume', Math.max(0, Math.min(100, v)));
    if (audioWin && audioReady) audioWin.webContents.send('audio:ambient-volume', v / 100);
    rebuildAppMenu();
  },
  setCamouflage: (mode) => { settings.set('camouflage', CAMO_MODES[mode] ? mode : 'hide'); rebuildAppMenu(); },
  showCracktro: () => showCracktro(true),
  setCracktroEveryLaunch: (v) => settings.set('cracktroEveryLaunch', !!v),
  setPin: () => showLockWindow('set'),
  lockNow,
  disableAppLock,
  editCustomCss,
  reloadCustomCss: () => applyCustomCss(),
  checkForUpdates: () => checkForUpdates(true),

  mute: (until) => { settings.set('muteUntil', until); refreshTray(); },

  setSpellCheck: (v) => {
    settings.set('spellCheck', v);
    if (win) {
      const ses = win.webContents.session;
      ses.setSpellCheckerEnabled(v);
    }
  },
  setHardwareAcceleration: (enabled) => {
    settings.set('disableHardwareAcceleration', !enabled);
    dialog.showMessageBox(win, {
      type: 'question',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      message: 'Hardware acceleration change takes effect after a restart.',
    }).then(({ response }) => {
      if (response === 0) {
        app.isQuitting = true;
        app.relaunch();
        app.exit(0);
      }
    });
  },

  openMessagesSettings: () => { if (win) { showWindow(); win.loadURL(MESSAGES_SETTINGS); } },
  clearCache: async () => {
    if (!win) return;
    await win.webContents.session.clearCache();
    dialog.showMessageBox(win, { message: 'Cache cleared.', buttons: ['OK'] });
  },
  signOut: async () => {
    if (!win) return;
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Sign Out && Unpair', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      message: 'Sign out and unpair this computer?',
      detail: 'This wipes the saved session. You will need to pair with your phone again.'
    });
    if (response !== 0) return;
    const ses = win.webContents.session;
    await ses.clearStorageData();
    await ses.clearCache();
    win.loadURL(MESSAGES_URL);
  },

  showShortcuts: () => {
    dialog.showMessageBox(win, {
      title: 'Keyboard Shortcuts',
      message: 'Keyboard Shortcuts',
      detail: [
        'Ctrl+N — New conversation',
        'Ctrl+R — Reload',
        'Ctrl+F — Find in page',
        'Ctrl+= / Ctrl+- / Ctrl+0 — Zoom in / out / reset',
        'F11 — Full screen',
        'Ctrl+H — Minimize to tray',
        'Ctrl+Q — Quit',
        `${(settings.get().summonAccel || 'Control+Alt+M').replace('Control', 'Ctrl')} — Summon from anywhere (global)`,
        ...(settings.get().panicAccel && settings.get().panicAccel !== 'off'
            ? [`${settings.get().panicAccel.replace('Control', 'Ctrl')} — Panic hide (global)`] : []),
        'Ctrl+Shift+O — Pop out this conversation',
        '',
        'Google Messages also has its own shortcuts under',
        'Settings inside the app.'
      ].join('\n'),
      buttons: ['OK']
    });
  },
  openHelp: () => shell.openExternal(HELP_URL),
  toggleDevTools: () => { if (win) win.webContents.toggleDevTools(); },
  showAbout: () => showAboutWindow(),

  refreshTray,
  refreshBadge
};

function rebuildAppMenu() {
  buildMenu({ actions });
}

// ---------------------------------------------------------------- about window

let aboutWin = null;

function showAboutWindow() {
  if (aboutWin) { aboutWin.show(); aboutWin.focus(); return; }

  aboutWin = new BrowserWindow({
    width: 420,
    height: 520,
    parent: win || undefined,
    modal: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    title: 'About Messages for Linux',
    backgroundColor: '#16171a',
    icon: nativeImage.createFromPath(ICON),
    show: false,
    webPreferences: {
      preload: path.join(APP_DIR, 'about-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  aboutWin.setMenuBarVisibility(false);
  aboutWin.loadFile(path.join(APP_DIR, 'about.html'));
  aboutWin.once('ready-to-show', () => aboutWin.show());

  // links inside the About window would never make sense in-app
  aboutWin.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  aboutWin.on('closed', () => { aboutWin = null; });
}

ipcMain.handle('about:info', () => {
  // The avatar is read from disk and inlined as a data URL so it loads
  // identically in dev and inside a packaged asar.
  let avatarUrl = '';
  try {
    const buf = fs.readFileSync(path.join(ASSET_DIR, 'avid.jpg'));
    avatarUrl = 'data:image/jpeg;base64,' + buf.toString('base64');
  } catch (err) {
    log('about: avatar load failed:', err.message);
  }
  return {
    uin: getUin(),
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    avatarUrl
  };
});

ipcMain.on('about:close', () => { if (aboutWin) aboutWin.close(); });

// ---------------------------------------------------------------- window

function createWindow() {
  const s = settings.get();
  const bounds = s.windowBounds || { width: 1100, height: 760 };

  win = new BrowserWindow({
    ...bounds,
    minWidth: 480,
    minHeight: 360,
    icon: nativeImage.createFromPath(currentIcon()),
    show: false,
    autoHideMenuBar: s.autoHideMenuBar,
    alwaysOnTop: s.alwaysOnTop,
    backgroundColor: '#202124',
    webPreferences: {
      // Bisect result (Aug 29): vanilla defaults PASS on Rick's machine;
      // contextIsolation:false + sandbox:false kills the renderer against
      // Google's servers (ipcNative missing, silent death, black window).
      // So: proper isolation, proper sandbox — the config that works.
      preload: path.join(APP_DIR, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: true,
      spellcheck: s.spellCheck
    }
  });

  const ses = win.webContents.session;
  // NOTE: no setUserAgent() and no custom partition here on purpose — the
  // stock session + stock UA is the configuration that passed the bisect.
  ses.setSpellCheckerLanguages([s.spellCheckLanguage]);
  ses.setSpellCheckerEnabled(s.spellCheck);
  // No setPermissionRequestHandler either: vanilla (which passed) grants
  // requests by default, so we keep that behavior. The check handler below
  // is our one lever — it gates notification DISPLAY, which is how the
  // "Desktop Notifications" toggle and Mute work in v1.0.3.
  ses.setPermissionCheckHandler((_wc, permission) => {
    if (permission === 'notifications') {
      return settings.get().notificationsEnabled && !isMuted();
    }
    return true;
  });

  // downloads → ~/Downloads, quiet notification when done
  ses.on('will-download', (_e, item) => {
    const dir = app.getPath('downloads');
    let target = path.join(dir, item.getFilename());
    let i = 1;
    while (fs.existsSync(target)) {
      const ext = path.extname(item.getFilename());
      const base = path.basename(item.getFilename(), ext);
      target = path.join(dir, `${base} (${i++})${ext}`);
    }
    item.setSavePath(target);
    item.once('done', (_ev, state) => {
      if (state === 'completed') {
        new Notification({
          title: 'Download complete',
          body: `Saved ${path.basename(target)} to Downloads`,
          icon: currentIcon(),
          silent: true
        }).show();
      }
    });
  });

  nativeTheme.themeSource = s.theme;

  // keep google in-window, everything else in the system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isGoogleUrl(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          icon: nativeImage.createFromPath(ICON),
          webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
        }
      };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!isGoogleUrl(url) && !url.startsWith('file://')) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  // spellcheck context menu (right-click suggestions) + basic edit items
  win.webContents.on('context-menu', (_e, params) => {
    const items = [];
    for (const suggestion of params.dictionarySuggestions.slice(0, 5)) {
      items.push({
        label: suggestion,
        click: () => win.webContents.replaceMisspelling(suggestion)
      });
    }
    if (params.misspelledWord) {
      items.push({
        label: `Add "${params.misspelledWord}" to Dictionary`,
        click: () => win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
      });
      items.push({ type: 'separator' });
    }
    if (params.isEditable || params.selectionText) {
      items.push({ role: 'cut', enabled: params.isEditable && !!params.selectionText });
      items.push({ role: 'copy', enabled: !!params.selectionText });
      items.push({ role: 'paste', enabled: params.isEditable });
    }
    if (items.length) Menu.buildFromTemplate(items).popup();
  });

  // unread badge from page title, e.g. "(2) Messages"
  win.webContents.on('page-title-updated', (_e, title) => {
    const m = title.match(/\((\d+)\)/);
    const next = m ? parseInt(m[1], 10) : 0;
    const prev = unreadCount;
    unreadCount = next;
    refreshBadge();
    // A rising count is our "new message" event. A falling one means you
    // read something, and stays silent on purpose.
    if (next > prev) onNewMessages(next - prev);
  });

  // offline / load failure → local error page
  win.webContents.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    log('did-fail-load', `code=${code}`, `desc=${desc}`, `main=${isMainFrame}`, `url=${url}`);
    if (isMainFrame && code !== -3) {
      win.loadFile(path.join(APP_DIR, 'error.html'));
    }
  });

  win.webContents.on('did-finish-load', () => {
    log('did-finish-load', `url=${win.webContents.getURL()}`);
    win.webContents.setZoomLevel(settings.get().zoomLevel);
    cssKey = null;               // fresh document — previous injection is gone
    applyCustomCss();
  });

  // ---- diagnostics: everything the page says or does wrong gets logged ----
  win.webContents.on('console-message', (event) => {
    // Electron 44 event-object API (legacy multi-arg form is deprecated;
    // declaring those params at all triggers the deprecation warning).
    log(`console[${event.level}]`, event.message, `(${event.sourceId}:${event.lineNumber})`);
  });
  win.webContents.on('preload-error', (_e, preloadPath, err) => {
    log('PRELOAD-ERROR', preloadPath, err && err.message);
  });
  let rendererCrashes = 0;
  win.webContents.on('render-process-gone', (_e, details) => {
    rendererCrashes++;
    log('RENDER-PROCESS-GONE', `reason=${details.reason}`, `exitCode=${details.exitCode}`, `crash#${rendererCrashes}`);
    if (rendererCrashes === 1) {
      setTimeout(() => { if (win) { log('auto-reload after renderer crash'); win.loadURL(MESSAGES_URL); } }, 1000);
    } else if (win) {
      win.loadFile(path.join(APP_DIR, 'error.html'));
    }
  });
  win.webContents.on('unresponsive', () => log('PAGE-UNRESPONSIVE'));
  win.webContents.on('responsive', () => log('page responsive again'));

  win.on('move', positionFindBar);
  win.on('resize', positionFindBar);

  win.on('close', (e) => {
    settings.set('windowBounds', win.getBounds());
    if (!app.isQuitting && settings.get().closeToTray) {
      e.preventDefault();
      win.hide();
      if (findWin) findWin.hide();
    }
  });

  win.once('ready-to-show', () => {
    // isLocked() matters here: this fires a second or two after launch, by
    // which time App Lock may have armed. Without this guard a locked app
    // would still flash its window open once the page finished loading.
    const suppressed = startHidden || isLocked();
    log('ready-to-show', suppressed ? `staying hidden (locked=${isLocked()}, startHidden=${startHidden})` : 'showing window');
    if (!suppressed) win.show();
  });

  win.loadURL(MESSAGES_URL);
  win.on('closed', () => { win = null; });
}

// ---------------------------------------------------------------- lifecycle

app.whenReady().then(() => {
  createWindow();
  createTray();
  rebuildAppMenu();
  applyHotkeys();
  applyOpacity();
  startAwayWatch();
  startNightShiftWatch();
  getUin();                     // #27 mint once, then it's stable forever
  createAudioWindow();          // hidden window that plays our sounds

  // #71 the cracktro plays on the very first launch, and on every launch
  // for anyone who ticks the box (someone will, and we know who)
  if (!settings.get().cracktroSeen || settings.get().cracktroEveryLaunch) {
    setTimeout(() => showCracktro(false), 900);
  }

  // #43 if App Lock is armed, the app starts locked — the window stays
  // hidden until the PIN pad is satisfied.
  const s0 = settings.get();
  if (s0.appLock && s0.appLockHash) {
    locked = true;
    if (win) win.hide();
    log('starting locked');
  }

  // silent update check shortly after launch (packaged AppImage/Windows only)
  setTimeout(() => checkForUpdates(false), 15000);

  // internal verification hook: SELFTEST=1 → run the harness, then exit.
  // Costs a normal run nothing; selftest.js is only required when asked for.
  if (process.env.SELFTEST) {
    setTimeout(() => {
      try {
        const report = require('./selftest.js')({
          settings,
          trayIconPath,
          iconKey,
          isMuted,
          hashPin: settings.hashPin,
          setUnread: (n) => { unreadCount = n; },
          soundDataUrl,
          SOUND_PACK,
          AMBIENT_PACK,
          // reports whether a sound WOULD be played, without needing a speaker
          onNewMessagesProbe: () => {
            const s2 = settings.get();
            if (isMuted() || !s2.notificationsEnabled) return false;
            return !!(s2.soundPack && s2.soundPack !== 'off' && s2.notificationSound);
          }
        });
        log(`selftest: ${report.passed}/${report.total} passed`);
        for (const f of report.failures) log('  SELFTEST FAIL:', f.name, JSON.stringify(f.got), 'want', JSON.stringify(f.want));
      } catch (err) {
        log('selftest crashed:', err.message);
      }
      app.isQuitting = true;
      app.quit();
    }, 3000);
  }

  // container/CI smoke test hook: SHOT=1 → screenshot then exit
  if (process.env.SHOT) {
    setTimeout(async () => {
      try {
        const img = await win.webContents.capturePage();
        fs.writeFileSync('/tmp/shot.png', img.toPNG());
        console.log('[shot] saved /tmp/shot.png');
      } catch (err) {
        console.error('[shot] failed:', err.message);
      }
      app.exit(0);
    }, 9000);
  }
});

app.on('before-quit', () => { app.isQuitting = true; });
app.on('will-quit', () => {
  try { require('electron').globalShortcut.unregisterAll(); } catch (_) {}
  if (awayTimer) clearInterval(awayTimer);
  if (nightTimer) clearInterval(nightTimer);
});

app.on('window-all-closed', () => {
  // tray keeps us alive only if close-to-tray hid the window instead;
  // if the window is truly gone, quit.
  app.quit();
});
