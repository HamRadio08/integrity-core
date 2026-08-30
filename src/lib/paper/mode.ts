import { PAPER_MODE, PAPER_VENUE, type PaperFill } from "./types";

// Live routing is not implemented and must stay that way. A mis-set env var
// is a configuration error, not a switch that turns this book into a broker.

export function executionMode(): typeof PAPER_MODE {
  const raw = process.env.TRADING_MODE?.trim().toLowerCase();
  if (raw && raw !== PAPER_MODE) {
    throw new Error(
      `Live execution is disabled. TRADING_MODE=${raw} is refused; this book only accepts paper fills.`,
    );
  }
  return PAPER_MODE;
}

export function assertPaperFill(fill: Pick<PaperFill, "venue">): void {
  executionMode();
  if (fill.venue !== PAPER_VENUE) {
    throw new Error(`Refusing a non-paper fill (venue=${fill.venue}).`);
  }
}
