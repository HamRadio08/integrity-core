import type { LiveTape } from "./market";
import { setSpotOverlay } from "./market";
import { overlayFromLiveSpots, type LiveDesk } from "./live";
import { DEMO_SEED, publicRun, replaceActiveBundle } from "./run";
import type { AuditBundle, AuditRun } from "./types";

export function applyLiveOverlay(live: Pick<LiveDesk, "spots">): LiveTape["spot"] {
  const overlay = overlayFromLiveSpots(live.spots);
  if (overlay) setSpotOverlay(overlay);
  return overlay;
}

export function resealFromOverlay(seed = DEMO_SEED): { bundle: AuditBundle; run: AuditRun } {
  const bundle = replaceActiveBundle(seed);
  return { bundle, run: publicRun(bundle) };
}

export function syncSealedBook(live: LiveDesk, seed = DEMO_SEED): { bundle: AuditBundle; run: AuditRun } {
  applyLiveOverlay(live);
  return resealFromOverlay(seed);
}
