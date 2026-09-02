#!/usr/bin/env bash
BIN="/home/claude/avid-messages/node_modules/electron/dist/electron"
if [ ! -x "$BIN" ]; then
  echo "Electron binary missing — run:  bash /home/claude/avid-messages/install.sh"
  exit 1
fi
cd "/home/claude/avid-messages"
exec "$BIN" "/home/claude/avid-messages" "$@"
