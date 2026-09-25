// Shared by the relayer and the web app: how a TurnAccount batch is encoded and signed.
// Must match TurnAccount.sol: EIP-712 domain ("TurnAccount", "1", chainId, verifyingContract = the user's EOA),
// Execute(Call[] calls,uint256 nonce,uint256 deadline)Call(address target,bytes data).
import type { Address, Hex, LocalAccount, SignedAuthorization } from "viem";

export type Call = { target: Address; data: Hex };

export const executeTypes = {
  Execute: [
    { name: "calls", type: "Call[]" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  Call: [
    { name: "target", type: "address" },
    { name: "data", type: "bytes" },
  ],
} as const;

export function executeTypedData(account: Address, chainId: number, calls: Call[], nonce: bigint, deadline: bigint) {
  return {
    domain: { name: "TurnAccount", version: "1", chainId, verifyingContract: account },
    types: executeTypes,
    primaryType: "Execute" as const,
    message: { calls, nonce, deadline },
  };
}

/** Body of POST /v1/relay. Bigints travel as decimal strings. */
export type RelayRequest = {
  account: Address;
  calls: Call[];
  nonce: string;
  deadline: string;
  signature: Hex;
  /** EIP-7702 authorization delegating the account to TurnAccount; only needed until the first relay lands. */
  authorization?: {
    address: Address;
    chainId: number;
    nonce: number;
    r: Hex;
    s: Hex;
    yParity: number;
  };
};

export type RelayResponse =
  | { ok: true; txHash: Hex; gasUsed: string; delegated: boolean }
  | { ok: false; error: string; detail?: string };

/**
 * Sign a batch with the user's key (in Turn: the mera passkey session's viem account) and, when the account
 * isn't delegated yet, an EIP-7702 authorization to the TurnAccount implementation. One passkey ceremony
 * covers both signatures.
 */
export async function signRelayRequest(params: {
  signer: LocalAccount;
  chainId: number;
  calls: Call[];
  nonce: bigint;
  deadline: bigint;
  delegateTo?: { implementation: Address; accountNonce: number };
}): Promise<RelayRequest> {
  const { signer, chainId, calls, nonce, deadline, delegateTo } = params;
  const signature = await signer.signTypedData(executeTypedData(signer.address, chainId, calls, nonce, deadline));
  let authorization: RelayRequest["authorization"];
  if (delegateTo) {
    if (!signer.signAuthorization) throw new Error("signer cannot sign EIP-7702 authorizations");
    const a: SignedAuthorization = await signer.signAuthorization({
      address: delegateTo.implementation,
      chainId,
      nonce: delegateTo.accountNonce,
    });
    authorization = {
      address: a.address,
      chainId: a.chainId,
      nonce: a.nonce,
      r: a.r,
      s: a.s,
      yParity: a.yParity ?? (a.v === 28n ? 1 : 0),
    };
  }
  return {
    account: signer.address,
    calls,
    nonce: nonce.toString(),
    deadline: deadline.toString(),
    signature,
    authorization,
  };
}
