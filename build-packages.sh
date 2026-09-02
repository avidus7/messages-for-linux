#!/usr/bin/env bash
# build-packages.sh — builds the distributable packages for Messages for Linux
#
#   AppImage : single file, runs on most Linux distros, no install needed
#   .deb     : installs on Mint / Ubuntu / Debian via double-click or apt
#   windows  : NSIS setup .exe (best built on Windows or via the GitHub
#              Actions workflow in .github/workflows/build.yml; the cross-
#              build from Linux is attempted but may need wine)
#
# Output lands in ./dist/
#
# Usage:
#   bash build-packages.sh            # both AppImage and .deb
#   bash build-packages.sh appimage   # AppImage only
#   bash build-packages.sh deb        # .deb only
#   bash build-packages.sh windows    # Windows installer
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

TARGET="${1:-both}"

echo "==> Building Messages for Linux packages (avidusSoftware)"
echo "    Location: $DIR"
echo "    Target:   $TARGET"
echo ""

# ---------- preflight ----------
MISSING=""
command -v node  >/dev/null 2>&1 || MISSING="$MISSING node"
command -v npm   >/dev/null 2>&1 || MISSING="$MISSING npm"
if [ -n "$MISSING" ]; then
  echo "!! Missing required tools:$MISSING"
  echo "   Install with:  sudo apt-get install -y nodejs npm"
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "!! Node $(node -v) is too old (need 20+)."
  exit 1
fi
echo "==> Preflight OK: node $(node -v), npm $(npm -v)"

# ---------- electron-builder ----------
if [ ! -d "$DIR/node_modules/electron-builder" ]; then
  echo "==> Installing electron-builder (one time, ~100 MB of dev tooling)…"
  npm install --save-dev electron-builder
else
  echo "==> electron-builder already installed."
fi

# ---------- build ----------
# electron-builder fetches its own toolchain (app-builder, fpm for .deb) on
# first run. If your network blocks that, the error will name the URL —
# the same manual-curl trick from install.sh applies.
echo ""
echo "==> Building… (first run downloads build tooling; later runs are fast)"
echo ""

case "$TARGET" in
  appimage) npx electron-builder --linux AppImage ;;
  deb)      npx electron-builder --linux deb ;;
  windows)  npx electron-builder --win nsis ;;
  both)     npx electron-builder --linux AppImage deb ;;
  *)        echo "!! Unknown target '$TARGET' (use: appimage, deb, windows, or both)"; exit 1 ;;
esac

echo ""
echo "==> Done! Packages are in:  $DIR/dist/"
ls -lh "$DIR/dist"/*.AppImage "$DIR/dist"/*.deb 2>/dev/null || true
echo ""
echo "    AppImage — make it executable, then run it:"
echo "      chmod +x dist/Messages-for-Linux-*.AppImage"
echo "      ./dist/Messages-for-Linux-*.AppImage"
echo ""
echo "    .deb — install it:"
echo "      sudo apt install ./dist/messages-for-linux_*_amd64.deb"
