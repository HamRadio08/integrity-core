import { STACK_CONFIG } from "./config";
import { buildDesk } from "./derived";
import { sealUniverse } from "./engine";
import { GENESIS } from "./hash";
import { attestRun, buildFunnel, verifyIntegrity } from "./invariants";
import {
  btcHourlyCandidate,
  buildLiveUniverse,
  loadTape,
  measurePump,
  sealFeatured,
  tapeInfo,
} from "./market";
import type { AuditBundle, StackConfig } from "./types";

export const DEMO_SEED = 20260822;

export function buildAttestedRun(
  seed = DEMO_SEED,
  config: StackConfig = STACK_CONFIG,
): AuditBundle {
  const tape = loadTape();
  const startedAt = tape.fetchedAt;
  const candidates = buildLiveUniverse(seed, config.barCount);
  const { records, barsByCandidate } = sealUniverse(candidates, config, GENESIS);
  const featuredSealed = sealFeatured(tape);
  if (featuredSealed.hourlyBars) {
    barsByCandidate["C-BTC-1H"] = featuredSealed.hourlyBars;
  }
  barsByCandidate["C-BTC-1D"] = featuredSealed.dailyBars;

  const hourlyCandidate = btcHourlyCandidate(tape);
  let hourlyNote: string | null = null;
  if (featuredSealed.hourly) {
    const volume = featuredSealed.hourly.evaluations.find((row) => row.gateId === "volume_confirm");
    const lastVolume = volume?.evidence.metrics.lastVolume;
    if (typeof lastVolume === "number" && lastVolume <= 0) {
      hourlyNote =
        "Hourly venue volume on this feed is empty or incomplete. Daily participation is the binding volume screen.";
    }
    if (hourlyCandidate && hourlyCandidate.bars.every((bar) => bar.volume === 0)) {
      hourlyNote =
        "Hourly venue volume on this feed is empty. Daily participation is the binding volume screen.";
    }
  }

  const attested = attestRun({
    records,
    config,
    seed,
    startedAt,
    genesisDigest: GENESIS,
  });
  const integrity = verifyIntegrity({
    records,
    config,
    barsByCandidate,
    genesisDigest: GENESIS,
    expectedConfigDigest: attested.configDigest,
    expectedAttestation: attested.attestationDigest,
    seed,
    startedAt,
  });

  const funnel = buildFunnel(records);
  const tapeMeta = tapeInfo(tape);
  const featured = {
    daily: featuredSealed.daily,
    hourly: featuredSealed.hourly,
    hourlyNote,
    pump: measurePump(tape),
  };
  const desk = buildDesk({ records, funnel, tape: tapeMeta, integrity });

  return {
    protocol: "stack-attestation/v1",
    startedAt,
    seed,
    config,
    records,
    barsByCandidate,
    funnel,
    tape: tapeMeta,
    featured,
    integrity,
    desk,
    ...attested,
  };
}

export function summarizeRun(run: AuditBundle) {
  return {
    runId: run.runId,
    seed: run.seed,
    startedAt: run.startedAt,
    candidateCount: run.candidateCount,
    passedCount: run.passedCount,
    killedCount: run.killedCount,
    chainHead: run.chainHead,
    attestationDigest: run.attestationDigest,
    configDigest: run.configDigest,
    integrity: run.integrity,
    funnel: run.funnel,
    tape: run.tape,
    featured: run.featured
      ? {
          pump: run.featured.pump,
          dailyKill: run.featured.daily.killGate,
          dailyOutcome: run.featured.daily.outcome,
          hourlyKill: run.featured.hourly?.killGate ?? null,
          hourlyOutcome: run.featured.hourly?.outcome ?? null,
        }
      : null,
  };
}

let activeBundle: AuditBundle | null = null;

export function getDemoBundle(): AuditBundle {
  return getActiveBundle();
}

export function getActiveBundle(): AuditBundle {
  if (!activeBundle) activeBundle = buildAttestedRun(DEMO_SEED);
  return activeBundle;
}

export function replaceActiveBundle(seed: number): AuditBundle {
  activeBundle = buildAttestedRun(seed);
  return activeBundle;
}

export function publicRun(bundle: AuditBundle) {
  const { barsByCandidate: _bars, ...run } = bundle;
  return run;
}
