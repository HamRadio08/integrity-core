import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CircleAlert, CircleCheck, OctagonAlert } from "lucide-react";

import { GateChart } from "@/components/evidence/gate-chart";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadLedger } from "@/lib/evidence/load";
import type { Severity, Verdict } from "@/lib/evidence/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Evidence ledger · Stack Attestation",
  description:
    "Preregistered evaluations and adversarial audits run against this author's systems, with the verdict and the condition that would reopen each one.",
};

const GITHUB = "https://github.com/HamRadio08/integrity-core/blob/main";

const SEVERITY: Record<Severity, { icon: typeof CircleAlert; label: string; className: string }> = {
  critical: { icon: OctagonAlert, label: "critical", className: "text-rose-400" },
  warning: { icon: CircleAlert, label: "warning", className: "text-amber-400" },
  ok: { icon: CircleCheck, label: "by design", className: "text-emerald-400" },
};

function verdictClass(verdict: Verdict): string {
  if (verdict === "PASS") return "text-emerald-400";
  if (verdict === "FAIL") return "text-rose-400";
  return "text-amber-400";
}

function Reopen({ condition }: { condition: string }) {
  return (
    <div className="mt-4 rounded-lg bg-muted/40 px-3 py-2.5">
      <div className="text-[11px] tracking-wide text-muted-foreground uppercase">
        Reopens if
      </div>
      <p className="mt-1 text-xs text-foreground">{condition}</p>
    </div>
  );
}

function integer(value: number): string {
  return value.toLocaleString("en-US");
}

export default function EvidencePage() {
  const ledger = loadLedger();

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Back to the desk
      </Link>

      <header className="mt-6">
        <h1 className="font-heading text-3xl">Evidence ledger</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Every preregistered evaluation and adversarial audit this author has run, with what was
          measured, what the gate was, and what would reopen the verdict. Most of these are
          failures. That is the point: a ledger that only records wins is a brochure.
        </p>
        <p className="mt-4 max-w-2xl rounded-lg bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
          {ledger.note}
        </p>
        <p className="mt-3 font-mono text-[11px] text-muted-foreground">
          schemaVersion {ledger.schemaVersion} · generated {ledger.generatedAt}
        </p>
      </header>

      {/* ---- Preregistered gates ---------------------------------------- */}
      <section className="mt-12">
        <h2 className="font-heading text-xl">Preregistered gates</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Threshold fixed before the measurement, verdict read off the interval.
        </p>

        <div className="mt-6 space-y-6">
          {ledger.gates.map((entry) => (
            <Card key={entry.id}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>{entry.title}</CardTitle>
                    <CardDescription className="mt-1">{entry.question}</CardDescription>
                  </div>
                  <Badge variant="outline" className={verdictClass(entry.verdict)}>
                    {entry.verdict}
                  </Badge>
                </div>
                <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                  {entry.system}
                  {entry.preregisteredAt ? ` · preregistered ${entry.preregisteredAt}` : ""} ·
                  measured {entry.measuredAt} · runner errors {entry.runnerErrors}
                </p>
              </CardHeader>
              <CardContent>
                <GateChart entry={entry} />

                <div className="mt-6 space-y-3 text-sm">
                  <p>
                    <span className="text-muted-foreground">Consequence — </span>
                    {entry.consequence}
                  </p>
                  <p className="text-muted-foreground">
                    <span className="text-foreground">What it actually taught — </span>
                    {entry.lesson}
                  </p>
                </div>

                <Reopen condition={entry.reopenCondition} />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ---- Measurement corrections ------------------------------------ */}
      <section className="mt-12">
        <h2 className="font-heading text-xl">Measurement corrections</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Cases where the instrument, not the system, was the thing that was wrong.
        </p>

        <div className="mt-6 space-y-6">
          {ledger.corrections.map((entry) => (
            <Card key={entry.id}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>{entry.title}</CardTitle>
                    <CardDescription className="mt-1">{entry.question}</CardDescription>
                  </div>
                  <Badge variant="outline" className={verdictClass(entry.verdict)}>
                    {entry.verdict}
                  </Badge>
                </div>
                <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                  {entry.system} · measured {entry.measuredAt} · n = {integer(entry.sample.n)} over{" "}
                  {entry.sample.days} days
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <div className="text-xs text-muted-foreground">{entry.before.label}</div>
                    <div className="mt-1 font-mono text-2xl text-muted-foreground line-through decoration-rose-400/60 decoration-2">
                      {integer(entry.before.value)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">{entry.after.label}</div>
                    <div className="mt-1 font-mono text-2xl text-foreground">
                      {integer(entry.after.value)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Inflation factor</div>
                    <div className="mt-1 font-mono text-2xl text-primary">
                      {integer(entry.factor)}&times;
                    </div>
                  </div>
                </div>

                <div className="mt-5 border-t border-border pt-4">
                  <div className="text-xs text-muted-foreground">
                    Share of all entry blocks attributed to this gate
                  </div>
                  <div className="mt-2 flex items-center gap-3 font-mono text-sm">
                    <span className="text-muted-foreground line-through">
                      ~{Math.round(entry.shareBefore * 100)}%
                    </span>
                    <span className="text-muted-foreground">&rarr;</span>
                    <span className="text-foreground">~{Math.round(entry.shareAfter * 100)}%</span>
                  </div>
                </div>

                <p className="mt-5 text-sm text-muted-foreground">
                  <span className="text-foreground">What it actually taught — </span>
                  {entry.lesson}
                </p>

                <Reopen condition={entry.reopenCondition} />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ---- Adversarial audits ----------------------------------------- */}
      <section className="mt-12">
        <h2 className="font-heading text-xl">Adversarial audits</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          One question, asked of three systems: did the check actually run, and could its output
          have been different?
        </p>

        <div className="mt-6 space-y-6">
          {ledger.audits.map((entry) => (
            <Card key={entry.id}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>{entry.title}</CardTitle>
                    <CardDescription className="mt-1">{entry.method}</CardDescription>
                  </div>
                  <Badge variant="outline" className={verdictClass(entry.verdict)}>
                    {entry.verdict}
                  </Badge>
                </div>
                <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                  {entry.system} · measured {entry.measuredAt}
                </p>
              </CardHeader>
              <CardContent>
                <p className="rounded-lg bg-muted/40 px-3 py-2.5 text-sm">{entry.headline}</p>

                <div className="mt-5 overflow-x-auto">
                  <table className="w-full min-w-[38rem] border-collapse text-left text-xs">
                    <caption className="sr-only">Findings for {entry.title}</caption>
                    <thead className="text-muted-foreground">
                      <tr className="border-b border-border">
                        <th scope="col" className="py-2 pr-3 font-normal">Ref</th>
                        <th scope="col" className="py-2 pr-3 font-normal">Severity</th>
                        <th scope="col" className="py-2 pr-3 font-normal">Finding</th>
                        <th scope="col" className="py-2 font-normal">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entry.findings.map((finding) => {
                        const meta = SEVERITY[finding.severity];
                        const Icon = meta.icon;
                        return (
                          <tr key={finding.ref} className="border-b border-border/50 align-top">
                            <td className="py-2.5 pr-3 font-mono">{finding.ref}</td>
                            <td className="py-2.5 pr-3">
                              <span className={cn("inline-flex items-center gap-1.5", meta.className)}>
                                <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                                {meta.label}
                              </span>
                            </td>
                            <td className="py-2.5 pr-3 text-muted-foreground">{finding.summary}</td>
                            <td className="py-2.5 whitespace-nowrap">{finding.status}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="mt-5">
                  <div className="text-[11px] tracking-wide text-muted-foreground uppercase">
                    What shipped
                  </div>
                  <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                    {entry.shipped.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span aria-hidden="true" className="text-primary">&rarr;</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {entry.caseStudy || entry.link ? (
                  <div className="mt-5 flex flex-wrap gap-4 text-xs">
                    {entry.caseStudy ? (
                      <a
                        className="text-primary underline-offset-4 hover:underline"
                        href={`${GITHUB}/${entry.caseStudy}`}
                      >
                        Read the case study
                      </a>
                    ) : null}
                    {entry.link ? (
                      <a
                        className="text-primary underline-offset-4 hover:underline"
                        href={entry.link}
                      >
                        The pull request that closed it
                      </a>
                    ) : null}
                  </div>
                ) : null}

                <Reopen condition={entry.reopenCondition} />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
        <p>
          Nothing on this page is a trading performance claim. What this desk cannot do is written
          down in{" "}
          <a className="text-primary underline-offset-4 hover:underline" href={`${GITHUB}/docs/limitations.md`}>
            docs/limitations.md
          </a>
          , including the fact that its digests are unsigned.
        </p>
      </footer>
    </main>
  );
}
