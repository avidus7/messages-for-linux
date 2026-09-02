#!/usr/bin/env bash
BIN="/home/avidus/Apps/messages-for-linux/node_modules/electron/dist/electron"
if [ ! -x "$BIN" ]; then
  echo "Electron binary missing — run:  bash /home/avidus/Apps/messages-for-linux/install.sh"
  exit 1
fi
cd "/home/avidus/Apps/messages-for-linux"
exec "$BIN" "/home/avidus/Apps/messages-for-linux" "$@"
