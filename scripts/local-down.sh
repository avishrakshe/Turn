#!/usr/bin/env bash
# Stops everything started by scripts/local-up.sh.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null
for name in indexer relayer anvil; do
  f="$ROOT/.local/$name.pid"
  if [ -f "$f" ]; then
    pid=$(cat "$f")
    kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
    rm -f "$f"
  fi
done
# Anything still listening on the stack's ports (e.g. the indexer's node process, which npx/setsid can orphan):
# anvil 8545, relayer 8787, Envio indexer 9898.
for port in 8545 8787 9898; do
  for pid in $(ss -ltnpH "sport = :$port" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u); do
    kill "$pid" 2>/dev/null || true
  done
done
(cd "$ROOT/indexer" && npx envio stop >/dev/null 2>&1) || true
echo "local Turn stack stopped"
