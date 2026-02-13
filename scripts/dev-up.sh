#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
API_BASE_URL_DEFAULT="http://localhost:${BACKEND_PORT}"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required." >&2
  exit 1
fi

if [ ! -d "$BACKEND_DIR/.venv" ]; then
  echo "[setup] backend virtualenv not found. Creating $BACKEND_DIR/.venv ..."
  python3 -m venv "$BACKEND_DIR/.venv"
fi

BACKEND_INSTALL_NEEDED=0
if ! "$BACKEND_DIR/.venv/bin/python" -c "import fastapi, uvicorn" >/dev/null 2>&1; then
  BACKEND_INSTALL_NEEDED=1
fi

if [ "$BACKEND_INSTALL_NEEDED" -eq 1 ]; then
  echo "[setup] backend dependencies missing. Installing ..."
  "$BACKEND_DIR/.venv/bin/pip" install -r "$BACKEND_DIR/requirements.txt"
fi

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  echo "[setup] frontend node_modules not found. Running npm install ..."
  (cd "$FRONTEND_DIR" && npm install)
fi

cleanup() {
  local exit_code=$?
  trap - INT TERM EXIT

  if [ -n "${FRONTEND_PID:-}" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
  if [ -n "${BACKEND_PID:-}" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi

  wait "${FRONTEND_PID:-}" 2>/dev/null || true
  wait "${BACKEND_PID:-}" 2>/dev/null || true

  exit "$exit_code"
}

trap cleanup INT TERM EXIT

echo "[dev-up] Starting backend on :$BACKEND_PORT ..."
(
  cd "$BACKEND_DIR"
  source .venv/bin/activate
  exec uvicorn app.main:app --reload --host 0.0.0.0 --port "$BACKEND_PORT"
) &
BACKEND_PID=$!

echo "[dev-up] Starting frontend on :$FRONTEND_PORT ..."
(
  cd "$FRONTEND_DIR"
  export NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-$API_BASE_URL_DEFAULT}"
  exec npm run dev -- --hostname 0.0.0.0 --port "$FRONTEND_PORT"
) &
FRONTEND_PID=$!

echo "[dev-up] Backend  PID: $BACKEND_PID"
echo "[dev-up] Frontend PID: $FRONTEND_PID"
echo "[dev-up] Press Ctrl+C to stop both services."

wait "$BACKEND_PID" "$FRONTEND_PID"
