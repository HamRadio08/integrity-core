"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatNumber } from "@/lib/audit/format";
import type { Pred15Card, Strip } from "@/lib/pred15/sigma";
import type { KalshiQuote } from "@/lib/pred15/kalshi";

const STRIP_VARIANT: Record<Strip, "default" | "secondary" | "destructive" | "outline"> = {
  NO_BET: "outline",
  SETTLE_WATCH: "secondary",
  ALIGN_OVER: "default",
  ALIGN_UNDER: "default",
  FIGHT_OVER: "secondary",
  FIGHT_UNDER: "secondary",
};

export function Pred15Panel({
  bootToken,
  liveBtc,
}: {
  bootToken?: string;
  liveBtc?: number | null;
}) {
  const [strike, setStrike] = useState("");
  const [venueOverPct, setVenueOverPct] = useState("");
  const [payload, setPayload] = useState<{
    card: Pred15Card;
    kalshi: KalshiQuote;
    kalshiKeyReady: boolean;
    spot: number;
    error?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      const strikeN = Number(strike);
      if (Number.isFinite(strikeN) && strikeN > 0) params.set("strike", String(strikeN));
      const venueN = Number(venueOverPct);
      if (Number.isFinite(venueN) && venueN >= 0) params.set("venueOver", String(venueN / 100));
      const headers = new Headers();
      if (bootToken) headers.set("x-audit-boot", bootToken);
      const response = await fetch(`/api/pred15/card?${params.toString()}`, { headers });
      const body = await response.json();
      if (!response.ok && !body.card) {
        throw new Error(body.error ?? "PRED15 card failed.");
      }
      setPayload({
        card: body.card,
        kalshi: body.kalshi,
        kalshiKeyReady: Boolean(body.kalshiKeyReady),
        spot: body.spot ?? body.card?.spot,
        error: body.error,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "PRED15 card failed.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    // The first poll is scheduled rather than called inline: refresh() sets busy
    // state before its first await, and doing that synchronously in an effect
    // body cascades renders. Scheduling it keeps the mount fetch and the interval
    // on the same path, and the timeout is cancelled on unmount like the interval.
    const kickoff = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 20_000);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(timer);
    };
    // Manual fields are read at click/interval time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootToken]);

  const card = payload?.card;
  const kalshi = payload?.kalshi;

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            15-minute BTC review
            <Badge variant="outline">PAPER ONLY</Badge>
            <Badge variant="outline">no orders</Badge>
          </CardTitle>
          <CardDescription>
            Human cockpit for Coinbase Predict / Kalshi KXBTC15M. Coinbase last is a proxy.
            Settlement is the BRTI 60-second average. Default strip is NO BET.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Strike override</span>
              <Input
                value={strike}
                onChange={(event) => setStrike(event.target.value)}
                placeholder={kalshi?.strike ? String(kalshi.strike) : "78,581.31"}
                className="w-40"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Venue Over %</span>
              <Input
                value={venueOverPct}
                onChange={(event) => setVenueOverPct(event.target.value)}
                placeholder={kalshi?.yesAsk != null ? String(Math.round(kalshi.yesAsk * 100)) : "22"}
                className="w-28"
              />
            </label>
            <div className="flex items-end">
              <Button type="button" size="sm" onClick={() => void refresh()} disabled={busy}>
                {busy ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
                Grade window
              </Button>
            </div>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {card ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={STRIP_VARIANT[card.strip]}>{card.strip}</Badge>
                {card.settleBand ? <Badge variant="secondary">SETTLE BAND</Badge> : <Badge variant="outline">PATH</Badge>}
                <span className="font-mono text-xs text-muted-foreground">
                  {Math.floor(card.secondsLeft / 60)}:{String(Math.floor(card.secondsLeft % 60)).padStart(2, "0")} left
                </span>
              </div>
              <p className="text-sm">{card.reason}</p>
              <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <Fact label="Spot (proxy)" value={`$${formatNumber(card.spot, 2)}`} />
                <Fact label="Strike" value={`$${formatNumber(card.strike, 2)}`} />
                <Fact label="Gap" value={`${card.gap >= 0 ? "+" : ""}$${formatNumber(card.gap, 2)}`} />
                <Fact
                  label="z band"
                  value={`${card.zLo.toFixed(2)}σ … ${card.zHi.toFixed(2)}σ`}
                />
                <Fact
                  label="Φ Over"
                  value={`${(card.pOverLo * 100).toFixed(0)}–${(card.pOverHi * 100).toFixed(0)}%`}
                />
                <Fact
                  label="Venue Over"
                  value={card.venueOver == null ? "—" : `${(card.venueOver * 100).toFixed(0)}%`}
                />
                <Fact label="σ stub" value={`${(card.sigmaLo * 100).toFixed(0)}–${(card.sigmaHi * 100).toFixed(0)}%`} />
                <Fact label="Oracle" value="BRTI 60s avg" />
              </dl>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {liveBtc ? `Live BTC proxy $${formatNumber(liveBtc, 0)}. Waiting on strike.` : "Waiting on card."}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kalshi feed</CardTitle>
          <CardDescription>Public GET. Signed key is optional and never places an order.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Fact label="Status" value={kalshi?.available ? "live public book" : kalshi?.error ?? "unavailable"} />
          <Fact label="Ticker" value={kalshi?.ticker ?? "—"} />
          <Fact label="Kalshi strike" value={kalshi?.strike ? `$${formatNumber(kalshi.strike, 2)}` : "—"} />
          <Fact
            label="Yes bid / ask"
            value={
              kalshi?.yesBid == null && kalshi?.yesAsk == null
                ? "—"
                : `${kalshi?.yesBid != null ? `${(kalshi.yesBid * 100).toFixed(0)}¢` : "—"} / ${
                    kalshi?.yesAsk != null ? `${(kalshi.yesAsk * 100).toFixed(0)}¢` : "—"
                  }`
            }
          />
          <Fact label="Signed key" value={payload?.kalshiKeyReady ? "present (read-ready)" : "not configured"} />
          <p className="pt-2 text-xs text-muted-foreground">
            If Kalshi is blocked, type strike and venue Over from the Coinbase screen. Compare Φ to the
            <em> fill</em>, not just the button.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-mono text-xs sm:text-sm">{value}</div>
    </div>
  );
}
