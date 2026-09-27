#!/usr/bin/env bash
# Deploy Turn to Monad. Usage: ./script/deploy.sh [testnet|mainnet]
# Reads ../.env (DEPLOYER_PRIVATE_KEY, optional AUSD_ADDRESS/OWNER/CRE_FORWARDER). Writes deployments/<chainId>.json,
# re-exports ABIs, then verifies sources on MonadVision (Sourcify, no API key; docs.monad.xyz/guides/verify-smart-contract/foundry).
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; [ -f ../.env ] && . ../.env; set +a

case "${1:-testnet}" in
  testnet) RPC=https://testnet-rpc.monad.xyz; CHAIN=10143 ;;
  mainnet) RPC=https://rpc.monad.xyz; CHAIN=143
           : "${AUSD_ADDRESS:?set AUSD_ADDRESS=0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a for mainnet}" ;;
  *) echo "usage: $0 [testnet|mainnet]"; exit 1 ;;
esac

forge script script/Deploy.s.sol --rpc-url "$RPC" --broadcast --slow
node scripts/export-abis.mjs
DEP="deployments/$CHAIN.json"
cat "$DEP"

verify() { # address contract [constructor-args]
  forge verify-contract "$1" "$2" --chain "$CHAIN" --verifier sourcify \
    --verifier-url https://sourcify-api-monad.blockvision.org/ ${3:+--constructor-args "$3"} \
    || echo "WARN: verification of $2 failed (deployment is unaffected)"
}
j() { python3 -c "import json;print(json.load(open('$DEP'))['$1'])"; }

verify "$(j circleImplementation)" src/Circle.sol:Circle
verify "$(j factory)" src/CircleFactory.sol:CircleFactory \
  "$(cast abi-encode 'c(address,address,address,uint128,uint8)' "$(j token)" "$(j circleImplementation)" "$(j owner)" \
     "$(cast call "$(j factory)" 'maxContribution()(uint128)' --rpc-url "$RPC" | awk '{print $1}')" \
     "$(cast call "$(j factory)" 'maxMembers()(uint8)' --rpc-url "$RPC" | awk '{print $1}')")"
verify "$(j registry)" src/CreditRegistry.sol:CreditRegistry "$(cast abi-encode 'c(address)' "$(j factory)")"
verify "$(j accountImplementation)" src/TurnAccount.sol:TurnAccount "$(cast abi-encode 'c(address,address)' "$(j token)" "$(j factory)")"
verify "$(j keeper)" src/TurnKeeper.sol:TurnKeeper "$(cast abi-encode 'c(address,address,address)' "$(j factory)" "$(j creForwarder)" "$(j owner)")"
if [ "$(j mockToken)" = "True" ]; then verify "$(j token)" src/test-tokens/MockAUSD.sol:MockAUSD; fi
