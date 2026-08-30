import { Dashboard } from "@/components/audit/dashboard";
import { bootToken, isTamperEnabled } from "@/lib/audit/guard";
import { fetchLiveDesk } from "@/lib/audit/live";
import { getActiveBundle, publicRun } from "@/lib/audit/run";
import { tickActivePaper } from "@/lib/paper";

export const dynamic = "force-dynamic";

export default async function Home() {
  const bundle = getActiveBundle();
  const run = publicRun(bundle);
  const paper = tickActivePaper(bundle, { force: true });
  const live = await fetchLiveDesk().catch(() => null);
  return (
    <Dashboard
      initial={run}
      initialLive={live}
      initialPaper={paper}
      tamperEnabled={isTamperEnabled()}
      bootToken={bootToken()}
    />
  );
}
