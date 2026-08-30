export const PAPER_VENUE = "paper" as const;
export const PAPER_MODE = "paper" as const;

export type PaperSide = "BUY" | "SELL";

export interface PaperFill {
  id: string;
  agentId: string;
  symbol: string;
  name: string;
  side: PaperSide;
  qty: number;
  price: number;
  notional: number;
  reason: string;
  at: string;
  runId: string;
  venue: typeof PAPER_VENUE;
}

export interface PaperPosition {
  agentId: string;
  symbol: string;
  name: string;
  qty: number;
  avgPrice: number;
  last: number;
  marketValue: number;
  unrealized: number;
  unrealizedPct: number;
  openedAt: string;
}

export interface PaperAgentState {
  id: string;
  label: string;
  mandate: string;
  status: "active" | "flat";
  startingCash: number;
  cash: number;
  equity: number;
  realized: number;
  unrealized: number;
  positions: PaperPosition[];
  lastTickAt: string | null;
  lastReason: string;
}

export interface PaperBook {
  mode: typeof PAPER_MODE;
  venue: "paper-ledger";
  startedAt: string;
  updatedAt: string;
  lastRunId: string | null;
  startingCash: number;
  cash: number;
  equity: number;
  realized: number;
  unrealized: number;
  openPositions: number;
  agents: PaperAgentState[];
  fills: PaperFill[];
  nextFill: number;
  note: string;
}
