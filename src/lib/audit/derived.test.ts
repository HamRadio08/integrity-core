import { describe, expect, it } from "vitest";
import { buildDesk, buildFreshness, buildMemeLadder, buildPnlByStrategy, mean, median, TAPE_FAIL_MS, TAPE_WATCH_MS } from "./derived";
import { getDemoBundle } from "./run";
import { GATE_IDS } from "./types";

describe("derived stats", () => {
  it("mean and median are measured from the sample, not invented", () => {
    expect(mean([])).toBeNull();
    expect(median([])).toBeNull();
    expect(mean([2, 4, 6])).toBe(4);
    expect(median([1, 3, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("PnL buckets partition the sealed book and only use tape 5d/20d returns", () => {
    const bundle = getDemoBundle();
    const buckets = buildPnlByStrategy(bundle.records);
    const book = buckets.find((row) => row.id === "BOOK");
    expect(book?.count).toBe(bundle.records.length);
    expect(book?.share).toBe(1);

    const attributed = buckets.filter((row) => row.id !== "BOOK");
    expect(attributed.reduce((sum, row) => sum + row.count, 0)).toBe(bundle.records.length);

    const passed = buckets.find((row) => row.id === "PASSED");
    expect(passed?.count).toBe(bundle.passedCount);

    for (const gateId of GATE_IDS) {
      const bucket = buckets.find((row) => row.id === gateId);
      const actual = bundle.records.filter((record) => record.killGate === gateId);
      expect(bucket?.count).toBe(actual.length);
      const sample = actual
        .map((record) => record.chg5d)
        .filter((value): value is number => typeof value === "number");
      expect(bucket?.sample5d).toBe(sample.length);
      if (sample.length) {
        expect(bucket?.meanChg5d).toBeCloseTo(mean(sample) ?? 0, 12);
      } else {
        expect(bucket?.meanChg5d).toBeNull();
      }
    }
  });

  it("meme ladder is the sealed Meme-sector names, ranked by measured 5d tape return", () => {
    const bundle = getDemoBundle();
    const ladder = buildMemeLadder(bundle.records);
    const memes = bundle.records.filter((record) => record.sector === "Meme");
    expect(ladder.map((row) => row.symbol).sort()).toEqual(memes.map((row) => row.symbol).sort());
    expect(ladder.length).toBeGreaterThan(0);
    for (let i = 1; i < ladder.length; i++) {
      const prev = ladder[i - 1].chg5d ?? Number.NEGATIVE_INFINITY;
      const next = ladder[i].chg5d ?? Number.NEGATIVE_INFINITY;
      expect(prev).toBeGreaterThanOrEqual(next);
    }
    for (const rung of ladder) {
      const record = bundle.records.find((item) => item.candidateId === rung.candidateId);
      expect(record).toBeTruthy();
      expect(rung.last).toBe(record!.last);
      expect(rung.chg5d).toBe(record!.chg5d);
      expect(rung.killGate).toBe(record!.killGate);
    }
  });

  it("freshness is fail-closed against the sealed tape clock", () => {
    const tape = getDemoBundle().tape;
    const fetched = Date.parse(tape.fetchedAt);
    expect(buildFreshness(tape, fetched + 60_000).severity).toBe("ok");
    expect(buildFreshness(tape, fetched + TAPE_WATCH_MS + 1).severity).toBe("watch");
    expect(buildFreshness(tape, fetched + TAPE_FAIL_MS + 1).severity).toBe("fail");
  });

  it("desk snapshot is derived from the same sealed run the rest of the desk shows", () => {
    const bundle = getDemoBundle();
    const desk = buildDesk(bundle, Date.parse(bundle.tape.fetchedAt) + 1_000);
    expect(desk.pnlByStrategy[0]?.id).toBe("BOOK");
    expect(desk.memeLadder.length).toBe(buildMemeLadder(bundle.records).length);
    expect(desk.freshness.severity).toBe("ok");
    expect(bundle.desk.pnlByStrategy.map((row) => row.count)).toEqual(desk.pnlByStrategy.map((row) => row.count));
  });
});
