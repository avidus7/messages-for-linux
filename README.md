# Messages for Linux

An unofficial [Google Messages](https://messages.google.com) desktop app for
Linux and Windows, by **avidusSoftware**. Created by **avid & calix**.

Send and receive your Android texts (SMS/RCS) from a real desktop app —
tray icon, notifications, keyboard shortcuts, and a menu bar that treats
messaging like it belongs on your computer.

> Not affiliated with, endorsed by, or sponsored by Google.
> Google and Google Messages are trademarks of Google LLC.

## Features

- Persistent sign-in — pair once, stays paired across launches and reboots
- System tray with unread indicator; close-to-tray; start minimized
- Native desktop notifications with Mute and scheduled **Quiet Hours**
- **Global summon hotkey** — `Ctrl+Alt+M` brings Messages up from anywhere
- **Six selectable app icons** — phosphor green, phosphor amber, Amiga
  chrome, BBS blocks, synthwave grid, plasma FX (Settings → App Icon)
- **Custom CSS** — restyle the Messages page however you like
  (Settings → Edit Custom CSS…)
- **Unread count on the tray icon** — the actual number, not just a dot
- **Away mode** with optional auto-away after you've been idle
- **Night Shift** — the app icon changes after dark
- **Ghost Mode** — set the window's opacity
- **Panic hide** — a global key that makes the window vanish instantly
- **App Lock** — a PIN pad guards the window
- **Pop-out conversations** into their own windows (Ctrl+Shift+O)
- **Configurable hotkeys** for summon and panic hide
- **Settings export/import** — back everything up to a file
- **Spell-check language picker**
- **Original notification sounds** — Classic Blip, SID Arpeggio, Amiga Drive
  Tick, Modem Chirp, Pager, Soft Chime, Tracker Kick — with a volume control
- **MSN-homage nudge** — the window shakes when a message arrives
- **Ambient soundscape** — modem hiss, SID hum or drive tick while you work
- **Panic hide can wear a disguise** — a fake terminal, code editor or
  spreadsheet instead of simply vanishing
- **Demoscene cracktro** on first launch, scored with **"Valium" by avid** —
  an original 1990s drum & bass track written in OctaMED on the Amiga. The
  visuals react to the music live: copper bars glow with the bassline, the
  logo kicks with the drums. Music toggle, volume, and fullscreen on-screen;
  Space toggles music, F is fullscreen, Esc exits. Help → Play Intro Again,
  or tick "Play Intro on Every Launch" if you're one of us.
- **Add your own scroller greetz**: create `cracktro.txt` in
  `~/.config/messages-for-linux/` — one line per message, `#` for comments.
  Your text scrolls first; the built-in scroller always follows.
- Zoom with memory, full screen, always-on-top, find-in-page
- Spell check (English/Canada by default) with right-click corrections
- Launch at login, on Linux and Windows
- Auto-updates (AppImage and Windows installer)

## Install

### AppImage (any Linux distro)

Download the latest `Messages-for-Linux-*.AppImage` from
[Releases](https://github.com/avidus7/messages-for-linux/releases), then:

```
chmod +x Messages-for-Linux-*.AppImage
./Messages-for-Linux-*.AppImage
```

### Debian / Ubuntu / Mint (.deb)

```
sudo apt install ./messages-for-linux_*_amd64.deb
```

### Windows

Download and run `Messages-for-Linux-Setup-*.exe` from Releases.

### First run

On your phone: **Messages → profile picture → Device pairing**, then follow
the sign-in or QR pairing flow shown in the app.

## Custom CSS

Settings → **Edit Custom CSS…** creates and opens `custom.css` in the
config folder. Anything you put there is injected as styling on every page
load. It can't break the app — delete the file (or empty it) and hit
Settings → Reload Custom CSS to undo everything.

```css
/* green phosphor everything */
body { filter: sepia(1) hue-rotate(60deg) saturate(1.6); }
```

## Where things live

- Config & session: `~/.config/messages-for-linux/` (Linux),
  `%APPDATA%\messages-for-linux\` (Windows)
- Debug log: `debug.log` in the config folder
- Custom styling: `custom.css` in the config folder

Sign out and wipe the session any time: **Settings → Sign Out & Unpair**.

## Build from source

Requires Node 20+.

```
npm install
npm start
```

Distributable packages (output in `dist/`):

```
bash build-packages.sh            # AppImage + .deb
bash build-packages.sh windows    # Windows installer (best on Windows/CI)
```

## Releasing (maintainers)

Tag a version and push — GitHub Actions builds Linux and Windows packages
and attaches them to a Release, including the auto-update feed files:

```
git tag v1.0.0
git push origin v1.0.0
```

## Credits

Designed and built by **avid & calix** — avidusSoftware.

> "Whatever you do, work at it with all your heart, as working for the
> Lord." — Colossians 3:23

## License

[MIT](LICENSE). The license covers this project's own code only — not
Google's service or trademarks.
