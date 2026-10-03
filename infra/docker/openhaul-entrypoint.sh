#!/bin/sh
set -eu

shutdown() {
  trap - TERM INT EXIT

  if [ -n "${API_PID:-}" ]; then
    kill "$API_PID" 2>/dev/null || true
  fi

  if [ -n "${WEB_PID:-}" ]; then
    kill "$WEB_PID" 2>/dev/null || true
  fi

  nginx -s quit 2>/dev/null || true
}

trap shutdown TERM INT EXIT

echo "Starting OpenHaul API on :3001..."
API_PORT=3001 node /app/apps/api/dist/index.js &
API_PID=$!

echo "Starting OpenHaul web on :3002..."
PORT=3002 HOSTNAME=127.0.0.1 node /app/server.js &
WEB_PID=$!

echo "Starting OpenHaul gateway on :3000..."
nginx

while true; do
  if ! kill -0 "$API_PID" 2>/dev/null; then
    wait "$API_PID" || true
    echo "OpenHaul API exited; stopping container." >&2
    exit 1
  fi

  if ! kill -0 "$WEB_PID" 2>/dev/null; then
    wait "$WEB_PID" || true
    echo "OpenHaul web exited; stopping container." >&2
    exit 1
  fi

  if ! pgrep nginx >/dev/null 2>&1; then
    echo "OpenHaul gateway exited; stopping container." >&2
    exit 1
  fi

  sleep 2
done
