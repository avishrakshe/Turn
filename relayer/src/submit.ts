// Builds and submits the sponsored transaction. The user's EOA is the `to`; the relayer is the sender and pays gas.
// First relay for a user carries their EIP-7702 authorization (type-4 tx); afterwards the delegation persists.
import {
  BaseError,
  ContractFunctionRevertedError,
  decodeErrorResult,
  encodeFunctionData,
  isAddressEqual,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type SignedAuthorization,
  type Transport,
  type WalletClient,
} from "viem";
import { circleAbi, circleFactoryAbi, mockAUSDAbi, turnAccountAbi } from "@turn/contracts/abi";
import type { RelayRequest } from "./client.ts";
import type { RelayerConfig } from "./config.ts";

export class SubmitError extends Error {
  constructor(
    readonly status: 400 | 422 | 502,
    message: string,
    readonly detail?: string,
  ) {
    super(message);
  }
}

/** Gas buffer on top of eth_estimateGas: Monad charges the full limit, so keep it tight. */
const BUFFER_BPS = 1_000n; // 10%

const ERROR_ABIS = [...turnAccountAbi, ...circleAbi, ...circleFactoryAbi, ...mockAUSDAbi];

export class Submitter {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly cfg: RelayerConfig,
    private readonly publicClient: PublicClient,
    private readonly wallet: WalletClient<Transport, Chain, Account>,
  ) {}

  /** 0xef0100 ++ implementation, per EIP-7702. */
  async delegationOf(account: Address): Promise<Address | null> {
    const code = await this.publicClient.getCode({ address: account });
    if (!code || code === "0x") return null;
    if (code.length === 48 && code.startsWith("0xef0100")) return `0x${code.slice(8)}` as Address;
    return null;
  }

  async isDelegatedToTurn(account: Address): Promise<boolean> {
    const d = await this.delegationOf(account);
    return d !== null && isAddressEqual(d, this.cfg.accountImplementation);
  }

  /** Estimate (free) and fail early on reverts such as a bad signature, so rejected batches never cost gas. */
  async prepare(req: RelayRequest): Promise<{ data: Hex; gas: bigint; authorizationList?: SignedAuthorization[] }> {
    const delegated = await this.isDelegatedToTurn(req.account);
    if (!delegated && !req.authorization) {
      throw new SubmitError(400, "account is not set up yet: include the EIP-7702 authorization");
    }
    const authorizationList: SignedAuthorization[] | undefined =
      !delegated && req.authorization
        ? [
            {
              address: req.authorization.address,
              chainId: req.authorization.chainId,
              nonce: req.authorization.nonce,
              r: req.authorization.r,
              s: req.authorization.s,
              yParity: req.authorization.yParity,
            },
          ]
        : undefined;

    const data = encodeFunctionData({
      abi: turnAccountAbi,
      functionName: "execute",
      args: [req.calls, BigInt(req.nonce), BigInt(req.deadline), req.signature],
    });

    let estimate: bigint;
    try {
      estimate = await this.publicClient.estimateGas({
        account: this.wallet.account,
        to: req.account,
        data,
        authorizationList,
      });
    } catch (err) {
      throw new SubmitError(422, "batch would revert", describeRevert(err));
    }
    const gas = estimate + (estimate * BUFFER_BPS) / 10_000n;
    if (gas > this.cfg.maxGasPerTx) throw new SubmitError(422, `batch needs ${gas} gas, above the relay cap`);
    return { data, gas, authorizationList };
  }

  /** Submissions are serialized so the relayer's own nonce never races. */
  submit(req: RelayRequest, prepared: { data: Hex; gas: bigint; authorizationList?: SignedAuthorization[] }) {
    const run = async () => {
      const hash = await this.wallet.sendTransaction({
        to: req.account,
        data: prepared.data,
        gas: prepared.gas,
        authorizationList: prepared.authorizationList,
        chain: this.wallet.chain,
        account: this.wallet.account,
      });
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new SubmitError(502, "transaction reverted onchain", hash);
      return { hash, gasUsed: receipt.gasUsed, gasLimit: prepared.gas };
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }
}

/** Turn a viem estimate/call error into a short, human-readable reason (custom errors decoded). */
export function describeRevert(err: unknown): string {
  if (err instanceof BaseError) {
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError && reverted.data?.errorName) {
      return reverted.data.errorName;
    }
    const raw = findRevertData(err);
    if (raw) {
      try {
        const decoded = decodeErrorResult({ abi: ERROR_ABIS, data: raw });
        const inner = decoded.errorName === "CallFailed" ? innerReason(decoded.args?.[1] as Hex | undefined) : "";
        return inner ? `${decoded.errorName}: ${inner}` : decoded.errorName;
      } catch {
        return raw;
      }
    }
    return err.shortMessage;
  }
  return String(err);
}

function innerReason(data: Hex | undefined): string {
  if (!data || data === "0x") return "";
  try {
    return decodeErrorResult({ abi: ERROR_ABIS, data }).errorName;
  } catch {
    return data;
  }
}

function findRevertData(err: BaseError): Hex | undefined {
  let found: Hex | undefined;
  err.walk((e) => {
    const d = (e as { data?: unknown }).data;
    if (typeof d === "string" && d.startsWith("0x") && d.length >= 10) {
      found = d as Hex;
      return true;
    }
    return false;
  });
  return found;
}
