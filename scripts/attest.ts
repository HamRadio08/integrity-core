import { getActiveBundle, summarizeRun } from "../src/lib/audit/run.ts";

const bundle = getActiveBundle();
const summary = summarizeRun(bundle);
console.log(JSON.stringify(summary, null, 2));
console.log("\nFUNNEL");
for (const row of bundle.funnel) {
  console.log(
    `${row.gateId.padEnd(16)} ${String(row.count).padStart(3)}  ${(row.share * 100).toFixed(1).padStart(5)}%  ${row.inBand ? "in-band" : "OFF"}  ${row.role}`,
  );
}
console.log("\nBTC DAILY");
if (bundle.featured) {
  for (const ev of bundle.featured.daily.evaluations) {
    console.log(ev.gateId, ev.status, ev.evidence.reason);
  }
  console.log("\nBTC HOURLY");
  if (bundle.featured.hourly) {
    for (const ev of bundle.featured.hourly.evaluations) {
      console.log(ev.gateId, ev.status, ev.evidence.reason);
    }
  }
  console.log("\nPUMP", bundle.featured.pump);
}
console.log("\nCHECKS");
for (const check of bundle.integrity.checks) {
  console.log(check.severity, check.id, check.detail);
}
