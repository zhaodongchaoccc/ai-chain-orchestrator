#!/usr/bin/env bash

set -euo pipefail

RUNTIME_PID_FILE="${FF_CONSOLE_RUNTIME_PID_FILE:?FF_CONSOLE_RUNTIME_PID_FILE is required}"
SERVICE_NAME="${FF_CONSOLE_SERVICE_NAME:-Console service}"
RESTART_DELAY="${FF_CONSOLE_RESTART_DELAY:-1}"

mkdir -p "$(dirname "$RUNTIME_PID_FILE")"

child_pid=""
stopping=0

cleanup() {
  rm -f "$RUNTIME_PID_FILE"
}

forward_stop() {
  stopping=1
  if [[ -n "$child_pid" ]] && kill -0 "$child_pid" 2>/dev/null; then
    kill "$child_pid" 2>/dev/null || true
    wait "$child_pid" 2>/dev/null || true
  fi
  cleanup
  exit 0
}

trap forward_stop INT TERM
trap cleanup EXIT

while true; do
  "$@" &
  child_pid="$!"
  printf '%s\n' "$child_pid" > "$RUNTIME_PID_FILE"

  set +e
  wait "$child_pid"
  exit_code="$?"
  set -e

  child_pid=""
  cleanup

  if [[ "$stopping" -eq 1 ]]; then
    exit 0
  fi

  printf '[%s] %s exited with code %s, restarting in %ss\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$SERVICE_NAME" "$exit_code" "$RESTART_DELAY"
  sleep "$RESTART_DELAY"
done
