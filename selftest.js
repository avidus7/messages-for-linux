// selftest.js — internal verification harness.
//
// Only loaded when the app is started with SELFTEST=1, so it costs a normal
// run nothing. main.js hands it the internals it needs; this file drives them
// and writes a pass/fail report. Better safe than sorry: every feature that
// has real logic behind it gets exercised here before it reaches a user.
'use strict';

const fs = require('fs');

module.exports = function runSelfTest(api) {
  const results = [];
  const check = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    results.push({ name, ok, got, want });
    return ok;
  };

  const { settings, trayIconPath, iconKey, setUnread, hashPin } = api;
  const original = { ...settings.get() };
  const base = (p) => String(p).split('/').pop();

  // ---- #36 tray unread count: which icon file gets chosen? ----
  settings.set('appIcon', 'green');
  settings.set('nightShift', 'off');
  settings.set('showUnreadBadge', true);
  settings.set('badgeStyle', 'count');

  setUnread(0);  check('badge 0 unread → plain icon',    base(trayIconPath()), 'green.png');
  setUnread(1);  check('badge 1 unread → numbered 1',    base(trayIconPath()), 'green-1.png');
  setUnread(7);  check('badge 7 unread → numbered 7',    base(trayIconPath()), 'green-7.png');
  setUnread(9);  check('badge 9 unread → numbered 9',    base(trayIconPath()), 'green-9.png');
  setUnread(10); check('badge 10 unread → 9plus',        base(trayIconPath()), 'green-9plus.png');
  setUnread(99); check('badge 99 unread → 9plus',        base(trayIconPath()), 'green-9plus.png');

  settings.set('badgeStyle', 'dot');
  setUnread(5);  check('dot style → unread dot icon',     base(trayIconPath()), 'green-unread.png');

  settings.set('showUnreadBadge', false);
  check('badge disabled → plain icon even with unread',   base(trayIconPath()), 'green.png');

  // ---- #17 night shift picks a different icon after dark ----
  settings.set('showUnreadBadge', true);
  settings.set('badgeStyle', 'count');
  settings.set('nightShift', '0-23');          // "night" for all but hour 23
  settings.set('nightShiftIcon', 'amber');
  const nightNow = new Date().getHours() !== 23;
  setUnread(3);
  check('night shift swaps the icon family',
        base(trayIconPath()), nightNow ? 'amber-3.png' : 'green-3.png');
  settings.set('nightShift', 'off');
  check('night shift off → day icon returns', iconKey(), 'green');

  // ---- every icon asset the app can ask for actually exists ----
  const missing = [];
  for (const key of ['green', 'amber', 'chrome', 'blocks', 'synthwave', 'plasma']) {
    settings.set('appIcon', key);
    for (const n of [0, 1, 5, 9, 12]) {
      setUnread(n);
      const p = trayIconPath();
      if (!fs.existsSync(p)) missing.push(base(p));
    }
    settings.set('badgeStyle', 'dot'); setUnread(2);
    if (!fs.existsSync(trayIconPath())) missing.push(base(trayIconPath()));
    settings.set('badgeStyle', 'count');
  }
  check('every reachable tray icon exists on disk', missing, []);

  // ---- #85 ghost mode clamp is applied through settings, not raw ----
  check('opacity clamp: 50 stays 50', settings.clampOpacity(50), 50);
  check('opacity clamp: 10 floors to 40', settings.clampOpacity(10), 40);

  // ---- #43 app lock: right PIN opens, wrong PIN does not ----
  const salt = settings.makeSalt();
  const good = hashPin(salt, '2468');
  check('correct PIN verifies',   hashPin(salt, '2468') === good, true);
  check('wrong PIN rejected',     hashPin(salt, '1111') === good, false);
  check('PIN never stored raw',   good.includes('2468'), false);

  // ---- #28 away feeds the mute decision ----
  settings.set('quietHours', 'off');
  settings.set('muteUntil', 0);
  settings.set('awayQuiets', true);
  settings.set('awayMode', true);
  check('away + awayQuiets → muted',      api.isMuted(), true);
  settings.set('awayQuiets', false);
  check('away without awayQuiets → loud', api.isMuted(), false);
  settings.set('awayMode', false);
  check('not away → loud',                api.isMuted(), false);

  // ---- #1/#69/#76 sound engine: every sound the menus can select must
  //      exist, load, and produce a valid WAV data URL ----
  if (api.soundDataUrl && api.SOUND_PACK && api.AMBIENT_PACK) {
    const badSounds = [];
    const all = [...Object.keys(api.SOUND_PACK), ...Object.keys(api.AMBIENT_PACK), 'nudge'];
    for (const name of all) {
      const url = api.soundDataUrl(name);
      if (!url) { badSounds.push(name + ':missing'); continue; }
      if (!url.startsWith('data:audio/wav;base64,')) { badSounds.push(name + ':badprefix'); continue; }
      const b64 = url.slice('data:audio/wav;base64,'.length);
      const buf = Buffer.from(b64, 'base64');
      // a real WAV starts with RIFF....WAVE
      if (buf.slice(0, 4).toString() !== 'RIFF' || buf.slice(8, 12).toString() !== 'WAVE') {
        badSounds.push(name + ':notwav');
      } else if (buf.length < 2000) {
        badSounds.push(name + ':tooshort');
      }
    }
    check('every selectable sound loads as a valid WAV', badSounds, []);
    check('sound count (7 packs + 3 ambient + nudge)', all.length, 11);
  }

  // ---- #9/#1 new-message routing respects mute ----
  if (api.onNewMessagesProbe) {
    settings.set('quietHours', 'off'); settings.set('muteUntil', 0);
    settings.set('awayMode', false); settings.set('notificationsEnabled', true);
    settings.set('soundPack', 'classic-blip'); settings.set('notificationSound', true);
    check('unmuted → sound requested',        api.onNewMessagesProbe(1), true);
    settings.set('muteUntil', -1);
    check('muted → no sound requested',       api.onNewMessagesProbe(1), false);
    settings.set('muteUntil', 0);
    settings.set('notificationsEnabled', false);
    check('notifications off → no sound',     api.onNewMessagesProbe(1), false);
    settings.set('notificationsEnabled', true);
    settings.set('soundPack', 'off');
    check('sound pack off → no sound',        api.onNewMessagesProbe(1), false);
  }

  // ---- restore every setting we touched ----
  for (const [k, v] of Object.entries(original)) settings.set(k, v);
  setUnread(0);

  const failed = results.filter((r) => !r.ok);
  const report = {
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    failures: failed
  };
  try { fs.writeFileSync('/tmp/selftest.json', JSON.stringify(report, null, 2)); } catch (_) {}
  return report;
};
