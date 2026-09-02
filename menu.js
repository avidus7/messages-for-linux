// menu.js — builds the application menu from the approved design.
// All state comes from settings.js; all side effects go through ctx.actions.
'use strict';

const { Menu } = require('electron');
const settings = require('./settings');

function buildMenu(ctx) {
  const s = settings.get();
  const a = ctx.actions;

  const template = [
    {
      label: '&File',
      submenu: [
        { label: 'New Conversation', accelerator: 'CmdOrCtrl+N', click: () => a.newConversation() },
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => a.reload() },
        { type: 'separator' },
        { label: 'Minimize to Tray', accelerator: 'CmdOrCtrl+H', click: () => a.hideToTray() },
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => a.quit() }
      ]
    },
    {
      label: '&Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Find in Page', accelerator: 'CmdOrCtrl+F', click: () => a.openFindBar() }
      ]
    },
    {
      label: '&View',
      submenu: [
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: () => a.zoom(+0.5) },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => a.zoom(-0.5) },
        { label: 'Reset Zoom', accelerator: 'CmdOrCtrl+0', click: () => a.zoomReset() },
        { type: 'separator' },
        { label: 'Full Screen', accelerator: 'F11', click: () => a.toggleFullScreen() },
        {
          label: 'Ghost Mode (window opacity)',
          submenu: [100, 95, 90, 85, 80, 70, 60, 50].map((v) => ({
            label: v === 100 ? 'Solid (100%)' : v + '%',
            type: 'radio', checked: (s.windowOpacity || 100) === v,
            click: () => a.setOpacity(v)
          }))
        },
        { label: 'Pop Out This Conversation', accelerator: 'CmdOrCtrl+Shift+O', click: () => a.popOutConversation() },
        {
          label: 'Always on Top', type: 'checkbox', checked: s.alwaysOnTop,
          click: (mi) => a.setAlwaysOnTop(mi.checked)
        },
        {
          label: 'Hide Menu Bar (press Alt to show)', type: 'checkbox', checked: s.autoHideMenuBar,
          click: (mi) => a.setAutoHideMenuBar(mi.checked)
        },
        { type: 'separator' },
        {
          label: 'Theme',
          submenu: [
            { label: 'Match System', type: 'radio', checked: s.theme === 'system', click: () => a.setTheme('system') },
            { label: 'Light', type: 'radio', checked: s.theme === 'light', click: () => a.setTheme('light') },
            { label: 'Dark', type: 'radio', checked: s.theme === 'dark', click: () => a.setTheme('dark') }
          ]
        }
      ]
    },
    {
      label: '&Settings',
      submenu: [
        {
          label: 'Launch at Login', type: 'checkbox', checked: s.launchAtLogin,
          click: (mi) => a.setLaunchAtLogin(mi.checked)
        },
        {
          label: 'Start Minimized to Tray', type: 'checkbox', checked: s.startMinimized,
          click: (mi) => { settings.set('startMinimized', mi.checked); }
        },
        {
          label: 'Close Button Minimizes to Tray', type: 'checkbox', checked: s.closeToTray,
          click: (mi) => { settings.set('closeToTray', mi.checked); }
        },
        { type: 'separator' },
        {
          label: 'Desktop Notifications', type: 'checkbox', checked: s.notificationsEnabled,
          click: (mi) => { settings.set('notificationsEnabled', mi.checked); a.refreshTray(); }
        },
        // PARKED (v1.0.3): "Hide Message Text in Notifications" and
        // "Notification Sound" are removed for now — both depended on the
        // preload Notification bridge, which required breaking context
        // isolation, which is what black-screened the app. Re-add only
        // with an isolation-safe design (see notes in main.js).
        {
          label: 'Mute',
          submenu: [
            { label: 'Mute for 1 Hour', click: () => a.mute(Date.now() + 60 * 60 * 1000) },
            { label: 'Mute Until Turned Back On', click: () => a.mute(-1) },
            { label: 'Unmute', click: () => a.mute(0) }
          ]
        },
        {
          label: 'Notification Sound',
          submenu: [
            { label: 'Off (silent)', type: 'radio', checked: s.soundPack === 'off', click: () => a.setSoundPack('off') },
            { type: 'separator' },
            { label: 'Classic Blip', type: 'radio', checked: s.soundPack === 'classic-blip', click: () => a.setSoundPack('classic-blip') },
            { label: 'SID Arpeggio (C64)', type: 'radio', checked: s.soundPack === 'sid-arp', click: () => a.setSoundPack('sid-arp') },
            { label: 'Amiga Drive Tick', type: 'radio', checked: s.soundPack === 'amiga-disk', click: () => a.setSoundPack('amiga-disk') },
            { label: 'Modem Chirp', type: 'radio', checked: s.soundPack === 'modem-chirp', click: () => a.setSoundPack('modem-chirp') },
            { label: 'Pager', type: 'radio', checked: s.soundPack === 'pager', click: () => a.setSoundPack('pager') },
            { label: 'Soft Chime', type: 'radio', checked: s.soundPack === 'soft-chime', click: () => a.setSoundPack('soft-chime') },
            { label: 'Tracker Kick', type: 'radio', checked: s.soundPack === 'tracker-kick', click: () => a.setSoundPack('tracker-kick') },
            { type: 'separator' },
            {
              label: 'Volume',
              submenu: [100, 90, 80, 70, 60, 50, 40, 30, 20, 10].map((v) => ({
                label: v + '%', type: 'radio', checked: (s.soundVolume ?? 70) === v,
                click: () => a.setSoundVolume(v)
              }))
            },
            { label: 'Test Sound', click: () => a.testNotificationSound() },
            { type: 'separator' },
            { label: 'Nudge (shake window) on new message', type: 'checkbox', checked: s.nudgeOnMessage, click: (mi) => a.setNudgeOnMessage(mi.checked) }
          ]
        },
        {
          label: 'Ambient Soundscape',
          submenu: [
            { label: 'Off', type: 'radio', checked: s.ambientSound === 'off', click: () => a.setAmbientSound('off') },
            { label: 'Modem Hiss', type: 'radio', checked: s.ambientSound === 'ambient-modem', click: () => a.setAmbientSound('ambient-modem') },
            { label: 'SID Hum', type: 'radio', checked: s.ambientSound === 'ambient-sid', click: () => a.setAmbientSound('ambient-sid') },
            { label: 'Drive Tick', type: 'radio', checked: s.ambientSound === 'ambient-drive', click: () => a.setAmbientSound('ambient-drive') },
            { type: 'separator' },
            {
              label: 'Ambient Volume',
              submenu: [50, 40, 30, 25, 20, 15, 10, 5].map((v) => ({
                label: v + '%', type: 'radio', checked: (s.ambientVolume ?? 25) === v,
                click: () => a.setAmbientVolume(v)
              }))
            }
          ]
        },
        {
          label: 'Tray Badge Style',
          submenu: [
            { label: 'Unread Count (number)', type: 'radio', checked: s.badgeStyle === 'count', click: () => a.setBadgeStyle('count') },
            { label: 'Simple Dot', type: 'radio', checked: s.badgeStyle === 'dot', click: () => a.setBadgeStyle('dot') }
          ]
        },
        {
          label: 'Away',
          submenu: [
            { label: 'Away Now', type: 'checkbox', checked: s.awayMode, click: (mi) => a.setAwayMode(mi.checked) },
            { label: 'Away Also Silences Notifications', type: 'checkbox', checked: s.awayQuiets, click: (mi) => a.setAwayQuiets(mi.checked) },
            { type: 'separator' },
            { label: 'Auto-Away: Off', type: 'radio', checked: !s.autoAwayMinutes, click: () => a.setAutoAwayMinutes(0) },
            { label: 'Auto-Away after 5 min', type: 'radio', checked: s.autoAwayMinutes === 5, click: () => a.setAutoAwayMinutes(5) },
            { label: 'Auto-Away after 10 min', type: 'radio', checked: s.autoAwayMinutes === 10, click: () => a.setAutoAwayMinutes(10) },
            { label: 'Auto-Away after 30 min', type: 'radio', checked: s.autoAwayMinutes === 30, click: () => a.setAutoAwayMinutes(30) }
          ]
        },
        {
          label: 'Unread Badge on Tray Icon', type: 'checkbox', checked: s.showUnreadBadge,
          click: (mi) => { settings.set('showUnreadBadge', mi.checked); a.refreshBadge(); }
        },
        { type: 'separator' },
        {
          label: 'Spell Check', type: 'checkbox', checked: s.spellCheck,
          click: (mi) => a.setSpellCheck(mi.checked)
        },
        {
          label: 'Spell Check Language',
          submenu: [
            ['en-CA', 'English (Canada)'], ['en-US', 'English (US)'], ['en-GB', 'English (UK)'],
            ['fr', 'French'], ['es', 'Spanish'], ['de', 'German'],
            ['nl', 'Dutch'], ['it', 'Italian'], ['pt-BR', 'Portuguese (Brazil)']
          ].map(([code, label]) => ({
            label, type: 'radio', checked: s.spellCheckLanguage === code,
            click: () => a.setSpellCheckLanguage(code)
          }))
        },
        {
          label: 'Hardware Acceleration (restart required)', type: 'checkbox', checked: !s.disableHardwareAcceleration,
          click: (mi) => a.setHardwareAcceleration(mi.checked)
        },
        { type: 'separator' },
        {
          label: 'App Icon',
          submenu: [
            { label: 'Phosphor Green', type: 'radio', checked: s.appIcon === 'green', click: () => a.setAppIcon('green') },
            { label: 'Phosphor Amber', type: 'radio', checked: s.appIcon === 'amber', click: () => a.setAppIcon('amber') },
            { label: 'Amiga Chrome', type: 'radio', checked: s.appIcon === 'chrome', click: () => a.setAppIcon('chrome') },
            { label: 'BBS Blocks', type: 'radio', checked: s.appIcon === 'blocks', click: () => a.setAppIcon('blocks') },
            { label: 'Synthwave Grid', type: 'radio', checked: s.appIcon === 'synthwave', click: () => a.setAppIcon('synthwave') },
            { label: 'Plasma FX', type: 'radio', checked: s.appIcon === 'plasma', click: () => a.setAppIcon('plasma') }
          ]
        },
        {
          label: 'Night Shift (icon changes after dark)',
          submenu: [
            { label: 'Off', type: 'radio', checked: s.nightShift === 'off', click: () => a.setNightShift('off') },
            { label: '7 PM - 7 AM', type: 'radio', checked: s.nightShift === '19-7', click: () => a.setNightShift('19-7') },
            { label: '8 PM - 8 AM', type: 'radio', checked: s.nightShift === '20-8', click: () => a.setNightShift('20-8') },
            { label: '9 PM - 6 AM', type: 'radio', checked: s.nightShift === '21-6', click: () => a.setNightShift('21-6') },
            { type: 'separator' },
            { label: 'Night icon: Phosphor Amber', type: 'radio', checked: s.nightShiftIcon === 'amber', click: () => a.setNightShiftIcon('amber') },
            { label: 'Night icon: Phosphor Green', type: 'radio', checked: s.nightShiftIcon === 'green', click: () => a.setNightShiftIcon('green') },
            { label: 'Night icon: Plasma FX', type: 'radio', checked: s.nightShiftIcon === 'plasma', click: () => a.setNightShiftIcon('plasma') }
          ]
        },
        {
          label: 'Quiet Hours',
          submenu: [
            { label: 'Off', type: 'radio', checked: s.quietHours === 'off', click: () => a.setQuietHours('off') },
            { label: '10 PM – 7 AM', type: 'radio', checked: s.quietHours === '22-7', click: () => a.setQuietHours('22-7') },
            { label: '11 PM – 8 AM', type: 'radio', checked: s.quietHours === '23-8', click: () => a.setQuietHours('23-8') },
            { label: 'Midnight – 9 AM', type: 'radio', checked: s.quietHours === '0-9', click: () => a.setQuietHours('0-9') }
          ]
        },
        {
          label: 'Hotkeys',
          submenu: [
            { label: 'Summon Hotkey Enabled', type: 'checkbox', checked: s.summonHotkey, click: (mi) => a.setSummonHotkey(mi.checked) },
            { type: 'separator' },
            { label: 'Summon: Ctrl+Alt+M', type: 'radio', checked: s.summonAccel === 'Control+Alt+M', click: () => a.setSummonAccel('Control+Alt+M') },
            { label: 'Summon: Ctrl+Shift+M', type: 'radio', checked: s.summonAccel === 'Control+Shift+M', click: () => a.setSummonAccel('Control+Shift+M') },
            { label: 'Summon: Super+M', type: 'radio', checked: s.summonAccel === 'Super+M', click: () => a.setSummonAccel('Super+M') },
            { label: 'Summon: F9', type: 'radio', checked: s.summonAccel === 'F9', click: () => a.setSummonAccel('F9') },
            { type: 'separator' },
            { label: 'Panic Hide: Off', type: 'radio', checked: s.panicAccel === 'off', click: () => a.setPanicAccel('off') },
            { label: 'Panic Hide: Ctrl+Alt+H', type: 'radio', checked: s.panicAccel === 'Control+Alt+H', click: () => a.setPanicAccel('Control+Alt+H') },
            { label: 'Panic Hide: Ctrl+Shift+H', type: 'radio', checked: s.panicAccel === 'Control+Shift+H', click: () => a.setPanicAccel('Control+Shift+H') },
            { label: 'Panic Hide: Pause', type: 'radio', checked: s.panicAccel === 'Pause', click: () => a.setPanicAccel('Pause') },
            { label: 'Panic Hide: F10', type: 'radio', checked: s.panicAccel === 'F10', click: () => a.setPanicAccel('F10') }
          ]
        },
        {
          label: 'Panic Hide Shows',
          submenu: [
            { label: 'Just Hide', type: 'radio', checked: s.camouflage === 'hide', click: () => a.setCamouflage('hide') },
            { label: 'Fake Terminal', type: 'radio', checked: s.camouflage === 'terminal', click: () => a.setCamouflage('terminal') },
            { label: 'Fake Code Editor', type: 'radio', checked: s.camouflage === 'editor', click: () => a.setCamouflage('editor') },
            { label: 'Fake Spreadsheet', type: 'radio', checked: s.camouflage === 'spreadsheet', click: () => a.setCamouflage('spreadsheet') }
          ]
        },
        {
          label: 'App Lock (PIN)',
          submenu: [
            { label: s.appLockHash ? 'Change PIN…' : 'Set a PIN…', click: () => a.setPin() },
            { label: 'Lock Now', enabled: !!(s.appLock && s.appLockHash), click: () => a.lockNow() },
            { label: 'Turn Off App Lock', enabled: !!s.appLockHash, click: () => a.disableAppLock() }
          ]
        },
        { type: 'separator' },
        { label: 'Export Settings…', click: () => a.exportSettings() },
        { label: 'Import Settings…', click: () => a.importSettings() },
        { type: 'separator' },
        { label: 'Edit Custom CSS…', click: () => a.editCustomCss() },
        { label: 'Reload Custom CSS', click: () => a.reloadCustomCss() },
        { type: 'separator' },
        { label: 'Google Messages Settings…', click: () => a.openMessagesSettings() },
        { label: 'Clear Cache', click: () => a.clearCache() },
        { label: 'Sign Out && Unpair…', click: () => a.signOut() }
      ]
    },
    {
      label: '&Help',
      submenu: [
        { label: 'Keyboard Shortcuts', click: () => a.showShortcuts() },
        { label: 'Google Messages Help', click: () => a.openHelp() },
        { label: 'Check for Updates…', click: () => a.checkForUpdates() },
        { label: 'Play Intro Again', click: () => a.showCracktro() },
        { label: 'Play Intro on Every Launch', type: 'checkbox', checked: s.cracktroEveryLaunch,
          click: (mi) => a.setCracktroEveryLaunch(mi.checked) },
        { type: 'separator' },
        { label: 'Toggle DevTools', accelerator: 'F12', click: () => a.toggleDevTools() },
        { label: 'Toggle DevTools (alt)', accelerator: 'CmdOrCtrl+Shift+I', visible: false, acceleratorWorksWhenHidden: true, click: () => a.toggleDevTools() },
        { type: 'separator' },
        { label: 'About Messages for Linux', click: () => a.showAbout() }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  return menu;
}

module.exports = { buildMenu };
