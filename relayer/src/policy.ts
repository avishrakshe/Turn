// What the relayer is willing to sponsor. Mirrors TurnAccount's onchain allowlist so bad batches are rejected
// before they cost gas. The relayer can only refuse (censor); it can never alter a signed batch.
import { decodeFunctionData, getAddress, isAddressEqual, type Address, type Hex, type PublicClient } from "viem";
import { circleFactoryAbi, turnAccountAbi } from "@turn/contracts/abi";
import type { Call, RelayRequest } from "./client.ts";
import type { RelayerConfig } from "./config.ts";

export class PolicyError extends Error {
  constructor(
    readonly status: 400 | 403 | 429,
    message: string,
  ) {
    super(message);
  }
}

const SELF_SELECTORS = new Set(["grantPull", "revokePull"]);

export class Policy {
  private circleCache = new Map<string, boolean>();

  constructor(
    private readonly cfg: RelayerConfig,
    private readonly client: PublicClient,
  ) {}

  /** Structural checks that need no chain access. */
  checkShape(req: RelayRequest, nowSeconds: number): void {
    if (req.calls.length === 0) throw new PolicyError(400, "empty batch");
    if (req.calls.length > this.cfg.maxCallsPerBatch) throw new PolicyError(400, "too many calls in one batch");
    const deadline = BigInt(req.deadline);
    if (deadline <= BigInt(nowSeconds)) throw new PolicyError(400, "batch already expired");
    if (deadline > BigInt(nowSeconds + this.cfg.maxDeadlineSeconds)) throw new PolicyError(400, "deadline too far out");
    if (req.authorization) {
      if (!isAddressEqual(req.authorization.address, this.cfg.accountImplementation)) {
        throw new PolicyError(400, "authorization must delegate to the Turn account implementation");
      }
      if (req.authorization.chainId !== this.cfg.chainId) throw new PolicyError(400, "authorization for wrong chain");
    }
  }

  /** Every call must target AUSD, the factory, a factory-registered circle, or the account's own grant functions. */
  async checkTargets(account: Address, calls: Call[]): Promise<void> {
    for (const [i, c] of calls.entries()) {
      const target = getAddress(c.target);
      if (isAddressEqual(target, account)) {
        this.checkSelfCall(i, c.data);
        continue;
      }
      if (isAddressEqual(target, this.cfg.token) || isAddressEqual(target, this.cfg.factory)) continue;
      if (await this.isCircle(target)) continue;
      throw new PolicyError(403, `call ${i}: target ${target} is not a Turn contract`);
    }
  }

  private checkSelfCall(i: number, data: Hex): void {
    try {
      const { functionName } = decodeFunctionData({ abi: turnAccountAbi, data });
      if (SELF_SELECTORS.has(functionName)) return;
    } catch {
      // fall through
    }
    throw new PolicyError(403, `call ${i}: only grantPull/revokePull may target the account itself`);
  }

  private async isCircle(target: Address): Promise<boolean> {
    const key = target.toLowerCase();
    const cached = this.circleCache.get(key);
    if (cached) return true; // registration is permanent, so only positives are cached
    const yes = await this.client.readContract({
      address: this.cfg.factory,
      abi: circleFactoryAbi,
      functionName: "isCircle",
      args: [target],
    });
    if (yes) this.circleCache.set(key, true);
    return yes;
  }
}
