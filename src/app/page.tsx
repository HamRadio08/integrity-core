import { Dashboard } from "@/components/audit/dashboard";
import { bootToken, isTamperEnabled } from "@/lib/audit/guard";
import { fetchLiveDesk } from "@/lib/audit/live";
import { getActiveBundle, publicRun } from "@/lib/audit/run";
import { syncSealedBook } from "@/lib/audit/sync";
import { healthPayload } from "@/lib/box/host";
import { tickActivePaper } from "@/lib/paper";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export default async function Home() {
  const live = await fetchLiveDesk().catch(() => null);
  const { bundle, run } = live ? syncSealedBook(live) : { bundle: getActiveBundle(), run: publicRun(getActiveBundle()) };
  const paper = tickActivePaper(bundle, { force: true });
  return (
    <Dashboard
      initial={run}
      initialLive={live}
      initialPaper={paper}
      initialHealth={healthPayload()}
      tamperEnabled={isTamperEnabled()}
      bootToken={bootToken()}
    />
  );
}
