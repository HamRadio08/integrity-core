#!/usr/bin/env bash
# Register the live box as a systemd service that tracks origin/main.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
npm run box -- --install --track-main --prepare-only

UNIT_DIR="${UNIT_DIR:-/etc/systemd/system}"
if [[ ! -w "$UNIT_DIR" ]]; then
  echo "[box] cannot write $UNIT_DIR — copy deploy/integrity-desk.service yourself and systemctl enable --now integrity-desk"
  exit 1
fi

sed "s|/opt/integrity-core|$ROOT|g" "$ROOT/deploy/integrity-desk.service" > "$UNIT_DIR/integrity-desk.service"
sed "s|/opt/integrity-core|$ROOT|g" "$ROOT/deploy/integrity-desk-sync.service" > "$UNIT_DIR/integrity-desk-sync.service"
cp "$ROOT/deploy/integrity-desk-sync.timer" "$UNIT_DIR/integrity-desk-sync.timer"
systemctl daemon-reload
systemctl enable --now integrity-desk.service
systemctl enable --now integrity-desk-sync.timer
echo "[box] systemd enabled. Desk: http://<this-host>:43173/"
