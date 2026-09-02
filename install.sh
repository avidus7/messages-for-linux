#!/usr/bin/env bash
# install.sh — Messages for Linux installer (avidusSoftware)
#
# Fully self-contained: npm's own Electron downloader silently fails on
# this machine, so we fetch the Electron binary ourselves with curl —
# the exact procedure that was proven to work here on Aug 28.
# Safe to re-run any time.
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "==> Messages for Linux installer"
echo "    Location: $DIR"
echo ""

# ---------- preflight: everything this script needs ----------
MISSING=""
command -v node  >/dev/null 2>&1 || MISSING="$MISSING node"
command -v npm   >/dev/null 2>&1 || MISSING="$MISSING npm"
command -v curl  >/dev/null 2>&1 || MISSING="$MISSING curl"
command -v unzip >/dev/null 2>&1 || MISSING="$MISSING unzip"
if [ -n "$MISSING" ]; then
  echo "!! Missing required tools:$MISSING"
  echo "   Install them with:  sudo apt-get install -y nodejs npm curl unzip"
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "!! Node $(node -v) is too old (need 20+)."
  echo "   You installed Node 22 via NodeSource on Aug 28 — if this trips,"
  echo "   something reverted it. Tell Calix before going further."
  exit 1
fi
echo "==> Preflight OK: node $(node -v), npm $(npm -v), curl, unzip"

# ---------- npm packages (JS only — binary handled below) ----------
echo "==> Installing npm packages (Electron binary download skipped on purpose)…"
export ELECTRON_SKIP_BINARY_DOWNLOAD=1
npm install

# ---------- Electron binary, fetched deterministically ----------
EVER="$(node -p "const p=require('$DIR/package.json'); (p.devDependencies&&p.devDependencies.electron)||(p.dependencies&&p.dependencies.electron)")"
BIN="$DIR/node_modules/electron/dist/electron"
if [ ! -x "$BIN" ]; then
  ZIPURL="https://github.com/electron/electron/releases/download/v${EVER}/electron-v${EVER}-linux-x64.zip"
  ZIPTMP="/tmp/electron-v${EVER}.zip"
  echo "==> Downloading Electron v${EVER} (~116 MB, one time)…"
  curl -L --fail --progress-bar "$ZIPURL" -o "$ZIPTMP"
  echo "==> Unpacking…"
  rm -rf "$DIR/node_modules/electron/dist"
  mkdir -p "$DIR/node_modules/electron/dist"
  unzip -q -o "$ZIPTMP" -d "$DIR/node_modules/electron/dist"
  chmod +x "$BIN" "$DIR/node_modules/electron/dist/chrome_crashpad_handler" 2>/dev/null || true
  rm -f "$ZIPTMP"
else
  echo "==> Electron binary already in place — keeping it."
fi
# path.txt is what postinstall would normally write; the electron JS wrapper
# and node_modules/.bin/electron need it to find the binary.
echo "electron" > "$DIR/node_modules/electron/path.txt"

echo "==> Verifying binary:"
VERIFY_FLAGS=""
[ "$(id -u)" = "0" ] && VERIFY_FLAGS="--no-sandbox"   # root (e.g. containers) needs this; normal users don't
"$BIN" --version $VERIFY_FLAGS

# ---------- launcher ----------
# clean up entries from the pre-1.0.0 name
rm -f "$HOME/.local/share/applications/avid-messages.desktop" "$HOME/Desktop/avid-messages.desktop" "$HOME/.config/autostart/avid-messages.desktop" 2>/dev/null || true

cat > "$DIR/messages-for-linux.sh" << LAUNCHER
#!/usr/bin/env bash
BIN="$DIR/node_modules/electron/dist/electron"
if [ ! -x "\$BIN" ]; then
  echo "Electron binary missing — run:  bash $DIR/install.sh"
  exit 1
fi
cd "$DIR"
exec "\$BIN" "$DIR" "\$@"
LAUNCHER
chmod +x "$DIR/messages-for-linux.sh"

# ---------- start menu entry ----------
APPS_DIR="$HOME/.local/share/applications"
mkdir -p "$APPS_DIR"
DESKTOP_FILE="$APPS_DIR/messages-for-linux.desktop"
cat > "$DESKTOP_FILE" << ENTRY
[Desktop Entry]
Type=Application
Name=Messages for Linux
GenericName=Google Messages
Comment=Send and receive texts from your Android phone
Exec=$DIR/messages-for-linux.sh
Icon=$DIR/assets/icon.png
Terminal=false
Categories=Network;Chat;InstantMessaging;
Keywords=SMS;RCS;Messages;Text;Android;
StartupWMClass=messages for linux
ENTRY
chmod +x "$DESKTOP_FILE"
update-desktop-database "$APPS_DIR" 2>/dev/null || true

# ---------- desktop shortcut ----------
if [ -d "$HOME/Desktop" ]; then
  cp "$DESKTOP_FILE" "$HOME/Desktop/messages-for-linux.desktop"
  chmod +x "$HOME/Desktop/messages-for-linux.desktop"
  gio set "$HOME/Desktop/messages-for-linux.desktop" metadata::trusted true 2>/dev/null || true
fi

echo ""
echo "==> Done!"
echo "    • Start menu: 'Messages for Linux' (Internet category)"
echo "    • Desktop icon: double-click (Mint may ask you to 'Trust' it once)"
echo "    • Or run:  $DIR/messages-for-linux.sh"
