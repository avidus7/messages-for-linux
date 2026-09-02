// settings.js — tiny persistent settings store (JSON file in userData)
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  // window / behavior
  closeToTray: true,
  startMinimized: false,
  launchAtLogin: false,
  alwaysOnTop: false,
  autoHideMenuBar: false,
  zoomLevel: 0,               // Electron zoom level (0 = 100%)
  theme: 'system',            // 'system' | 'light' | 'dark'
  windowBounds: null,         // {x,y,width,height}

  // notifications
  notificationsEnabled: true,
  notificationPrivacy: false, // true = hide message text ("New message")
  notificationSound: true,
  muteUntil: 0,               // 0 = not muted, -1 = muted until re-enabled, else epoch ms
  showUnreadBadge: true,

  // engine
  spellCheck: true,
  spellCheckLanguage: 'en-CA',
  disableHardwareAcceleration: false,

  // v1.0.0 features
  appIcon: 'green',        // green | amber | chrome | blocks | synthwave | plasma
  quietHours: 'off',       // 'off' | '22-7' | '23-8' | '0-9'
  summonHotkey: true,      // master on/off for the summon hotkey

  // v1.1 features
  summonAccel: 'Control+Alt+M',  // #91 which key summons the window
  panicAccel: 'Control+Alt+H',   // #41 panic hide key ('off' to disable)
  windowOpacity: 100,            // #85 Ghost Mode, 40-100 (%)
  badgeStyle: 'count',           // #36 'dot' | 'count' — tray unread indicator
  awayMode: false,               // #28 manual away toggle
  awayQuiets: true,              // #28 away also silences notifications
  autoAwayMinutes: 0,            // #29 0 = off, else idle minutes before auto-away
  nightShift: 'off',             // #17 'off' | '19-7' | '20-8' | '21-6'
  nightShiftIcon: 'amber',       // #17 which icon to wear after dark
  appLock: false,                // #43 require a PIN to reveal the window
  appLockSalt: '',               // #43 random per-install salt
  appLockHash: '',               // #43 sha256(salt + PIN) — the PIN itself is never stored
  uin: '',                       // #27 ICQ-style install number, minted once

  // v1.1 batch two — sound & soul
  soundPack: 'classic-blip',     // #1 which sound announces a new message ('off' to silence)
  soundVolume: 70,               // #4 0-100, independent of system volume
  nudgeOnMessage: false,         // #9 MSN-homage window shake on a new message
  ambientSound: 'off',           // #76 'off' | 'ambient-modem' | 'ambient-sid' | 'ambient-drive'
  ambientVolume: 25,             // #76 0-100
  camouflage: 'hide',            // #82 panic action: 'hide' | 'terminal' | 'editor' | 'spreadsheet'
  cracktroSeen: false,           // #71 the first-launch intro plays exactly once
  cracktroMusic: true,           // #71 Valium plays with the intro
  cracktroVolume: 60,            // #71 0-100
  cracktroEveryLaunch: false     // #71 replay the intro on every app launch
};

let settingsPath = null;
let cache = null;

function init(userDataDir) {
  settingsPath = path.join(userDataDir, 'settings.json');
  load();
}

function load() {
  cache = { ...DEFAULTS };
  try {
    const raw = fs.readFileSync(settingsPath, 'utf8');
    const parsed = JSON.parse(raw);
    cache = { ...DEFAULTS, ...parsed };
  } catch (err) {
    // First run or unreadable file — defaults are fine.
  }
  return cache;
}

function get() {
  if (!cache) load();
  return cache;
}

function save() {
  if (!settingsPath || !cache) return;
  try {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(cache, null, 2), 'utf8');
  } catch (err) {
    console.error('[settings] save failed:', err.message);
  }
}

function set(key, value) {
  get()[key] = value;
  save();
}

// Pure helper: is the given hour inside a quiet-hours range?
// range: 'off' or 'START-END' in 24h hours, END exclusive; wraps midnight.
// Kept free of any electron imports so it can be tested with plain node.
function quietHoursActive(range, hour) {
  if (!range || range === 'off') return false;
  const parts = String(range).split('-');
  if (parts.length !== 2) return false;
  const start = parseInt(parts[0], 10);
  const end = parseInt(parts[1], 10);
  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;   // e.g. 9-17
  return hour >= start || hour < end;                    // wraps, e.g. 23-8
}

// ---------------------------------------------------------------- v1.1 helpers
// All pure and electron-free on purpose: they carry the fiddly logic, so the
// fiddly logic can be tested with plain node before it ever meets a window.

// #17 Night Shift: which icon should be worn right now?
// Reuses quietHoursActive so the wrap-past-midnight maths is the tested code.
function nightShiftIconFor(range, hour, dayIcon, nightIcon) {
  return quietHoursActive(range, hour) ? nightIcon : dayIcon;
}

// #85 Ghost Mode: clamp to a sane window. Below 40% you can't find the window
// again to fix it, so 40 is the floor no matter what lands in the settings file.
function clampOpacity(v) {
  if (v === null || v === undefined || v === '') return 100; // unset = opaque
  const n = Number(v);
  if (!Number.isFinite(n)) return 100;
  return Math.min(100, Math.max(40, Math.round(n)));
}

// #43 App Lock: salted SHA-256. The PIN is never written to disk in any
// recoverable form — only this digest is stored.
function hashPin(salt, pin) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(String(salt) + String(pin)).digest('hex');
}

function makeSalt() {
  return require('crypto').randomBytes(16).toString('hex');
}

// #27 ICQ-style UIN: nine digits, minted once per install, purely decorative.
function makeUin() {
  const n = require('crypto').randomBytes(4).readUInt32BE(0) % 900000000;
  return String(100000000 + n);
}

module.exports = {
  init, get, set, save, DEFAULTS,
  quietHoursActive, nightShiftIconFor, clampOpacity, hashPin, makeSalt, makeUin
};
