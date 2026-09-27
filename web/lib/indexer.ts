// Reads from the Envio indexer (source of truth for history; Monad full nodes don't serve historical state).
import { config } from "./config";

export async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(config.indexerUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length) throw new Error(body.errors[0]!.message);
  return body.data as T;
}

export type CircleRow = {
  id: string;
  status: "Forming" | "Active" | "Completed";
  mode: "FixedOrder" | "Auction";
  size: number;
  contribution: string;
  period: number;
  bidWindow: number;
  gracePeriod: number;
  maxDiscountBps: number;
  entryDeposit: string;
  reserveBps: number;
  memberCount: number;
  activeCount: number;
  currentRound: number;
  totalRounds: number;
  startTime: string | null;
  createdAt: string;
  collected: string;
  expected: string;
  healthScore: number;
  reserveBalance: string;
  totalPaidOut: string;
  currencies: string[];
  creator_id: string;
};

const CIRCLE_FIELDS = `id status mode size contribution period bidWindow gracePeriod maxDiscountBps entryDeposit reserveBps
  memberCount activeCount currentRound totalRounds startTime createdAt collected expected healthScore reserveBalance
  totalPaidOut currencies creator_id`;

export type MembershipRow = {
  id: string;
  circle_id: string;
  member_id: string;
  joinIndex: number;
  status: "Active" | "Left" | "Ejected";
  displayCurrency: string;
  hasWon: boolean;
  wonRound: number | null;
  collateral: string;
  credit: string;
  paymentsOnTime: number;
  paymentsLate: number;
  defaults: number;
  totalPaid: string;
  received: string;
  claimed: string;
  refundDue: string;
};

const MEMBERSHIP_FIELDS = `id circle_id member_id joinIndex status displayCurrency hasWon wonRound collateral credit
  paymentsOnTime paymentsLate defaults totalPaid received claimed refundDue`;

export type RoundRow = {
  id: string;
  number: number;
  start: string;
  settlement: boolean;
  status: "Open" | "AuctionClosed" | "PaidOut" | "Cancelled" | "Settlement";
  potTarget: string;
  collected: string;
  paidCount: number;
  bidCount: number;
  bestBidBps: number | null;
  bestBidder_id: string | null;
  winner_id: string | null;
  discountBps: number | null;
  pot: string | null;
  netPaid: string | null;
  paidOutAt: string | null;
};

export type MemberRow = {
  id: string;
  circlesJoined: number;
  circlesCompleted: number;
  circlesActive: number;
  paymentsOnTime: number;
  paymentsLate: number;
  defaults: number;
  totalContributed: string;
  totalReceived: string;
  onTimeRateBps: number;
  creditScore: number;
  trustBps: number;
  trustLevel: string;
  displayCurrency: string;
  firstSeenAt: string;
};

const MEMBER_FIELDS = `id circlesJoined circlesCompleted circlesActive paymentsOnTime paymentsLate defaults totalContributed
  totalReceived onTimeRateBps creditScore trustBps trustLevel displayCurrency firstSeenAt`;

export async function myCircles(member: string) {
  return gql<{ Membership: (MembershipRow & { circle: CircleRow })[]; Member: MemberRow[] }>(
    `query ($m: String!) {
      Membership(where: { member_id: { _eq: $m } }, order_by: { joinedAt: desc }) { ${MEMBERSHIP_FIELDS} circle { ${CIRCLE_FIELDS} } }
      Member(where: { id: { _eq: $m } }) { ${MEMBER_FIELDS} }
    }`,
    { m: member },
  );
}

export async function circleDetail(circle: string) {
  return gql<{
    Circle: CircleRow[];
    Membership: MembershipRow[];
    Round: RoundRow[];
    Bid: { id: string; member_id: string; discountBps: number; timestamp: string; round_id: string }[];
    Payment: { id: string; member_id: string; round_id: string; kind: "Paid" | "Covered"; amount: string; onTime: boolean }[];
  }>(
    `query ($c: String!) {
      Circle(where: { id: { _eq: $c } }) { ${CIRCLE_FIELDS} }
      Membership(where: { circle_id: { _eq: $c } }, order_by: { joinIndex: asc }) { ${MEMBERSHIP_FIELDS} }
      Round(where: { circle_id: { _eq: $c } }, order_by: { number: asc }) {
        id number start settlement status potTarget collected paidCount bidCount bestBidBps bestBidder_id winner_id
        discountBps pot netPaid paidOutAt
      }
      Bid(where: { circle_id: { _eq: $c } }, order_by: { timestamp: desc }, limit: 50) { id member_id discountBps timestamp round_id }
      Payment(where: { circle_id: { _eq: $c } }, order_by: { timestamp: desc }, limit: 200) { id member_id round_id kind amount onTime }
    }`,
    { c: circle },
  );
}

export async function memberProfile(member: string) {
  return gql<{ Member: MemberRow[]; Membership: (MembershipRow & { circle: Pick<CircleRow, "id" | "status" | "size" | "contribution"> })[] }>(
    `query ($m: String!) {
      Member(where: { id: { _eq: $m } }) { ${MEMBER_FIELDS} }
      Membership(where: { member_id: { _eq: $m } }) { ${MEMBERSHIP_FIELDS} circle { id status size contribution } }
    }`,
    { m: member },
  );
}

export async function sessions(member: string) {
  return gql<{ Session: { id: string; circle_id: string; maxAmount: string; period: number; validUntil: string; active: boolean; pulls: number; totalPulled: string }[] }>(
    `query ($m: String!) { Session(where: { account_id: { _eq: $m } }) { id circle_id maxAmount period validUntil active pulls totalPulled } }`,
    { m: member },
  );
}

export async function networkStats() {
  return gql<{
    GlobalStats: {
      circlesCreated: number;
      circlesActive: number;
      circlesCompleted: number;
      members: number;
      totalSaved: string;
      totalPaidOut: string;
      paymentsOnTime: number;
      paymentsLate: number;
      defaults: number;
      onTimeRateBps: number;
      crossBorderVolume: string;
      activeSessions: number;
    }[];
    CorridorStats: { id: string; fromCurrency: string; toCurrency: string; crossBorder: boolean; volume: string; transfers: number; circles: number }[];
  }>(`{
    GlobalStats { circlesCreated circlesActive circlesCompleted members totalSaved totalPaidOut paymentsOnTime paymentsLate defaults onTimeRateBps crossBorderVolume activeSessions }
    CorridorStats(order_by: { volume: desc }) { id fromCurrency toCurrency crossBorder volume transfers circles }
  }`);
}
