#!/usr/bin/env bash
# Runs the whole Turn backend locally:
#   anvil (Prague / EIP-7702) :8545 -> deploy contracts -> relayer :8787 -> seed a demo circle -> Envio indexer + GraphQL.
# Stop everything with scripts/local-down.sh. Logs go to .local/*.log.
# Uses anvil's well-known public test keys only (never real funds).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh" >/dev/null
export PATH="$HOME/.foundry/bin:$PATH"
mkdir -p "$ROOT/.local"
LOG="$ROOT/.local"
RPC=http://127.0.0.1:8545
DEPLOYER_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   # anvil #0 (public test key)
RELAYER_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d    # anvil #1 (public test key)

"$ROOT/scripts/local-down.sh" >/dev/null 2>&1 || true

echo "1/5 starting anvil (chain 31337, Prague, 1s blocks)"
setsid nohup anvil --port 8545 --hardfork prague --block-time 1 >"$LOG/anvil.log" 2>&1 &
echo $! >"$LOG/anvil.pid"
for _ in $(seq 50); do cast chain-id --rpc-url $RPC >/dev/null 2>&1 && break; sleep 0.2; done

echo "2/5 deploying contracts"
(cd "$ROOT/contracts" && DEPLOYER_PRIVATE_KEY=$DEPLOYER_KEY forge script script/Deploy.s.sol --rpc-url $RPC --broadcast >"$LOG/deploy.log" 2>&1)
DEP="$ROOT/contracts/deployments/31337.json"
j() { node -e "console.log(require('$DEP')['$1'])"; }
FACTORY=$(j factory); REGISTRY=$(j registry)

echo "3/5 starting relayer on :8787"
(cd "$ROOT/relayer" && RELAYER_PRIVATE_KEY=$RELAYER_KEY RPC_URL=$RPC CHAIN_ID=31337 \
  setsid nohup npx tsx src/index.ts >"$LOG/relayer.log" 2>&1 & echo $! >"$LOG/relayer.pid")
for _ in $(seq 50); do curl -sf http://127.0.0.1:8787/health >/dev/null && break; sleep 0.3; done

echo "4/5 seeding a demo circle through the relayer (gasless, EIP-7702)"
(cd "$ROOT/relayer" && RELAYER_PRIVATE_KEY=$RELAYER_KEY RPC_URL=$RPC CHAIN_ID=31337 \
  npx tsx scripts/verify-7702.ts | tee "$LOG/seed.log")

echo "5/5 starting Envio indexer (Docker: Postgres + Hasura); -r resets data, since the local chain is fresh each time"
(cd "$ROOT/indexer" && ENVIO_FACTORY_ADDRESS=$FACTORY ENVIO_REGISTRY_ADDRESS=$REGISTRY ENVIO_TUI=false \
  setsid nohup npx envio dev -r --config config.local.yaml >"$LOG/indexer.log" 2>&1 & echo $! >"$LOG/indexer.pid")

cat <<EOF

Turn backend is starting locally:
  Chain RPC        $RPC   (chain 31337)
  Relayer          http://localhost:8787/health
  Factory          $FACTORY
  Indexer logs     $LOG/indexer.log
EOF
