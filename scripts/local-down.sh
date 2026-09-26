#!/usr/bin/env bash
# Stops everything started by scripts/local-up.sh.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
for name in indexer relayer anvil; do
  f="$ROOT/.local/$name.pid"
  if [ -f "$f" ]; then
    pid=$(cat "$f")
    kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
    rm -f "$f"
  fi
done
(cd "$ROOT/indexer" && npx envio stop >/dev/null 2>&1) || true
echo "local Turn stack stopped"
