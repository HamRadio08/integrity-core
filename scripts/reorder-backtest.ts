/**
 * Gate-order backtest: measure what moving `tier_reject` to the front actually does to the
 * funnel, over the committed tape rather than by argument.
 *
 * This is the evidence behind front-loading the universe screen (#7 recorded the defect and
 * deliberately left the reorder out of scope). It re-runs the engine's short-circuit loop
 * under an arbitrary gate order and prints both shapes side by side, plus the property that
 * makes the change safe to ship: a short-circuit AND-chain passes the same book under every
 * ordering, so reordering moves kill ATTRIBUTION, never SELECTION.
 *
 *   npx tsx scripts/reorder-backtest.ts
 */
import { ROLE_CONTRACTS, STACK_CONFIG } from "../src/lib/audit/config.ts";
import { buildContext, GATE_EVALUATORS } from "../src/lib/audit/gates.ts";
import { buildLiveUniverse } from "../src/lib/audit/market.ts";
import { GATE_IDS } from "../src/lib/audit/types.ts";
import type { Candidate, GateId } from "../src/lib/audit/types.ts";

const LEGACY: GateId[] = ["trend_sep", "adx", "volume_confirm", "tier_reject", "accel_gate"];
const CURRENT: GateId[] = [...GATE_IDS];
const SEED = 20260822;

const universe = buildLiveUniverse(SEED, STACK_CONFIG.barCount);
const total = universe.length;

function runOrder(candidates: Candidate[], order: GateId[]) {
  const kills = new Map<GateId, number>(order.map((gateId) => [gateId, 0]));
  const reached = new Map<GateId, number>(order.map((gateId) => [gateId, 0]));
  const killedBy = new Map<string, GateId>();
  const passed: string[] = [];

  for (const candidate of candidates) {
    const ctx = buildContext(candidate, STACK_CONFIG);
    let kill: GateId | null = null;
    for (const gateId of order) {
      if (kill) break;
      reached.set(gateId, reached.get(gateId)! + 1);
      if (GATE_EVALUATORS[gateId](ctx).status === "FAIL") kill = gateId;
    }
    if (kill) {
      kills.set(kill, kills.get(kill)! + 1);
      killedBy.set(candidate.symbol, kill);
    } else {
      passed.push(candidate.symbol);
    }
  }
  return { kills, reached, killedBy, passed: passed.sort() };
}

function report(label: string, order: GateId[]) {
  const run = runOrder(universe, order);
  console.log(`\n${"=".repeat(78)}\n${label}\n  ${order.join(" → ")}\n${"=".repeat(78)}`);
  console.log(`  ${"gate".padEnd(16)} ${"kills".padStart(5)} ${"share".padStart(7)} ${"band".padStart(9)}       reached`);

  // Report in execution order, with each gate's declared band alongside.
  for (const gateId of order) {
    const contract = ROLE_CONTRACTS.find((row) => row.gateId === gateId)!;
    const count = run.kills.get(gateId)!;
    const share = count / total;
    const inBand = share >= contract.band[0] && share <= contract.band[1];
    const band = `${(contract.band[0] * 100).toFixed(0)}-${(contract.band[1] * 100).toFixed(0)}%`;
    const reach = run.reached.get(gateId)!;
    console.log(
      `  ${gateId.padEnd(16)} ${String(count).padStart(5)} ${(share * 100).toFixed(1).padStart(6)}% ` +
        `${band.padStart(9)} ${inBand ? "OK " : "OFF"}  ${String(reach).padStart(3)}/${total} ` +
        `(${((reach / total) * 100).toFixed(1)}%)`,
    );
  }

  const tierShare = run.kills.get("tier_reject")! / total;
  const trend = run.kills.get("trend_sep")!;
  const otherMax = Math.max(
    ...[...run.kills.entries()].filter(([gateId]) => gateId !== "trend_sep").map(([, n]) => n),
  );
  const offBand = order.filter((gateId) => {
    const contract = ROLE_CONTRACTS.find((row) => row.gateId === gateId)!;
    const share = run.kills.get(gateId)! / total;
    return share < contract.band[0] || share > contract.band[1];
  });

  console.log(`\n  passed              : ${run.passed.length}  [${run.passed.join(", ")}]`);
  console.log(`  liquidity reach     : ${run.reached.get("tier_reject")}/${total} of the book liquidity-checked`);
  console.log(`  tierDominates(>15%) : ${tierShare > 0.15 ? "FAIL — universe screen has taken over" : `no (${(tierShare * 100).toFixed(1)}%)`}`);
  console.log(`  roleOrderOk         : ${trend >= otherMax ? `yes (trend_sep ${trend} ≥ next ${otherMax})` : "NO — trend_sep is no longer dominant"}`);
  console.log(`  role-contract       : ${offBand.length === 0 ? "pass" : `warn — ${offBand.join(", ")} outside band`}`);
  return run;
}

const legacy = report("LEGACY — universe screen fourth", LEGACY);
const current = report("CURRENT — universe screen first", CURRENT);

console.log(`\n${"=".repeat(78)}\nSELECTION NEUTRALITY\n${"=".repeat(78)}`);
console.log(`  same book passes    : ${current.passed.join(",") === legacy.passed.join(",") ? "YES" : "NO"}`);

const moved = [...current.killedBy.entries()]
  .filter(([symbol, gateId]) => legacy.killedBy.get(symbol) !== gateId)
  .sort(([a], [b]) => a.localeCompare(b));
console.log(`  re-attributed kills : ${moved.length}`);
for (const [symbol, gateId] of moved) {
  const tier = universe.find((candidate) => candidate.symbol === symbol)!.tier;
  console.log(`    ${symbol.padEnd(6)} tier ${tier}  ${legacy.killedBy.get(symbol)} → ${gateId}`);
}

// The safety argument in full: not just "these two orders agree" but "no order disagrees".
function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest]),
  );
}
const orders = permutations(CURRENT);
const distinct = new Set(orders.map((order) => runOrder(universe, order).passed.join(",")));
console.log(`\n  distinct passed-sets across all ${orders.length} orderings: ${distinct.size}`);
console.log(`  → reordering is ${distinct.size === 1 ? "SELECTION-NEUTRAL: attribution moves, the book does not" : "NOT selection-neutral"}`);
