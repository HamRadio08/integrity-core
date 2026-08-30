import type { CandidateRecord } from "@/lib/audit/types";
import { PAPER_AGENTS, type PaperAgentSpec } from "./agents";
import { assertPaperFill, executionMode } from "./mode";
import { PAPER_MODE, PAPER_VENUE, type PaperAgentState, type PaperBook, type PaperFill, type PaperPosition } from "./types";

export const MIN_TRADE_NOTIONAL = 25;
export const PAPER_STALE_MS = 30_000;
export const MAX_FILLS = 200;

export interface PaperTickInput {
  runId: string;
  records: CandidateRecord[];
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function shares(value: number): number {
  return Math.round(value * 1e8) / 1e8;
}

function mark(position: PaperPosition, last: number): PaperPosition {
  const marketValue = money(position.qty * last);
  const unrealized = money((last - position.avgPrice) * position.qty);
  const cost = position.avgPrice * position.qty;
  return {
    ...position,
    last,
    marketValue,
    unrealized,
    unrealizedPct: cost > 0 ? unrealized / cost : 0,
  };
}

function lastBySymbol(records: CandidateRecord[]): Map<string, CandidateRecord> {
  return new Map(records.map((record) => [record.symbol, record]));
}

function summarizeAgent(agent: Omit<PaperAgentState, "equity" | "unrealized" | "status">): PaperAgentState {
  const unrealized = money(agent.positions.reduce((sum, row) => sum + row.unrealized, 0));
  const marketValue = agent.positions.reduce((sum, row) => sum + row.marketValue, 0);
  return {
    ...agent,
    cash: money(agent.cash),
    equity: money(agent.cash + marketValue),
    unrealized,
    status: agent.positions.length > 0 ? "active" : "flat",
  };
}

function emptyAgent(spec: PaperAgentSpec): PaperAgentState {
  return summarizeAgent({
    id: spec.id,
    label: spec.label,
    mandate: spec.mandate,
    startingCash: spec.startingCash,
    cash: spec.startingCash,
    realized: 0,
    positions: [],
    lastTickAt: null,
    lastReason: "Awaiting first paper tick.",
  });
}

export function emptyPaperBook(nowIso = new Date().toISOString()): PaperBook {
  executionMode();
  const agents = PAPER_AGENTS.map(emptyAgent);
  return summarizeBook({
    mode: PAPER_MODE,
    venue: "paper-ledger",
    startedAt: nowIso,
    updatedAt: nowIso,
    lastRunId: null,
    startingCash: agents.reduce((sum, row) => sum + row.startingCash, 0),
    agents,
    fills: [],
    nextFill: 1,
    note: "Paper fills only. No venue order is sent. Agents long names that cleared the sealed stack.",
  });
}

function summarizeBook(book: Omit<PaperBook, "cash" | "equity" | "realized" | "unrealized" | "openPositions">): PaperBook {
  return {
    ...book,
    cash: money(book.agents.reduce((sum, row) => sum + row.cash, 0)),
    equity: money(book.agents.reduce((sum, row) => sum + row.equity, 0)),
    realized: money(book.agents.reduce((sum, row) => sum + row.realized, 0)),
    unrealized: money(book.agents.reduce((sum, row) => sum + row.unrealized, 0)),
    openPositions: book.agents.reduce((sum, row) => sum + row.positions.length, 0),
  };
}

function pushFill(book: PaperBook, fill: PaperFill): PaperBook {
  assertPaperFill(fill);
  return {
    ...book,
    nextFill: book.nextFill + 1,
    fills: [fill, ...book.fills].slice(0, MAX_FILLS),
  };
}

function sellPosition(
  book: PaperBook,
  agent: PaperAgentState,
  position: PaperPosition,
  qty: number,
  last: number,
  nowIso: string,
  runId: string,
  reason: string,
): { book: PaperBook; agent: PaperAgentState } {
  const sellQty = shares(Math.min(position.qty, qty));
  if (sellQty <= 0) return { book, agent };
  const notional = money(sellQty * last);
  const realized = money((last - position.avgPrice) * sellQty);
  const fill: PaperFill = {
    id: `P-${book.nextFill}`,
    agentId: agent.id,
    symbol: position.symbol,
    name: position.name,
    side: "SELL",
    qty: sellQty,
    price: last,
    notional,
    reason,
    at: nowIso,
    runId,
    venue: PAPER_VENUE,
  };
  const remainingQty = shares(position.qty - sellQty);
  const positions =
    remainingQty <= 0
      ? agent.positions.filter((row) => row.symbol !== position.symbol)
      : agent.positions.map((row) =>
          row.symbol === position.symbol ? mark({ ...row, qty: remainingQty }, last) : row,
        );
  const nextAgent = summarizeAgent({
    ...agent,
    cash: agent.cash + notional,
    realized: money(agent.realized + realized),
    positions,
    lastTickAt: nowIso,
    lastReason: reason,
  });
  return { book: pushFill(book, fill), agent: nextAgent };
}

function buyPosition(
  book: PaperBook,
  agent: PaperAgentState,
  record: CandidateRecord,
  qty: number,
  nowIso: string,
  runId: string,
  reason: string,
): { book: PaperBook; agent: PaperAgentState } {
  const notional = money(qty * record.last);
  if (notional <= 0 || qty <= 0) return { book, agent };
  const fill: PaperFill = {
    id: `P-${book.nextFill}`,
    agentId: agent.id,
    symbol: record.symbol,
    name: record.name,
    side: "BUY",
    qty,
    price: record.last,
    notional,
    reason,
    at: nowIso,
    runId,
    venue: PAPER_VENUE,
  };
  const existing = agent.positions.find((row) => row.symbol === record.symbol);
  const nextQty = shares((existing?.qty ?? 0) + qty);
  const nextAvg = existing
    ? (existing.avgPrice * existing.qty + record.last * qty) / nextQty
    : record.last;
  const nextPos = mark(
    {
      agentId: agent.id,
      symbol: record.symbol,
      name: record.name,
      qty: nextQty,
      avgPrice: nextAvg,
      last: record.last,
      marketValue: 0,
      unrealized: 0,
      unrealizedPct: 0,
      openedAt: existing?.openedAt ?? nowIso,
    },
    record.last,
  );
  const positions = existing
    ? agent.positions.map((row) => (row.symbol === record.symbol ? nextPos : row))
    : [...agent.positions, nextPos];
  const nextAgent = summarizeAgent({
    ...agent,
    cash: agent.cash - notional,
    positions,
    lastTickAt: nowIso,
    lastReason: reason,
  });
  return { book: pushFill(book, fill), agent: nextAgent };
}

function remakeMarks(agent: PaperAgentState, records: Map<string, CandidateRecord>): PaperAgentState {
  return summarizeAgent({
    ...agent,
    positions: agent.positions.map((position) => {
      const last = records.get(position.symbol)?.last ?? position.last;
      return mark(position, last);
    }),
  });
}

function tickAgent(
  book: PaperBook,
  spec: PaperAgentSpec,
  records: CandidateRecord[],
  runId: string,
  nowIso: string,
): { book: PaperBook; agent: PaperAgentState } {
  const bySymbol = lastBySymbol(records);
  let agent = remakeMarks(book.agents.find((row) => row.id === spec.id) ?? emptyAgent(spec), bySymbol);
  const targets = spec.select(records);
  const targetSymbols = new Set(targets.map((row) => row.symbol));

  for (const position of [...agent.positions]) {
    if (targetSymbols.has(position.symbol)) continue;
    const last = bySymbol.get(position.symbol)?.last ?? position.last;
    const marked = mark(position, last);
    const sold = sellPosition(
      book,
      agent,
      marked,
      marked.qty,
      last,
      nowIso,
      runId,
      `${position.symbol} left ${spec.label}'s paper book.`,
    );
    book = sold.book;
    agent = sold.agent;
  }

  if (targets.length === 0) {
    agent = { ...agent, lastTickAt: nowIso, lastReason: spec.emptyReason };
    return { book, agent };
  }

  const equity = agent.equity;
  const targetNotional = equity / targets.length;

  for (const record of targets) {
    const current = agent.positions.find((row) => row.symbol === record.symbol);
    const currentMv = current ? current.qty * record.last : 0;
    const delta = targetNotional - currentMv;
    if (Math.abs(delta) < MIN_TRADE_NOTIONAL) continue;
    if (delta > 0) {
      const affordable = Math.min(delta, agent.cash);
      const qty = shares(affordable / record.last);
      if (qty <= 0 || affordable < MIN_TRADE_NOTIONAL) continue;
      const bought = buyPosition(book, agent, record, qty, nowIso, runId, spec.entryReason(record));
      book = bought.book;
      agent = bought.agent;
    } else if (current) {
      const qty = Math.min(current.qty, shares(Math.abs(delta) / record.last));
      if (qty <= 0) continue;
      const sold = sellPosition(
        book,
        agent,
        current,
        qty,
        record.last,
        nowIso,
        runId,
        `Rebalance ${record.symbol} on ${spec.label}.`,
      );
      book = sold.book;
      agent = sold.agent;
    }
  }

  agent = remakeMarks(agent, bySymbol);
  if (!agent.lastReason.startsWith("No ")) {
    agent = {
      ...agent,
      lastTickAt: nowIso,
      lastReason: `Paper-long ${agent.positions.length} name${agent.positions.length === 1 ? "" : "s"} that cleared the stack.`,
    };
  }
  return { book, agent };
}

export function shouldRetick(book: PaperBook, runId: string, nowMs = Date.now()): boolean {
  if (book.lastRunId !== runId) return true;
  const updated = Date.parse(book.updatedAt);
  if (!Number.isFinite(updated)) return true;
  return nowMs - updated >= PAPER_STALE_MS;
}

export function tickPaper(input: PaperTickInput, book: PaperBook, nowIso = new Date().toISOString()): PaperBook {
  executionMode();
  if (book.mode !== PAPER_MODE || book.venue !== "paper-ledger") {
    throw new Error("Refusing to tick a non-paper book.");
  }

  let next = book;
  const agents: PaperAgentState[] = [];
  for (const spec of PAPER_AGENTS) {
    const stepped = tickAgent(next, spec, input.records, input.runId, nowIso);
    next = stepped.book;
    agents.push(stepped.agent);
  }

  return summarizeBook({
    ...next,
    agents,
    updatedAt: nowIso,
    lastRunId: input.runId,
  });
}
