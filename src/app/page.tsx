import { Dashboard } from "@/components/audit/dashboard";
import { bootToken, isTamperEnabled } from "@/lib/audit/guard";
import { fetchLiveDesk } from "@/lib/audit/live";
import { getActiveBundle, publicRun } from "@/lib/audit/run";

export const dynamic = "force-dynamic";

export default async function Home() {
  const run = publicRun(getActiveBundle());
  const live = await fetchLiveDesk().catch(() => null);
  return (
    <Dashboard
      initial={run}
      initialLive={live}
      tamperEnabled={isTamperEnabled()}
      bootToken={bootToken()}
    />
  );
}
