import { afterEach, describe, expect, it, vi } from "vitest";
import { getDemoBundle } from "@/lib/audit/run";
import { emptyPaperBook, MIN_TRADE_NOTIONAL, shouldRetick, tickPaper } from "./engine";
import { executionMode } from "./mode";
import { resetPaperBookForTests, tickActivePaper } from "./store";
import type { CandidateRecord } from "@/lib/audit/types";

afterEach(() => {
  vi.unstubAllEnvs();
  resetPaperBookForTests();
});

function killPassed(records: CandidateRecord[]): CandidateRecord[] {
  return records.map((record) =>
    record.outcome === "PASSED"
      ? { ...record, outcome: "KILLED", killGate: "adx" }
      : record,
  );
}

describe("paper mode lock", () => {
  it("is paper unless someone tries to flip it, and then it refuses", () => {
    expect(executionMode()).toBe("paper");
    vi.stubEnv("TRADING_MODE", "live");
    expect(() => executionMode()).toThrow(/Live execution is disabled/);
    expect(() => emptyPaperBook()).toThrow(/paper fills/);
  });
});

describe("paper tick", () => {
  it("opens equal-weight paper longs only in names that cleared the stack", () => {
    const bundle = getDemoBundle();
    const passed = bundle.records.filter((record) => record.outcome === "PASSED");
    expect(passed.length).toBeGreaterThan(0);

    const book = tickPaper(
      { runId: bundle.runId, records: bundle.records },
      emptyPaperBook("2026-08-30T12:00:00.000Z"),
      "2026-08-30T12:00:00.000Z",
    );

    expect(book.mode).toBe("paper");
    expect(book.venue).toBe("paper-ledger");
    expect(book.fills.every((fill) => fill.venue === "paper" && fill.side === "BUY")).toBe(true);

    const stack = book.agents.find((row) => row.id === "stack-long");
    expect(stack).toBeTruthy();
    expect(stack!.positions.map((row) => row.symbol).sort()).toEqual(passed.map((row) => row.symbol).sort());
    expect(stack!.status).toBe("active");
    expect(stack!.equity).toBeCloseTo(stack!.startingCash, 0);

    const notionals = stack!.positions.map((row) => row.marketValue);
    const mean = notionals.reduce((sum, value) => sum + value, 0) / notionals.length;
    for (const notional of notionals) {
      expect(Math.abs(notional - mean)).toBeLessThan(mean * 0.05 + MIN_TRADE_NOTIONAL);
    }

    const crypto = book.agents.find((row) => row.id === "stack-crypto");
    const cryptoPassed = passed.filter((row) => row.market === "crypto");
    expect(crypto!.positions.map((row) => row.symbol).sort()).toEqual(cryptoPassed.map((row) => row.symbol).sort());

    const meme = book.agents.find((row) => row.id === "meme-cleared");
    expect(meme!.positions).toHaveLength(0);
    expect(meme!.status).toBe("flat");
    expect(meme!.cash).toBe(meme!.startingCash);
    expect(meme!.lastReason).toMatch(/No meme-sector names/);
  });

  it("sells the paper book when names leave the stack", () => {
    const bundle = getDemoBundle();
    const opened = tickPaper(
      { runId: "run-1", records: bundle.records },
      emptyPaperBook("2026-08-30T12:00:00.000Z"),
      "2026-08-30T12:00:00.000Z",
    );
    expect(opened.openPositions).toBeGreaterThan(0);

    const closed = tickPaper(
      { runId: "run-2", records: killPassed(bundle.records) },
      opened,
      "2026-08-30T12:01:00.000Z",
    );

    expect(closed.openPositions).toBe(0);
    expect(closed.agents.every((row) => row.status === "flat")).toBe(true);
    expect(closed.fills.some((fill) => fill.side === "SELL")).toBe(true);
    expect(closed.fills.every((fill) => fill.venue === "paper")).toBe(true);
    for (const agent of closed.agents) {
      expect(agent.cash + agent.unrealized).toBeCloseTo(agent.equity, 2);
    }
  });

  it("does not invent a last — marks and fills use the sealed record last", () => {
    const bundle = getDemoBundle();
    const sample = bundle.records.find((record) => record.outcome === "PASSED");
    expect(sample).toBeTruthy();
    const book = tickPaper(
      { runId: bundle.runId, records: bundle.records },
      emptyPaperBook("2026-08-30T12:00:00.000Z"),
      "2026-08-30T12:00:00.000Z",
    );
    const fill = book.fills.find((row) => row.symbol === sample!.symbol && row.agentId === "stack-long");
    const pos = book.agents
      .find((row) => row.id === "stack-long")
      ?.positions.find((row) => row.symbol === sample!.symbol);
    expect(fill?.price).toBe(sample!.last);
    expect(pos?.last).toBe(sample!.last);
    expect(pos?.avgPrice).toBe(sample!.last);
  });
});

describe("paper store", () => {
  it("ticks on a new run id and skips a fresh identical run", () => {
    const bundle = getDemoBundle();
    const first = tickActivePaper(bundle, { force: true, nowIso: "2026-08-30T12:00:00.000Z" });
    expect(first.openPositions).toBeGreaterThan(0);
    const fillCount = first.fills.length;

    const skipped = tickActivePaper(bundle, { nowIso: "2026-08-30T12:00:10.000Z" });
    expect(skipped.fills).toHaveLength(fillCount);
    expect(shouldRetick(skipped, bundle.runId, Date.parse("2026-08-30T12:00:10.000Z"))).toBe(false);
    expect(shouldRetick(skipped, bundle.runId, Date.parse("2026-08-30T12:00:31.000Z"))).toBe(true);
  });
});
