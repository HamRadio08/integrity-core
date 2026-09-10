import { cn } from "@/lib/utils";
import type { GateEntry } from "@/lib/evidence/types";

const PCT = (value: number, domainMax: number) => `${(value / domainMax) * 100}%`;

function niceDomain(max: number): number {
  for (const step of [0.1, 0.2, 0.25, 0.5, 1]) {
    if (max <= step) return step;
  }
  return Math.ceil(max * 10) / 10;
}

function ticks(domainMax: number): number[] {
  const count = 4;
  return Array.from({ length: count + 1 }, (_, i) => (domainMax * i) / count);
}

/**
 * A gate is one threshold and a small number of measured arms, each with an
 * interval. That is a forest plot: intervals against a rule, read for which side
 * they land on. One status hue plus a reference line — the arms are not a
 * categorical set and must not be painted as one.
 */
export function GateChart({ entry }: { entry: GateEntry }) {
  const upper = Math.max(...entry.arms.map((arm) => arm.ci95[1]), entry.gate.threshold);
  const domainMax = niceDomain(upper * 1.08);
  const gateFrac = entry.gate.threshold / domainMax;
  const gateLeft = PCT(entry.gate.threshold, domainMax);
  // Centring the label on the rule puts half of it off-canvas when the gate sits
  // near zero, which is exactly where a strict gate lives.
  const gateLabelAnchor = gateFrac < 0.12 ? "translate-x-0" : "-translate-x-1/2";

  return (
    <figure className="m-0">
      <figcaption className="mb-4 text-xs text-muted-foreground">
        {entry.gate.statistic} · {entry.ciMethod} intervals · n&nbsp;=&nbsp;{entry.nEffective} per arm
      </figcaption>

      <div className="relative">
        {/* Reference rule: the preregistered gate. Direct-labeled, never legend-only. */}
        <div
          className="pointer-events-none absolute top-0 bottom-8 z-10 border-l-2 border-dashed border-ring"
          style={{ left: gateLeft }}
          aria-hidden="true"
        />
        <div
          className={cn(
            "pointer-events-none absolute -top-1 z-10 whitespace-nowrap font-mono text-[11px] text-ring",
            gateLabelAnchor,
          )}
          style={{ left: gateLeft }}
        >
          gate {entry.gate.label}
        </div>

        <div className="space-y-6 pt-8">
          {entry.arms.map((arm) => {
            const [lo, hi] = arm.ci95;
            const failed = arm.verdict !== "PASS";
            return (
              <div key={arm.label}>
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="font-mono text-xs text-foreground">{arm.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {arm.numerator}/{arm.denominator} ={" "}
                    <span className="font-mono text-foreground">{arm.point.toFixed(4)}</span>
                    <span className="mx-1.5">·</span>
                    95% [{lo.toFixed(4)}, {hi.toFixed(4)}]
                  </span>
                </div>

                <div
                  className="relative h-2 w-full rounded-full bg-muted"
                  title={`${arm.label}: ${arm.point.toFixed(4)} (95% ${lo.toFixed(4)}–${hi.toFixed(4)}), gate ${entry.gate.label} — ${arm.verdict}`}
                >
                  <div
                    className={cn(
                      "absolute inset-y-0 rounded-full",
                      failed ? "bg-rose-400/70" : "bg-emerald-400/70",
                    )}
                    style={{ left: PCT(lo, domainMax), width: PCT(hi - lo, domainMax) }}
                  />
                  <div
                    className={cn(
                      "absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card",
                      failed ? "bg-rose-400" : "bg-emerald-400",
                    )}
                    style={{ left: PCT(arm.point, domainMax) }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex justify-between font-mono text-[11px] text-muted-foreground">
          {ticks(domainMax).map((tick) => (
            <span key={tick}>{tick.toFixed(2)}</span>
          ))}
        </div>
      </div>

      {/* Table view — identity and value never depend on reading the plot. */}
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-left text-xs">
          <caption className="sr-only">
            {entry.title}: measured {entry.gate.statistic} per arm against a gate of{" "}
            {entry.gate.label}
          </caption>
          <thead className="text-muted-foreground">
            <tr className="border-b border-border">
              <th scope="col" className="py-2 pr-3 font-normal">Arm</th>
              <th scope="col" className="py-2 pr-3 text-right font-normal">Count</th>
              <th scope="col" className="py-2 pr-3 text-right font-normal">Rate</th>
              <th scope="col" className="py-2 pr-3 text-right font-normal">95% interval</th>
              <th scope="col" className="py-2 text-right font-normal">Verdict</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {entry.arms.map((arm) => (
              <tr key={arm.label} className="border-b border-border/50">
                <td className="py-2 pr-3">{arm.label}</td>
                <td className="py-2 pr-3 text-right">
                  {arm.numerator}/{arm.denominator}
                </td>
                <td className="py-2 pr-3 text-right">{arm.point.toFixed(4)}</td>
                <td className="py-2 pr-3 text-right">
                  [{arm.ci95[0].toFixed(4)}, {arm.ci95[1].toFixed(4)}]
                </td>
                <td
                  className={cn(
                    "py-2 text-right",
                    arm.verdict === "PASS" ? "text-emerald-400" : "text-rose-400",
                  )}
                >
                  {arm.verdict === "PASS" ? "✓" : "✕"} {arm.verdict}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
