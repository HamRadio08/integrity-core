# Public Repo Template — Structure Guide

This is a template for building a **public, hiring/collaboration-safe** version of this
repository. It is not itself a public doc — it's the checklist and skeleton you use to build
one. Read it alongside `RISK_FRAMEWORK_EXAMPLE.md`, the deep-dive companion for the integrity
guarantees described below.

This repo is a forensic attestation desk, not a strategy engine: it doesn't decide what to
trade, it proves *that a sequential gate chain was applied honestly, in order, to real market
data.* The public version should show how that proof works without exposing the specific gate
weights, band widths, or universe-selection criteria that make the desk's own findings
meaningful.

## What goes in

| Directory | Contents | Rule of thumb |
|---|---|---|
| `docs/` | Gate-chain architecture, the hash-chain/replay guarantee, the API-hardening model, decision-record examples | Explain *how* attestation and replay work, not the exact band values used to judge live drift |
| `infra/` | CI pipeline skeleton, deployment shape (where the desk runs, what it reads), env-variable *names* (never values) | Enough to show the system is operated seriously; no real infra hostnames or tokens |
| `examples/` | `strategy-config.yaml`-equivalent (a dummy gate-chain config), a synthetic tape (`live-tape.json` shape with fabricated OHLC), a minimal replay script | Runnable scaffolding that reproduces the *mechanism*, not the real book |

## What stays out

- **Gate weights and band values.** The design-contract shape (how many gates, what each one
  checks conceptually) is public; the specific numeric bands used to call a live book "in
  contract" vs. "drifted" are not — those are what the desk is actually calibrated against.
- **The real universe.** Which 117 names are in the book, and any liquidity/tier cutoffs used to
  select them, stays out. A synthetic universe of made-up tickers is enough to demonstrate the
  screen.
- **Real sealed tape data.** No committed `live-tape.json` snapshots from actual runs — replace
  with a generated synthetic tape in `examples/`.
- **API tokens, rate-budget internals tied to a real deployment**, or anything that would let a
  reader target the real `/api/audit/*` endpoints.
- **Anything from a real hash-chain record** — even a single real sealed digest can, combined
  with other public info, help someone infer real inputs. Use fabricated example digests only.

## Recommended structure

```
docs/
  README.md                      # architecture overview (this file, renamed)
  risk-framework.md              # RISK_FRAMEWORK_EXAMPLE.md, renamed
  replay-and-verification.md     # how sealed bars + config + prior link reproduce a digest
  governance.md                  # what's protected, what requires review, API hardening model
infra/
  ci-pipeline.md                 # test/attest stages, what blocks a merge
  deployment-topology.md         # where the desk runs, what it reads, process boundaries
examples/
  gate-config.yaml               # shape of a gate-chain config, dummy weights/bands throughout
  synthetic-tape.json            # fabricated OHLC in the live-tape.json shape
  replay.py                      # minimal script: seal synthetic tape, verify the digest
```

### Organized by: architecture → backtest (replay/verification) → governance → build

This repo doesn't run a backtest in the strategy-tuning sense — its equivalent validation step
is **replay**: re-running sealed bars, config, and the prior chain link to prove the same digest
comes out. Walk the reader through the same four layers, replay standing in for backtest:

1. **Architecture** — the gate chain (`tier_reject → trend_sep → adx → volume_confirm →
   accel_gate`), why it's a short-circuit AND-chain, and why reordering changes attribution but
   never selection. Diagrams earn their keep here; this layer is shapes and flow, not values.
2. **Replay / verification** — how a sealed record is checked: replay sealed bars + config +
   prior link, compare the reproduced digest against the recorded one. This is where you
   demonstrate the desk can't be talked into agreeing with a doctored record, without revealing
   what a real doctored attempt looks like.
3. **Governance** — the request-boundary guards (`Sec-Fetch-Site`/`Origin` checks, per-endpoint
   rate budgets, the 8 MB payload cap on `/api/audit/verify`), the optional bearer-token gate,
   and the role-contract band model (a live book sitting outside its band is a *watch*, not
   automatically a *broken seal*). This is usually the section a hiring reader cares about most,
   and it's cheap to make fully public since the guard *model* isn't the sensitive part.
4. **Build** — `npm install && npm run tape && npm run attest && npm test && npm run dev`
   against the synthetic example data. Its only job is proving the repo runs end to end.

## Risk framework: keep the principle, hide the threshold

The public risk-framework doc should describe the fail-closed mechanisms — hash-chaining,
replay verification, request-boundary guards, drift-vs-tamper distinction — without publishing
the actual band widths that decide when a live book is flagged. See `RISK_FRAMEWORK_EXAMPLE.md`:
it names every mechanism concretely and leaves every calibrated number as a placeholder.

## Dialing infra detail up or down

- **Hiring / portfolio review** — dial it down. A paragraph plus a diagram of the gate chain and
  the hash-chain guarantee is enough; skip CI runner topology and pipeline YAML.
- **Engineering deep-dive** — dial it up. Include the request-boundary guard stack, the
  role-contract band model, and the replay algorithm in more detail — still no real bands,
  tokens, or sealed data.

Default to the hiring-audience version unless you know the reader wants the deeper cut.

## Optional additions (public-safe, worth considering)

- **Postmortem examples.** A redacted write-up of a real drift event — what the bands flagged,
  how the desk distinguished "watch" from "broken seal," what changed after — with real numbers
  swapped for illustrative ones.
- **Monitoring-alert taxonomy.** The categories the desk can raise (gate-fail attribution,
  role-contract drift, tamper-lab findings, request-boundary rejections) and how they're
  prioritized.
- **Incident timeline template.** A blank "detected → contained → resolved → follow-up"
  template, filled with a synthetic incident if you want a worked example.

## Pre-publish checklist

- [ ] `grep -riE "api[_-]?key|secret|password|token"` across the public branch — zero hits
      outside variable *names*
- [ ] No real gate bands, universe list, or sealed tape data anywhere (docs, example configs,
      code comments, fixtures)
- [ ] No real hash-chain digests or attestation records
- [ ] `examples/` runs standalone against synthetic tape data — no dependency on this repo's
      real data sources or endpoints
- [ ] A second person (not the author) reads it cold and confirms they can't reconstruct the
      real gate calibration from what's there
