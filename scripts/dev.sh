#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-dev}"

cd "$ROOT"

printf '◈ MCOP Framework 2.0 ◈\n'
printf 'Meta-Cognitive Optimization Protocol\n\n'
printf 'Project: %s\n' "$ROOT"
printf 'Node: %s  |  pnpm: %s\n\n' "$(node --version)" "$(pnpm --version)"

case "$MODE" in
  standalone)
    printf 'Building and starting the staged production server on http://127.0.0.1:3000 ...\n'
    pnpm standalone:build
    exec pnpm standalone:start
    ;;
  dev)
    printf 'Starting Turbopack dev server on http://localhost:3000 ...\n'
    exec pnpm dev
    ;;
  *)
    printf 'Usage: %s [dev|standalone]\n' "$0" >&2
    exit 2
    ;;
esac
