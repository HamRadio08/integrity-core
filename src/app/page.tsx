import { Dashboard } from "@/components/audit/dashboard";
import { bootToken, isTamperEnabled } from "@/lib/audit/guard";
import { getActiveBundle, publicRun } from "@/lib/audit/run";

export const dynamic = "force-dynamic";

export default function Home() {
  const run = publicRun(getActiveBundle());
  return <Dashboard initial={run} tamperEnabled={isTamperEnabled()} bootToken={bootToken()} />;
}
