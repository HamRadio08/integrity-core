import { describe, expect, it } from "vitest";
import { STACK_CONFIG } from "./config";
import { evaluateCandidate, sealUniverse } from "./engine";
import { buildContext, GATE_EVALUATORS } from "./gates";
import { verifyIntegrity } from "./invariants";
import { buildLiveUniverse } from "./market";
import { GATE_IDS } from "./types";
import type { Candidate, GateId } from "./types";

const SEED = 20260822;

/** The engine's short-circuit loop, run under an arbitrary order. */
function runOrder(candidates: Candidate[], order: GateId[]) {
  const passed: string[] = [];
  const killedBy = new Map<string, GateId>();
  const reached = new Map<GateId, number>(order.map((gateId) => [gateId, 0]));

  for (const candidate of candidates) {
    const ctx = buildContext(candidate, STACK_CONFIG);
    let kill: GateId | null = null;
    for (const gateId of order) {
      if (kill) break;
      reached.set(gateId, reached.get(gateId)! + 1);
      if (GATE_EVALUATORS[gateId](ctx).status === "FAIL") kill = gateId;
    }
    if (kill) killedBy.set(candidate.symbol, kill);
    else passed.push(candidate.symbol);
  }
  return { passed: passed.sort(), killedBy, reached };
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [
      item,
      ...rest,
    ]),
  );
}

const LEGACY_ORDER: GateId[] = ["trend_sep", "adx", "volume_confirm", "tier_reject", "accel_gate"];

describe("declared gate order", () => {
  it("screens the universe before it computes a signal", () => {
    expect(GATE_IDS[0]).toBe("tier_reject");
  });

  it("evaluates tier_reject on every candidate, not just signal survivors", () => {
    const universe = buildLiveUniverse(SEED);
    const skipped = universe.filter((candidate) => {
      const tier = evaluateCandidate(candidate).evaluations.find(
        (row) => row.gateId === "tier_reject",
      );
      return tier?.status === "SKIP";
    });
    expect(skipped).toHaveLength(0);
  });

  it("closes the 93% liquidity blind spot #7 recorded", () => {
    // #7 shipped the ADV floors and measured, after the fact, that they only ever inspected
    // the candidates that had already cleared three signal gates. Both numbers are pinned so
    // a reorder back to the old shape fails here instead of quietly re-opening the hole.
    const universe = buildLiveUniverse(SEED);
    const legacy = runOrder(universe, LEGACY_ORDER);
    const current = runOrder(universe, [...GATE_IDS]);

    expect(universe).toHaveLength(117);
    expect(legacy.reached.get("tier_reject")).toBe(8); // 6.8% of the book
    expect(current.reached.get("tier_reject")).toBe(universe.length); // 100%
  });
});

describe("reordering the stack is selection-neutral", () => {
  // The stack is a short-circuit AND-chain: a candidate passes iff it passes all five gates,
  // so no ordering can change WHICH names survive — only which gate is credited with the
  // kill. This is what makes front-loading the universe screen safe to ship, and it is the
  // property to break loudly if a gate ever gains a side effect or reads another's output.
  const universe = buildLiveUniverse(SEED);
  const orders = permutations([...GATE_IDS]);

  it("every one of the 120 orderings passes the same book", () => {
    expect(orders).toHaveLength(120);
    const distinct = new Set(orders.map((order) => runOrder(universe, order).passed.join(",")));
    expect(distinct.size).toBe(1);
  });

  it("front-loading tier_reject moves attribution only, and only for tier-4 names", () => {
    const legacy = runOrder(universe, LEGACY_ORDER);
    const current = runOrder(universe, [...GATE_IDS]);

    expect(current.passed).toEqual(legacy.passed);
    expect(current.passed).toEqual(["BNB", "COP", "ETH", "LINK", "XRP"]);

    const moved = [...current.killedBy.entries()]
      .filter(([symbol, gateId]) => legacy.killedBy.get(symbol) !== gateId)
      .map(([symbol]) => symbol)
      .sort();
    // Thin/ineligible names that used to die at trend_sep before the screen ever saw them.
    expect(moved).toEqual(["LCID", "SHIB", "WIF"]);
    for (const symbol of moved) {
      expect(current.killedBy.get(symbol)).toBe("tier_reject");
      expect(universe.find((candidate) => candidate.symbol === symbol)!.tier).toBe(4);
    }
  });
});

describe("tierDominates is a live tripwire, not a vacuous one", () => {
  it("cannot be reached from behind three signal gates", () => {
    // Fourth in the stack, tier_reject's kill share was capped by whatever survived the
    // signal gates — 8 of 117, a 6.8% ceiling. `share > 0.15` was unsatisfiable, so the
    // check could never fire however badly the universe screen misbehaved.
    const universe = buildLiveUniverse(SEED);
    const ceiling = runOrder(universe, LEGACY_ORDER).reached.get("tier_reject")! / universe.length;
    expect(ceiling).toBeLessThan(0.15);
  });

  it("fails attestation when the universe screen takes over the book", () => {
    // Same tape, but most of it made ineligible. Screening the whole book, tier_reject can
    // now actually wipe it — and the invariant says so instead of staying silent.
    const universe = buildLiveUniverse(SEED).map((candidate, index) =>
      index % 2 === 0 ? { ...candidate, tier: 4 as const } : candidate,
    );
    const { records } = sealUniverse(universe, STACK_CONFIG);
    const report = verifyIntegrity({ records, config: STACK_CONFIG });
    const roleContract = report.checks.find((check) => check.id === "role-contract");

    expect(roleContract?.severity).toBe("fail");
    expect(roleContract?.detail).toContain("wiping the book");
    expect(report.contractHeld).toBe(false);
    // Contract drift is not tampering: the seal itself is still sound.
    expect(report.tamperDetected).toBe(false);
  });

  it("stays quiet on the real book", () => {
    const { records } = sealUniverse(buildLiveUniverse(SEED), STACK_CONFIG);
    const report = verifyIntegrity({ records, config: STACK_CONFIG });
    const roleContract = report.checks.find((check) => check.id === "role-contract");

    expect(roleContract?.severity).not.toBe("fail");
    expect(roleContract?.detail).not.toContain("wiping the book");
  });
});
